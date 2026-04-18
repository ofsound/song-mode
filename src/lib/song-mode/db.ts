import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { hasRichTextContent, normalizeRichText } from "./rich-text";
import {
	type Annotation,
	type AudioFileRecord,
	createEmptySettings,
	type RichTextDoc,
	type Song,
	type SongModeSettings,
	type SongModeSnapshot,
} from "./types";

interface SongModeDB extends DBSchema {
	songs: {
		key: string;
		value: Song;
	};
	audioFiles: {
		key: string;
		value: AudioFileRecord;
		indexes: { songId: string };
	};
	annotations: {
		key: string;
		value: Annotation;
		indexes: {
			songId: string;
			audioFileId: string;
		};
	};
	blobs: {
		key: string;
		value: Blob;
	};
	settings: {
		key: string;
		value: SongModeSettings;
	};
}

const DB_NAME = "song-mode";
const DB_VERSION = 2;
const SETTINGS_KEY = "app-settings";

let dbPromise: Promise<IDBPDatabase<SongModeDB>> | null = null;

type LegacyAudioFileRecord = AudioFileRecord & {
	masteringNote?: RichTextDoc | null;
};

function getDb(): Promise<IDBPDatabase<SongModeDB>> {
	dbPromise ??= openDB<SongModeDB>(DB_NAME, DB_VERSION, {
		async upgrade(database, oldVersion, _newVersion, transaction) {
			if (!database.objectStoreNames.contains("songs")) {
				database.createObjectStore("songs", { keyPath: "id" });
			}

			if (!database.objectStoreNames.contains("audioFiles")) {
				const audioFilesStore = database.createObjectStore("audioFiles", {
					keyPath: "id",
				});
				audioFilesStore.createIndex("songId", "songId");
			}

			if (!database.objectStoreNames.contains("annotations")) {
				const annotationsStore = database.createObjectStore("annotations", {
					keyPath: "id",
				});
				annotationsStore.createIndex("songId", "songId");
				annotationsStore.createIndex("audioFileId", "audioFileId");
			}

			if (!database.objectStoreNames.contains("blobs")) {
				database.createObjectStore("blobs");
			}

			if (!database.objectStoreNames.contains("settings")) {
				database.createObjectStore("settings");
			}

			if (oldVersion < 2) {
				const audioFilesStore = transaction.objectStore("audioFiles");
				const audioFiles = await audioFilesStore.getAll();

				await Promise.all(
					audioFiles.map(async (audioFile) => {
						const legacyAudioFile = audioFile as LegacyAudioFileRecord;
						if (typeof legacyAudioFile.masteringNote === "undefined") {
							return;
						}

						const { masteringNote, ...restAudioFile } = legacyAudioFile;
						await audioFilesStore.put({
							...restAudioFile,
							notes: mergeAudioFileNotes(legacyAudioFile.notes, masteringNote),
						});
					}),
				);
			}
		},
	});

	return dbPromise;
}

export async function loadSnapshot(): Promise<SongModeSnapshot> {
	const db = await getDb();
	const [songs, audioFiles, annotations, blobKeys, settings] =
		await Promise.all([
			db.getAll("songs"),
			db.getAll("audioFiles"),
			db.getAll("annotations"),
			db.getAllKeys("blobs"),
			db.get("settings", SETTINGS_KEY),
		]);

	const blobEntries = await Promise.all(
		blobKeys
			.filter((key): key is string => typeof key === "string")
			.map(async (key) => [key, await db.get("blobs", key)] as const),
	);

	return {
		songs,
		audioFiles,
		annotations,
		blobsByAudioId: Object.fromEntries(
			blobEntries.filter(
				(entry): entry is [string, Blob] => entry[1] instanceof Blob,
			),
		),
		settings: settings ?? createEmptySettings(),
	};
}

export async function saveSong(song: Song): Promise<void> {
	const db = await getDb();
	await db.put("songs", song);
}

export async function saveAudioFile(audioFile: AudioFileRecord): Promise<void> {
	const db = await getDb();
	await db.put("audioFiles", audioFile);
}

export async function saveAudioBlob(
	audioFileId: string,
	blob: Blob,
): Promise<void> {
	const db = await getDb();
	await db.put("blobs", blob, audioFileId);
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
	const db = await getDb();
	await db.put("annotations", annotation);
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
	const db = await getDb();
	await db.delete("annotations", annotationId);
}

export async function deleteSong(songId: string): Promise<void> {
	const db = await getDb();
	await db.delete("songs", songId);
}

export async function deleteAudioFile(audioFileId: string): Promise<void> {
	const db = await getDb();
	await db.delete("audioFiles", audioFileId);
}

export async function deleteAudioBlob(audioFileId: string): Promise<void> {
	const db = await getDb();
	await db.delete("blobs", audioFileId);
}

export async function saveSettings(settings: SongModeSettings): Promise<void> {
	const db = await getDb();
	await db.put("settings", settings, SETTINGS_KEY);
}

function mergeAudioFileNotes(
	notes?: RichTextDoc | null,
	legacyMasteringNote?: RichTextDoc | null,
): RichTextDoc {
	const normalizedNotes = normalizeRichText(notes);
	const normalizedLegacyMastering = normalizeRichText(legacyMasteringNote);

	if (!hasRichTextContent(normalizedNotes)) {
		return normalizedLegacyMastering;
	}

	if (!hasRichTextContent(normalizedLegacyMastering)) {
		return normalizedNotes;
	}

	return {
		type: "doc",
		content: [
			...(normalizedNotes.content ?? []),
			...(normalizedLegacyMastering.content ?? []),
		],
	};
}
