import { useCallback, useMemo } from "react";
import { isoDateInLocalCalendar } from "#/lib/song-mode/dates";
import {
	deleteAnnotation as deleteAnnotationRecord,
	deleteAudioBlob as deleteAudioBlobRecord,
	deleteAudioFile as deleteAudioFileRecord,
	deleteSong as deleteSongRecord,
	saveAnnotation,
	saveAudioBlob,
	saveAudioFile,
	saveSettings,
	saveSong,
} from "#/lib/song-mode/db";
import { normalizeRichText } from "#/lib/song-mode/rich-text";
import {
	type AddAudioFileInput,
	type Annotation,
	type AudioFileRecord,
	type CreateAnnotationInput,
	type CreateSongInput,
	createDefaultWorkspaceState,
	type Song,
	type WorkspaceState,
} from "#/lib/song-mode/types";
import {
	generateWaveformFromFile,
	normalizeVolumeDb,
} from "#/lib/song-mode/waveform";
import type { CommitSnapshot } from "./song-mode-provider-state";

interface UseSongMutationsOptions {
	commitSnapshot: CommitSnapshot;
	prunePlaybackState: (audioFileIds: string[]) => void;
	removeRegisteredAudio: (audioFileIds: string[]) => void;
}

interface UseAudioFileMutationsOptions {
	commitSnapshot: CommitSnapshot;
	prunePlaybackState: (audioFileIds: string[]) => void;
	removeRegisteredAudio: (audioFileIds: string[]) => void;
	setError: (error: string | null) => void;
}

interface UseAnnotationMutationsOptions {
	commitSnapshot: CommitSnapshot;
}

interface UseWorkspaceMutationsOptions {
	commitSnapshot: CommitSnapshot;
}

export function useSongMutations({
	commitSnapshot,
	prunePlaybackState,
	removeRegisteredAudio,
}: UseSongMutationsOptions) {
	const createSong = useCallback(
		async (input: CreateSongInput) => {
			const now = new Date().toISOString();
			const song: Song = {
				id: crypto.randomUUID(),
				title: input.title.trim(),
				artist: input.artist.trim(),
				project: input.project.trim(),
				generalNotes: normalizeRichText(input.generalNotes),
				audioFileOrder: [],
				createdAt: now,
				updatedAt: now,
			};

			const next = await commitSnapshot(
				(current) => ({
					...current,
					songs: [song, ...current.songs],
					settings: {
						...current.settings,
						workspaceBySongId: {
							...current.settings.workspaceBySongId,
							[song.id]: createDefaultWorkspaceState(),
						},
					},
				}),
				async (nextSnapshot) => {
					await Promise.all([
						saveSong(song),
						saveSettings(nextSnapshot.settings),
					]);
				},
			);

			return next.songs.find((entry) => entry.id === song.id) ?? song;
		},
		[commitSnapshot],
	);

	const updateSong = useCallback(
		async (songId: string, patch: Partial<Song>) => {
			await commitSnapshot(
				(current) => ({
					...current,
					songs: current.songs.map((song) =>
						song.id === songId
							? {
									...song,
									...patch,
									generalNotes: normalizeRichText(
										patch.generalNotes ?? song.generalNotes,
									),
									updatedAt: new Date().toISOString(),
								}
							: song,
					),
				}),
				async (nextSnapshot) => {
					const song = nextSnapshot.songs.find((entry) => entry.id === songId);
					if (song) {
						await saveSong(song);
					}
				},
			);
		},
		[commitSnapshot],
	);

	const deleteSong = useCallback(
		async (songId: string) => {
			let deletedAudioFileIds: string[] = [];
			let deletedAnnotationIds: string[] = [];

			await commitSnapshot(
				(current) => {
					deletedAudioFileIds = current.audioFiles
						.filter((audioFile) => audioFile.songId === songId)
						.map((audioFile) => audioFile.id);
					deletedAnnotationIds = current.annotations
						.filter((annotation) => annotation.songId === songId)
						.map((annotation) => annotation.id);
					const deletedAudioFileIdSet = new Set(deletedAudioFileIds);
					const recents = current.settings.recents.filter(
						(id) => id !== songId,
					);
					const workspaceBySongId = { ...current.settings.workspaceBySongId };
					delete workspaceBySongId[songId];
					const blobsByAudioId = { ...current.blobsByAudioId };
					for (const fileId of deletedAudioFileIdSet) {
						delete blobsByAudioId[fileId];
					}

					return {
						...current,
						songs: current.songs.filter((song) => song.id !== songId),
						audioFiles: current.audioFiles.filter(
							(audioFile) => audioFile.songId !== songId,
						),
						annotations: current.annotations.filter(
							(annotation) => annotation.songId !== songId,
						),
						blobsByAudioId,
						settings: {
							...current.settings,
							recents,
							lastOpenSongId:
								current.settings.lastOpenSongId === songId
									? recents[0]
									: current.settings.lastOpenSongId,
							workspaceBySongId,
						},
					};
				},
				async (nextSnapshot) => {
					await Promise.all([
						deleteSongRecord(songId),
						...deletedAudioFileIds.map((fileId) =>
							deleteAudioFileRecord(fileId),
						),
						...deletedAudioFileIds.map((fileId) =>
							deleteAudioBlobRecord(fileId),
						),
						...deletedAnnotationIds.map((id) => deleteAnnotationRecord(id)),
						saveSettings(nextSnapshot.settings),
					]);
				},
			);

			if (deletedAudioFileIds.length === 0) {
				return;
			}

			removeRegisteredAudio(deletedAudioFileIds);
			prunePlaybackState(deletedAudioFileIds);
		},
		[commitSnapshot, prunePlaybackState, removeRegisteredAudio],
	);

	return useMemo(
		() => ({
			createSong,
			deleteSong,
			updateSong,
		}),
		[createSong, deleteSong, updateSong],
	);
}

