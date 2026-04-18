import { type MutableRefObject, useCallback, useMemo } from "react";
import {
	createDefaultWorkspaceState,
	type SongModeSnapshot,
} from "#/lib/song-mode/types";

interface UseSongModeSelectorsOptions {
	snapshot: SongModeSnapshot;
	snapshotRef: MutableRefObject<SongModeSnapshot>;
}

export function useSongModeSelectors({
	snapshot,
	snapshotRef,
}: UseSongModeSelectorsOptions) {
	const getSongById = useCallback(
		(songId: string) => snapshot.songs.find((song) => song.id === songId),
		[snapshot.songs],
	);

	const getAudioFileById = useCallback(
		(fileId: string) =>
			snapshot.audioFiles.find((audioFile) => audioFile.id === fileId),
		[snapshot.audioFiles],
	);

	const getSongAudioFiles = useCallback(
		(songId: string) => {
			const song = snapshotRef.current.songs.find(
				(entry) => entry.id === songId,
			);
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
		},
		[snapshotRef],
	);

	const getAnnotationsForFile = useCallback(
		(audioFileId: string) => {
			return [...snapshotRef.current.annotations]
				.filter((annotation) => annotation.audioFileId === audioFileId)
				.sort((left, right) => left.startMs - right.startMs);
		},
		[snapshotRef],
	);

	const getWorkspaceState = useCallback(
		(songId: string) => {
			return (
				snapshotRef.current.settings.workspaceBySongId[songId] ??
				createDefaultWorkspaceState()
			);
		},
		[snapshotRef],
	);

	return useMemo(
		() => ({
			getAnnotationsForFile,
			getAudioFileById,
			getSongAudioFiles,
			getSongById,
			getWorkspaceState,
		}),
		[
			getAnnotationsForFile,
			getAudioFileById,
			getSongAudioFiles,
			getSongById,
			getWorkspaceState,
		],
	);
}
