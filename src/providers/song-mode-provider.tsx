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
import {
	deleteAnnotation as deleteAnnotationRecord,
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
	createEmptySettings,
	type SearchResult,
	type Song,
	type SongModeSnapshot,
	type WorkspaceState,
} from "#/lib/song-mode/types";
import { clampTime, generateWaveformFromFile } from "#/lib/song-mode/waveform";

interface PlaybackState {
	activeFileId?: string;
	isPlaying: boolean;
	currentTimeByFileId: Record<string, number>;
}

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
	addAudioFile: (
		songId: string,
		input: AddAudioFileInput,
	) => Promise<AudioFileRecord>;
	updateAudioFile: (
		audioFileId: string,
		patch: Partial<AudioFileRecord>,
	) => Promise<void>;
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

const EMPTY_SNAPSHOT: SongModeSnapshot = {
	songs: [],
	audioFiles: [],
	annotations: [],
	blobsByAudioId: {},
	settings: createEmptySettings(),
};

const SongModeContext = createContext<SongModeContextValue | null>(null);

export function SongModeProvider({ children }: { children: ReactNode }) {
	const [snapshot, setSnapshot] = useState<SongModeSnapshot>(EMPTY_SNAPSHOT);
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [playback, setPlayback] = useState<PlaybackState>({
		isPlaying: false,
		currentTimeByFileId: {},
	});

	const snapshotRef = useRef(snapshot);
	const playbackRef = useRef(playback);
	const audioRefs = useRef(new Map<string, HTMLAudioElement>());

	useEffect(() => {
		snapshotRef.current = snapshot;
	}, [snapshot]);

	useEffect(() => {
		playbackRef.current = playback;
	}, [playback]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		let cancelled = false;
		loadSnapshot()
			.then((loadedSnapshot) => {
				if (cancelled) {
					return;
				}

				const normalized: SongModeSnapshot = {
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
					audioFiles: loadedSnapshot.audioFiles.map((audioFile) => ({
						...audioFile,
						notes: normalizeRichText(audioFile.notes),
						masteringNote: normalizeRichText(audioFile.masteringNote),
					})),
					annotations: loadedSnapshot.annotations.map((annotation) => ({
						...annotation,
						body: normalizeRichText(annotation.body),
					})),
					settings: loadedSnapshot.settings ?? createEmptySettings(),
				};

				snapshotRef.current = normalized;
				startTransition(() => {
					setSnapshot(normalized);
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
			await persist(next);
			snapshotRef.current = next;
			setSnapshot(next);
			return next;
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

	const addAudioFile = useCallback(
		async (songId: string, input: AddAudioFileInput) => {
			setError(null);
			const waveform = await generateWaveformFromFile(input.file);
			const now = new Date().toISOString();
			const audioFile: AudioFileRecord = {
				id: crypto.randomUUID(),
				songId,
				title: input.title.trim() || input.file.name.replace(/\.[^.]+$/, ""),
				notes: normalizeRichText(input.notes),
				masteringNote: normalizeRichText(input.masteringNote),
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
									masteringNote: normalizeRichText(
										patch.masteringNote ?? audioFile.masteringNote,
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

	const pauseOtherAudio = useCallback((currentFileId?: string) => {
		for (const [fileId, element] of audioRefs.current.entries()) {
			if (fileId !== currentFileId && !element.paused) {
				element.pause();
			}
		}
	}, []);

	const registerAudioElement = useCallback(
		(fileId: string, element: HTMLAudioElement | null) => {
			if (element) {
				audioRefs.current.set(fileId, element);
			} else {
				audioRefs.current.delete(fileId);
			}
		},
		[],
	);

	const reportPlaybackState = useCallback(
		(
			fileId: string,
			patch: {
				isPlaying?: boolean;
				currentTimeMs?: number;
			},
		) => {
			setPlayback((current) => ({
				activeFileId:
					patch.isPlaying || current.activeFileId === fileId
						? fileId
						: current.activeFileId,
				isPlaying:
					typeof patch.isPlaying === "boolean"
						? patch.isPlaying
						: current.activeFileId === fileId
							? current.isPlaying
							: false,
				currentTimeByFileId:
					typeof patch.currentTimeMs === "number"
						? {
								...current.currentTimeByFileId,
								[fileId]: patch.currentTimeMs,
							}
						: current.currentTimeByFileId,
			}));
		},
		[],
	);

	const togglePlayback = useCallback(
		async (fileId: string) => {
			const element = audioRefs.current.get(fileId);
			if (!element) {
				return;
			}

			if (!element.paused) {
				element.pause();
				reportPlaybackState(fileId, {
					isPlaying: false,
					currentTimeMs: element.currentTime * 1000,
				});
				return;
			}

			pauseOtherAudio(fileId);
			await element.play().catch(() => undefined);
			reportPlaybackState(fileId, {
				isPlaying: true,
				currentTimeMs: element.currentTime * 1000,
			});
		},
		[pauseOtherAudio, reportPlaybackState],
	);

	const seekFile = useCallback(
		async (fileId: string, timeMs: number, autoplay = false) => {
			const element = audioRefs.current.get(fileId);
			const audioFile = snapshotRef.current.audioFiles.find(
				(entry) => entry.id === fileId,
			);
			if (!element || !audioFile) {
				return;
			}

			const boundedTime = clampTime(timeMs, audioFile.durationMs);
			element.currentTime = boundedTime / 1000;
			reportPlaybackState(fileId, {
				currentTimeMs: boundedTime,
			});

			if (autoplay) {
				pauseOtherAudio(fileId);
				await element.play().catch(() => undefined);
				reportPlaybackState(fileId, {
					isPlaying: true,
					currentTimeMs: boundedTime,
				});
			}
		},
		[pauseOtherAudio, reportPlaybackState],
	);

	const seekActiveBy = useCallback(
		async (deltaMs: number) => {
			const activeFileId = playbackRef.current.activeFileId;
			if (!activeFileId) {
				return;
			}

			const currentTime =
				playbackRef.current.currentTimeByFileId[activeFileId] ?? 0;
			await seekFile(
				activeFileId,
				currentTime + deltaMs,
				playbackRef.current.isPlaying,
			);
		},
		[seekFile],
	);

	const jumpBetweenAnnotations = useCallback(
		async (
			songId: string,
			audioFileId: string,
			direction: "previous" | "next",
		) => {
			const annotations = getAnnotationsForFile(audioFileId);
			if (!annotations.length) {
				return null;
			}

			const workspace = getWorkspaceState(songId);
			const currentTime =
				playbackRef.current.currentTimeByFileId[audioFileId] ??
				workspace.playheadMsByFileId[audioFileId] ??
				0;

			let target: Annotation | undefined;
			if (direction === "next") {
				target = annotations.find(
					(annotation) => annotation.startMs > currentTime + 200,
				);
				target ??= annotations[0];
			} else {
				target = [...annotations]
					.reverse()
					.find((annotation) => annotation.startMs < currentTime - 200);
				target ??= annotations.at(-1);
			}

			if (!target) {
				return null;
			}

			await seekFile(audioFileId, target.startMs, true);
			return target;
		},
		[getAnnotationsForFile, getWorkspaceState, seekFile],
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
			addAudioFile,
			updateAudioFile,
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
			deleteAnnotation,
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