export function useAudioFileMutations({
	commitSnapshot,
	prunePlaybackState,
	removeRegisteredAudio,
	setError,
}: UseAudioFileMutationsOptions) {
	const addAudioFile = useCallback(
		async (songId: string, input: AddAudioFileInput) => {
			setError(null);
			const waveform = await generateWaveformFromFile(input.file);
			const now = new Date().toISOString();
			const sessionDate = input.sessionDate.trim() || isoDateInLocalCalendar();
			const audioFile: AudioFileRecord = {
				id: crypto.randomUUID(),
				songId,
				title: input.title.trim() || input.file.name.replace(/\.[^.]+$/, ""),
				sessionDate,
				notes: normalizeRichText(input.notes),
				volumeDb: 0,
				durationMs: waveform.durationMs,
				waveform,
				createdAt: now,
				updatedAt: now,
			};

			await commitSnapshot(
				(current) => ({
					...current,
					songs: current.songs.map((song) =>
						song.id === songId
							? {
									...song,
									audioFileOrder: [...song.audioFileOrder, audioFile.id],
									updatedAt: now,
								}
							: song,
					),
					audioFiles: [...current.audioFiles, audioFile],
					blobsByAudioId: {
						...current.blobsByAudioId,
						[audioFile.id]: input.file,
					},
				}),
				async (nextSnapshot) => {
					const song = nextSnapshot.songs.find((entry) => entry.id === songId);
					await Promise.all([
						saveAudioFile(audioFile),
						saveAudioBlob(audioFile.id, input.file),
						song ? saveSong(song) : Promise.resolve(),
					]);
				},
			);

			return audioFile;
		},
		[commitSnapshot, setError],
	);

	const updateAudioFile = useCallback(
		async (audioFileId: string, patch: Partial<AudioFileRecord>) => {
			await commitSnapshot(
				(current) => ({
					...current,
					audioFiles: current.audioFiles.map((audioFile) =>
						audioFile.id === audioFileId
							? {
									...audioFile,
									...patch,
									notes: normalizeRichText(patch.notes ?? audioFile.notes),
									volumeDb: normalizeVolumeDb(
										patch.volumeDb ?? audioFile.volumeDb,
									),
									updatedAt: new Date().toISOString(),
								}
							: audioFile,
					),
				}),
				async (nextSnapshot) => {
					const audioFile = nextSnapshot.audioFiles.find(
						(entry) => entry.id === audioFileId,
					);
					if (audioFile) {
						await saveAudioFile(audioFile);
					}
				},
			);
		},
		[commitSnapshot],
	);

	const deleteAudioFile = useCallback(
		async (audioFileId: string) => {
			let didDeleteFile = false;
			let deletedAnnotationIds: string[] = [];
			let updatedSongId: string | undefined;

			await commitSnapshot(
				(current) => {
					const targetFile = current.audioFiles.find(
						(audioFile) => audioFile.id === audioFileId,
					);
					if (!targetFile) {
						return current;
					}

					didDeleteFile = true;
					updatedSongId = targetFile.songId;
					deletedAnnotationIds = current.annotations
						.filter((annotation) => annotation.audioFileId === audioFileId)
						.map((annotation) => annotation.id);
					const workspaceBySongId = { ...current.settings.workspaceBySongId };
					const songWorkspace = workspaceBySongId[targetFile.songId];
					if (songWorkspace) {
						const playheadMsByFileId = { ...songWorkspace.playheadMsByFileId };
						delete playheadMsByFileId[audioFileId];

						workspaceBySongId[targetFile.songId] = {
							...songWorkspace,
							playheadMsByFileId,
						};
					}

					return {
						...current,
						songs: current.songs.map((song) =>
							song.id === targetFile.songId
								? {
										...song,
										audioFileOrder: song.audioFileOrder.filter(
											(fileId) => fileId !== audioFileId,
										),
										updatedAt: new Date().toISOString(),
									}
								: song,
						),
						audioFiles: current.audioFiles.filter(
							(audioFile) => audioFile.id !== audioFileId,
						),
						annotations: current.annotations.filter(
							(annotation) => annotation.audioFileId !== audioFileId,
						),
						blobsByAudioId: Object.fromEntries(
							Object.entries(current.blobsByAudioId).filter(
								([fileId]) => fileId !== audioFileId,
							),
						),
						settings: {
							...current.settings,
							workspaceBySongId,
						},
					};
				},
				async (nextSnapshot) => {
					if (!didDeleteFile) {
						return;
					}

					const updatedSong = updatedSongId
						? nextSnapshot.songs.find((song) => song.id === updatedSongId)
						: undefined;
					await Promise.all([
						deleteAudioFileRecord(audioFileId),
						deleteAudioBlobRecord(audioFileId),
						...deletedAnnotationIds.map((id) => deleteAnnotationRecord(id)),
						updatedSong ? saveSong(updatedSong) : Promise.resolve(),
						saveSettings(nextSnapshot.settings),
					]);
				},
			);

			if (!didDeleteFile) {
				return;
			}

			removeRegisteredAudio([audioFileId]);
			prunePlaybackState([audioFileId]);
		},
		[commitSnapshot, prunePlaybackState, removeRegisteredAudio],
	);

	const reorderAudioFiles = useCallback(
		async (songId: string, orderedIds: string[]) => {
			await commitSnapshot(
				(current) => ({
					...current,
					songs: current.songs.map((song) =>
						song.id === songId
							? {
									...song,
									audioFileOrder: orderedIds,
									updatedAt: new Date().toISOString(),
								}
							: song,
					),
				}),
				async (nextSnapshot) => {
					const song = nextSnapshot.songs.find((entry) => entry.id === songId);
					if (song) {
						await saveSong(song);
					}
				},
			);
		},
		[commitSnapshot],
	);

	return useMemo(
		() => ({
			addAudioFile,
			deleteAudioFile,
			reorderAudioFiles,
			updateAudioFile,
		}),
		[addAudioFile, deleteAudioFile, reorderAudioFiles, updateAudioFile],
	);
}

