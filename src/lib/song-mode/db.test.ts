import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "./rich-text";
import type {
	Annotation,
	AudioFileRecord,
	Song,
	SongModeSettings,
} from "./types";

const DB_NAME = "song-mode";

function deleteSongModeDatabase() {
	return new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase(DB_NAME);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		request.onblocked = () =>
			reject(new Error("Song Mode test database is blocked."));
	});
}

async function loadDbModule() {
	return import("./db");
}

function createSong(overrides: Partial<Song> = {}): Song {
	return {
		id: "song-1",
		title: "Song",
		artist: "Artist",
		project: "Project",
		generalNotes: EMPTY_RICH_TEXT,
		audioFileOrder: ["file-1"],
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

function createAudioFile(
	overrides: Partial<AudioFileRecord> = {},
): AudioFileRecord {
	return {
		id: "file-1",
		songId: "song-1",
		title: "Take 1",
		notes: EMPTY_RICH_TEXT,
		volumeDb: 0,
		durationMs: 1000,
		waveform: {
			peaks: [0.2],
			peakCount: 1,
			durationMs: 1000,
			sampleRate: 44100,
		},
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

function createAnnotation(overrides: Partial<Annotation> = {}): Annotation {
	return {
		id: "annotation-1",
		songId: "song-1",
		audioFileId: "file-1",
		type: "point",
		startMs: 100,
		title: "Cue",
		body: EMPTY_RICH_TEXT,
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

const baseSettings: SongModeSettings = {
	recents: ["song-1"],
	lastOpenSongId: "song-1",
	workspaceBySongId: {
		"song-1": {
			playheadMsByFileId: {
				"file-1": 5000,
			},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		},
	},
};

describe("song-mode db cascade helpers", () => {
	beforeEach(async () => {
		vi.resetModules();
		const db = await loadDbModule();
		await db.closeSongModeDbForTests();
		await deleteSongModeDatabase();
		vi.resetModules();
	});

	afterEach(async () => {
		const db = await loadDbModule();
		await db.closeSongModeDbForTests();
		await deleteSongModeDatabase();
		vi.resetModules();
	});

	it("atomically deletes an audio file and related records", async () => {
		const db = await loadDbModule();
		const song = createSong();
		const audioFile = createAudioFile();
		const annotation = createAnnotation();

		await db.saveSong(song);
		await db.saveAudioFile(audioFile);
		await db.saveAudioBlob(
			audioFile.id,
			new Blob(["wave"], { type: "audio/wav" }),
		);
		await db.saveAnnotation(annotation);
		await db.saveSettings(baseSettings);

		await db.deleteAudioFileCascade({
			audioFileId: audioFile.id,
			annotationIds: [annotation.id],
			settings: {
				...baseSettings,
				workspaceBySongId: {
					"song-1": {
						...baseSettings.workspaceBySongId["song-1"],
						playheadMsByFileId: {},
					},
				},
			},
			song: createSong({
				audioFileOrder: [],
				updatedAt: "2026-04-17T00:00:00.000Z",
			}),
		});

		const snapshot = await db.loadSnapshot();

		expect(snapshot.audioFiles).toEqual([]);
		expect(snapshot.annotations).toEqual([]);
		expect(snapshot.blobsByAudioId).toEqual({});
		expect(snapshot.songs[0]?.audioFileOrder).toEqual([]);
		expect(
			snapshot.settings.workspaceBySongId["song-1"]?.playheadMsByFileId,
		).toEqual({});
	});

	it("atomically deletes a song and all related records", async () => {
		const db = await loadDbModule();
		const song = createSong();
		const audioFile = createAudioFile();
		const annotation = createAnnotation();

		await db.saveSong(song);
		await db.saveAudioFile(audioFile);
		await db.saveAudioBlob(
			audioFile.id,
			new Blob(["wave"], { type: "audio/wav" }),
		);
		await db.saveAnnotation(annotation);
		await db.saveSettings(baseSettings);

		await db.deleteSongCascade({
			songId: song.id,
			audioFileIds: [audioFile.id],
			annotationIds: [annotation.id],
			settings: {
				recents: [],
				lastOpenSongId: undefined,
				workspaceBySongId: {},
			},
		});

		const snapshot = await db.loadSnapshot();

		expect(snapshot.songs).toEqual([]);
		expect(snapshot.audioFiles).toEqual([]);
		expect(snapshot.annotations).toEqual([]);
		expect(snapshot.blobsByAudioId).toEqual({});
		expect(snapshot.settings).toEqual({
			recents: [],
			lastOpenSongId: undefined,
			workspaceBySongId: {},
		});
	});
});
