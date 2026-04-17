import {
	createContext,
	type ReactNode,
	startTransition,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { isoDateInLocalCalendar } from "#/lib/song-mode/dates";
import {
	deleteAnnotation as deleteAnnotationRecord,
	deleteAudioBlob as deleteAudioBlobRecord,
	deleteAudioFile as deleteAudioFileRecord,
	deleteSong as deleteSongRecord,
	loadSnapshot,
	saveAnnotation,
	saveAudioBlob,
	saveAudioFile,
	saveSettings,
	saveSong,
} from "#/lib/song-mode/db";
import { EMPTY_RICH_TEXT, normalizeRichText } from "#/lib/song-mode/rich-text";
import { searchSongMode } from "#/lib/song-mode/search";
import {
	type AddAudioFileInput,
	type Annotation,
	type AudioFileRecord,
	type CreateAnnotationInput,
	type CreateSongInput,
	createDefaultWorkspaceState,
	type SearchResult,
	type Song,
	type SongModeSnapshot,
	type WorkspaceState,
} from "#/lib/song-mode/types";
import {
	generateWaveformFromFile,
	normalizeVolumeDb,
} from "#/lib/song-mode/waveform";
import {
	EMPTY_SNAPSHOT,
	normalizeLoadedSnapshot,
} from "./song-mode-provider-hydration";
import {
	type PlaybackState,
	useSongModePlayback,
} from "./use-song-mode-playback";

interface SongModeContextValue extends SongModeSnapshot {
	ready: boolean;
	error: string | null;
	playback: PlaybackState;
	search: (query: string) => SearchResult[];
	getSongById: (songId: string) => Song | undefined;
	getAudioFileById: (fileId: string) => AudioFileRecord | undefined;
	getSongAudioFiles: (songId: string) => AudioFileRecord[];
	getAnnotationsForFile: (audioFileId: string) => Annotation[];
	getWorkspaceState: (songId: string) => WorkspaceState;
	createSong: (input: CreateSongInput) => Promise<Song>;
	updateSong: (songId: string, patch: Partial<Song>) => Promise<void>;
	deleteSong: (songId: string) => Promise<void>;
	addAudioFile: (
		songId: string,
		input: AddAudioFileInput,
	) => Promise<AudioFileRecord>;
	updateAudioFile: (
		audioFileId: string,
		patch: Partial<AudioFileRecord>,
	) => Promise<void>;
	deleteAudioFile: (audioFileId: string) => Promise<void>;
	reorderAudioFiles: (songId: string, orderedIds: string[]) => Promise<void>;
	createAnnotation: (input: CreateAnnotationInput) => Promise<Annotation>;
	updateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	deleteAnnotation: (annotationId: string) => Promise<void>;
	updateWorkspaceState: (
		songId: string,
		patch:
			| Partial<WorkspaceState>
			| ((current: WorkspaceState) => WorkspaceState),
	) => Promise<void>;
	rememberSongOpened: (songId: string) => Promise<void>;
	registerAudioElement: (
		fileId: string,
		element: HTMLAudioElement | null,
	) => void;
	reportPlaybackState: (
		fileId: string,
		patch: {
			isPlaying?: boolean;
			currentTimeMs?: number;
		},
	) => void;
	togglePlayback: (fileId: string) => Promise<void>;
	seekFile: (
		fileId: string,
		timeMs: number,
		autoplay?: boolean,
	) => Promise<void>;
	seekActiveBy: (deltaMs: number) => Promise<void>;
	jumpBetweenAnnotations: (
		songId: string,
		audioFileId: string,
		direction: "previous" | "next",
	) => Promise<Annotation | null>;
}

const SongModeContext = createContext<SongModeContextValue | null>(null);

export function SongModeProvider({ children }: { children: ReactNode }) {
	const [snapshot, setSnapshot] = useState<SongModeSnapshot>(EMPTY_SNAPSHOT);
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const snapshotRef = useRef(snapshot);
	const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

	useEffect(() => {
		snapshotRef.current = snapshot;
	}, [snapshot]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		let cancelled = false;
		loadSnapshot()
			.then(async (loadedSnapshot) => {
				if (cancelled) {
					return;
				}

				const { audioFilesToPersist, normalizedSnapshot } =
					await normalizeLoadedSnapshot(loadedSnapshot);

				if (audioFilesToPersist.length > 0) {
					await Promise.all(
						audioFilesToPersist.map((audioFile) => saveAudioFile(audioFile)),
					);
				}

				if (cancelled) {
					return;
				}

				snapshotRef.current = normalizedSnapshot;
				startTransition(() => {
					setSnapshot(normalizedSnapshot);
					setReady(true);
				});
			})
			.catch((loadError) => {
				if (cancelled) {
					return;
				}

				setError(
					loadError instanceof Error
						? loadError.message
						: "Song Mode could not load the local workspace.",
				);
				setReady(true);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	const commitSnapshot = useCallback(
		async (
			updater: (current: SongModeSnapshot) => SongModeSnapshot,
			persist: (next: SongModeSnapshot) => Promise<void>,
		) => {
			const current = snapshotRef.current;
			const next = updater(current);
			snapshotRef.current = next;
			setSnapshot(next);

			const persistTask = persistQueueRef.current
				.catch(() => undefined)
				.then(async () => {
					await persist(next);
				});

			persistQueueRef.current = persistTask.then(
				() => undefined,
				() => undefined,
			);

			try {
				await persistTask;
				return next;
			} catch (persistError) {
				setError(
					persistError instanceof Error
						? persistError.message
						: "Song Mode could not save the latest changes.",
				);
				throw persistError;
			}
		},
		[],
	);

	const getSongById = useCallback(
		(songId: string) => snapshot.songs.find((song) => song.id === songId),
		[snapshot.songs],
	);

	const getAudioFileById = useCallback(
		(fileId: string) =>
			snapshot.audioFiles.find((audioFile) => audioFile.id === fileId),
		[snapshot.audioFiles],
	);

	const getSongAudioFiles = useCallback((songId: string) => {
		const song = snapshotRef.current.songs.find((entry) => entry.id === songId);
		const audioFiles = snapshotRef.current.audioFiles.filter(
			(audioFile) => audioFile.songId === songId,
		);
		const order = song?.audioFileOrder ?? [];

		return [...audioFiles].sort((left, right) => {
			const leftIndex = order.indexOf(left.id);
			const rightIndex = order.indexOf(right.id);

			if (leftIndex === -1 && rightIndex === -1) {
				return left.createdAt.localeCompare(right.createdAt);
			}

			if (leftIndex === -1) {
				return 1;
			}

			if (rightIndex === -1) {
				return -1;
			}

			return leftIndex - rightIndex;
		});
	}, []);

	const getAnnotationsForFile = useCallback((audioFileId: string) => {
		return [...snapshotRef.current.annotations]
			.filter((annotation) => annotation.audioFileId === audioFileId)
			.sort((left, right) => left.startMs - right.startMs);
	}, []);

	const getWorkspaceState = useCallback((songId: string) => {
		return (
			snapshotRef.current.settings.workspaceBySongId[songId] ??
			createDefaultWorkspaceState()
		);
	}, []);

	const {
		audioRefs,
		jumpBetweenAnnotations,
		playback,
		registerAudioElement,
		reportPlaybackState,
		seekActiveBy,
		seekFile,
		setPlayback,
		togglePlayback,
	} = useSongModePlayback({
		getAnnotationsForFile,
		getWorkspaceState,
		snapshotRef,
	});

	const search = useCallback(
		(query: string) =>
			searchSongMode(
				{
					songs: snapshot.songs,
					audioFiles: snapshot.audioFiles,
					annotations: snapshot.annotations,
				},
				query,
			),
		[snapshot.annotations, snapshot.audioFiles, snapshot.songs],
	);

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
				(current) => {
					const songs = current.songs.map((song) =>
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
					);

					return {
						...current,
						songs,
					};
				},
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

	const removeRegisteredAudio = useCallback(
		(audioFileIds: string[]) => {
			for (const fileId of audioFileIds) {
				audioRefs.current.delete(fileId);
			}
		},
		[audioRefs],
	);

	const prunePlaybackState = useCallback(
		(audioFileIds: string[]) => {
			setPlayback((current) => {
				const nextCurrentTimeByFileId = { ...current.currentTimeByFileId };
				let activeDeleted = false;

				for (const fileId of audioFileIds) {
					delete nextCurrentTimeByFileId[fileId];
					if (current.activeFileId === fileId) {
						activeDeleted = true;
					}
				}

				return {
					activeFileId: activeDeleted ? undefined : current.activeFileId,
					isPlaying: activeDeleted ? false : current.isPlaying,
					currentTimeByFileId: nextCurrentTimeByFileId,
				};
			});
		},
		[setPlayback],
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
				(current) => {
					const songs = current.songs.map((song) =>
						song.id === songId
							? {
									...song,
									audioFileOrder: [...song.audioFileOrder, audioFile.id],
									updatedAt: now,
								}
							: song,
					);

					return {
						...current,
						songs,
						audioFiles: [...current.audioFiles, audioFile],
						blobsByAudioId: {
							...current.blobsByAudioId,
							[audioFile.id]: input.file,
						},
					};
				},
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
		[commitSnapshot],
	);

	const updateAudioFile = useCallback(
		async (audioFileId: string, patch: Partial<AudioFileRecord>) => {
			await commitSnapshot(
				(current) => {
					const audioFiles = current.audioFiles.map((audioFile) =>
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
					);

					return {
						...current,
						audioFiles,
					};
				},
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
					const deletedAnnotationIdSet = new Set(deletedAnnotationIds);
					const songs = current.songs.map((song) =>
						song.id === targetFile.songId
							? {
									...song,
									audioFileOrder: song.audioFileOrder.filter(
										(fileId) => fileId !== audioFileId,
									),
									updatedAt: new Date().toISOString(),
								}
							: song,
					);
					const blobsByAudioId = { ...current.blobsByAudioId };
					delete blobsByAudioId[audioFileId];

					const workspaceBySongId = { ...current.settings.workspaceBySongId };
					const songWorkspace = workspaceBySongId[targetFile.songId];
					if (songWorkspace) {
						const playheadMsByFileId = { ...songWorkspace.playheadMsByFileId };
						delete playheadMsByFileId[audioFileId];

						workspaceBySongId[targetFile.songId] = {
							...songWorkspace,
							selectedFileId:
								songWorkspace.selectedFileId === audioFileId
									? undefined
									: songWorkspace.selectedFileId,
							activeAnnotationId:
								songWorkspace.activeAnnotationId &&
								deletedAnnotationIdSet.has(songWorkspace.activeAnnotationId)
									? undefined
									: songWorkspace.activeAnnotationId,
							playheadMsByFileId,
						};
					}

					return {
						...current,
						songs,
						audioFiles: current.audioFiles.filter(
							(audioFile) => audioFile.id !== audioFileId,
						),
						annotations: current.annotations.filter(
							(annotation) => annotation.audioFileId !== audioFileId,
						),
						blobsByAudioId,
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

	const value = useMemo<SongModeContextValue>(
		() => ({
			...snapshot,
			ready,
			error,
			playback,
			search,
			getSongById,
			getAudioFileById,
			getSongAudioFiles,
			getAnnotationsForFile,
			getWorkspaceState,
			createSong,
			updateSong,
			deleteSong,
			addAudioFile,
			updateAudioFile,
			deleteAudioFile,
			reorderAudioFiles,
			createAnnotation,
			updateAnnotation,
			deleteAnnotation,
			updateWorkspaceState,
			rememberSongOpened,
			registerAudioElement,
			reportPlaybackState,
			togglePlayback,
			seekFile,
			seekActiveBy,
			jumpBetweenAnnotations,
		}),
		[
			addAudioFile,
			createAnnotation,
			createSong,
			deleteSong,
			deleteAnnotation,
			deleteAudioFile,
			error,
			getAnnotationsForFile,
			getAudioFileById,
			getSongAudioFiles,
			getSongById,
			getWorkspaceState,
			jumpBetweenAnnotations,
			playback,
			ready,
			registerAudioElement,
			rememberSongOpened,
			reorderAudioFiles,
			reportPlaybackState,
			search,
			seekActiveBy,
			seekFile,
			snapshot,
			togglePlayback,
			updateAnnotation,
			updateAudioFile,
			updateSong,
			updateWorkspaceState,
		],
	);

	return (
		<SongModeContext.Provider value={value}>
			{children}
		</SongModeContext.Provider>
	);
}

export function useSongMode() {
	const context = useContext(SongModeContext);

	if (!context) {
		throw new Error("useSongMode must be used inside SongModeProvider.");
	}

	return context;
}

export function useSongModeReady() {
	const { ready } = useSongMode();
	return ready;
}

export function useSongModeError() {
	const { error } = useSongMode();
	return error;
}

export function useSongModeRichTextFallback() {
	return EMPTY_RICH_TEXT;
}