export function useAnnotationMutations({
	commitSnapshot,
}: UseAnnotationMutationsOptions) {
	const createAnnotation = useCallback(
		async (input: CreateAnnotationInput) => {
			const now = new Date().toISOString();
			const annotation: Annotation = {
				id: crypto.randomUUID(),
				...input,
				title: input.title.trim(),
				body: normalizeRichText(input.body),
				updatedAt: now,
				createdAt: now,
			};

			await commitSnapshot(
				(current) => ({
					...current,
					annotations: [...current.annotations, annotation],
				}),
				async () => {
					await saveAnnotation(annotation);
				},
			);

			return annotation;
		},
		[commitSnapshot],
	);

	const updateAnnotation = useCallback(
		async (annotationId: string, patch: Partial<Annotation>) => {
			await commitSnapshot(
				(current) => ({
					...current,
					annotations: current.annotations.map((annotation) =>
						annotation.id === annotationId
							? {
									...annotation,
									...patch,
									body: normalizeRichText(patch.body ?? annotation.body),
									updatedAt: new Date().toISOString(),
								}
							: annotation,
					),
				}),
				async (nextSnapshot) => {
					const annotation = nextSnapshot.annotations.find(
						(entry) => entry.id === annotationId,
					);
					if (annotation) {
						await saveAnnotation(annotation);
					}
				},
			);
		},
		[commitSnapshot],
	);

	const deleteAnnotation = useCallback(
		async (annotationId: string) => {
			await commitSnapshot(
				(current) => ({
					...current,
					annotations: current.annotations.filter(
						(annotation) => annotation.id !== annotationId,
					),
				}),
				async () => {
					await deleteAnnotationRecord(annotationId);
				},
			);
		},
		[commitSnapshot],
	);

	return useMemo(
		() => ({
			createAnnotation,
			deleteAnnotation,
			updateAnnotation,
		}),
		[createAnnotation, deleteAnnotation, updateAnnotation],
	);
}

