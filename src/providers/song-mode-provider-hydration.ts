import {
	hasRichTextContent,
	normalizeRichText,
} from "#/lib/song-mode/rich-text";
import {
	type AudioFileRecord,
	createEmptySettings,
	type RichTextDoc,
	type SongModeSnapshot,
} from "#/lib/song-mode/types";
import {
	generateWaveformFromFile,
	hasRenderableWaveform,
	normalizeVolumeDb,
	normalizeWaveformData,
} from "#/lib/song-mode/waveform";

export const EMPTY_SNAPSHOT: SongModeSnapshot = {
	songs: [],
	audioFiles: [],
	annotations: [],
	blobsByAudioId: {},
	settings: createEmptySettings(),
};

type LegacyAudioFileRecord = AudioFileRecord & {
	masteringNote?: RichTextDoc | null;
};

export async function normalizeLoadedSnapshot(
	loadedSnapshot: SongModeSnapshot,
) {
	const audioFilesToPersist: AudioFileRecord[] = [];
	const audioFiles = await Promise.all(
		loadedSnapshot.audioFiles.map(async (audioFile) => {
			const legacyAudioFile = audioFile as LegacyAudioFileRecord;
			const { masteringNote, ...restAudioFile } = legacyAudioFile;
			const normalizedAudioFile: AudioFileRecord = {
				...restAudioFile,
				notes: mergeAudioFileNotes(legacyAudioFile.notes, masteringNote),
				volumeDb: normalizeVolumeDb(audioFile.volumeDb),
				waveform: normalizeWaveformData(
					audioFile.waveform,
					audioFile.durationMs,
				),
			};
			const hadLegacyMasteringNote = typeof masteringNote !== "undefined";

			if (hasRenderableWaveform(audioFile.waveform)) {
				if (hadLegacyMasteringNote) {
					audioFilesToPersist.push(normalizedAudioFile);
				}
				return normalizedAudioFile;
			}

			const blob = loadedSnapshot.blobsByAudioId[audioFile.id];
			if (!(blob instanceof Blob)) {
				if (hadLegacyMasteringNote) {
					audioFilesToPersist.push(normalizedAudioFile);
				}
				return normalizedAudioFile;
			}

			try {
				const repairedWaveform = await generateWaveformFromFile(blob);
				const repairedAudioFile: AudioFileRecord = {
					...normalizedAudioFile,
					durationMs: repairedWaveform.durationMs,
					waveform: repairedWaveform,
				};
				audioFilesToPersist.push(repairedAudioFile);
				return repairedAudioFile;
			} catch {
				return normalizedAudioFile;
			}
		}),
	);

	return {
		audioFilesToPersist,
		normalizedSnapshot: {
			...loadedSnapshot,
			songs: loadedSnapshot.songs.map((song) => ({
				id: song.id,
				title: song.title,
				artist: song.artist,
				project: song.project,
				generalNotes: normalizeRichText(song.generalNotes),
				audioFileOrder: song.audioFileOrder,
				createdAt: song.createdAt,
				updatedAt: song.updatedAt,
			})),
			audioFiles,
			annotations: loadedSnapshot.annotations.map((annotation) => ({
				...annotation,
				body: normalizeRichText(annotation.body),
			})),
			settings: loadedSnapshot.settings ?? createEmptySettings(),
		},
	};
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
