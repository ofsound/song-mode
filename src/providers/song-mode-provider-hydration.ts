import { normalizeRichText } from "#/lib/song-mode/rich-text";
import {
	type AudioFileRecord,
	createEmptySettings,
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

export async function normalizeLoadedSnapshot(
	loadedSnapshot: SongModeSnapshot,
) {
	const audioFilesToPersist: AudioFileRecord[] = [];
	const audioFiles = await Promise.all(
		loadedSnapshot.audioFiles.map(async (audioFile) => {
			const normalizedAudioFile: AudioFileRecord = {
				...audioFile,
				notes: normalizeRichText(audioFile.notes),
				volumeDb: normalizeVolumeDb(audioFile.volumeDb),
				waveform: normalizeWaveformData(
					audioFile.waveform,
					audioFile.durationMs,
				),
			};

			if (hasRenderableWaveform(audioFile.waveform)) {
				return normalizedAudioFile;
			}

			const blob = loadedSnapshot.blobsByAudioId[audioFile.id];
			if (!(blob instanceof Blob)) {
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
