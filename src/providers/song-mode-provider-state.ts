import {
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { loadSnapshot, saveAudioFile } from "#/lib/song-mode/db";
import type { SongModeSnapshot } from "#/lib/song-mode/types";
import {
	EMPTY_SNAPSHOT,
	normalizeLoadedSnapshot,
} from "./song-mode-provider-hydration";

export type SnapshotUpdater = (current: SongModeSnapshot) => SongModeSnapshot;

export type SnapshotPersist = (next: SongModeSnapshot) => Promise<void>;

export type CommitSnapshot = (
	updater: SnapshotUpdater,
	persist: SnapshotPersist,
) => Promise<SongModeSnapshot>;

export function useSongModeSnapshotState() {
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

	const commitSnapshot = useCallback<CommitSnapshot>(
		async (updater, persist) => {
			const current = snapshotRef.current;
			const next = updater(current);
			snapshotRef.current = next;
			setSnapshot(next);

			// Serialize persistence so optimistic UI updates cannot race IndexedDB writes.
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

	return {
		commitSnapshot,
		error,
		ready,
		setError,
		snapshot,
		snapshotRef,
	};
}