export function useWorkspaceMutations({
	commitSnapshot,
}: UseWorkspaceMutationsOptions) {
	const updateWorkspaceState = useCallback(
		async (
			songId: string,
			patch:
				| Partial<WorkspaceState>
				| ((current: WorkspaceState) => WorkspaceState),
		) => {
			await commitSnapshot(
				(current) => {
					const currentWorkspace =
						current.settings.workspaceBySongId[songId] ??
						createDefaultWorkspaceState();
					const nextWorkspace =
						typeof patch === "function"
							? patch(currentWorkspace)
							: {
									...currentWorkspace,
									...patch,
								};

					return {
						...current,
						settings: {
							...current.settings,
							workspaceBySongId: {
								...current.settings.workspaceBySongId,
								[songId]: nextWorkspace,
							},
						},
					};
				},
				async (nextSnapshot) => {
					await saveSettings(nextSnapshot.settings);
				},
			);
		},
		[commitSnapshot],
	);

	const rememberSongOpened = useCallback(
		async (songId: string) => {
			await commitSnapshot(
				(current) => {
					const recents = [
						songId,
						...current.settings.recents.filter((id) => id !== songId),
					].slice(0, 8);
					const workspace =
						current.settings.workspaceBySongId[songId] ??
						createDefaultWorkspaceState();

					return {
						...current,
						settings: {
							...current.settings,
							lastOpenSongId: songId,
							recents,
							workspaceBySongId: {
								...current.settings.workspaceBySongId,
								[songId]: {
									...workspace,
									lastVisitedAt: new Date().toISOString(),
								},
							},
						},
					};
				},
				async (nextSnapshot) => {
					await saveSettings(nextSnapshot.settings);
				},
			);
		},
		[commitSnapshot],
	);

	return useMemo(
		() => ({
			rememberSongOpened,
			updateWorkspaceState,
		}),
		[rememberSongOpened, updateWorkspaceState],
	);
}
