import { type MutableRefObject, useRef, useState } from "react";
import type {
	Annotation,
	AudioFileRecord,
	CreateAnnotationInput,
} from "#/lib/song-mode/types";
import { normalizeVolumeDb } from "#/lib/song-mode/waveform";
import type { PlaybackState } from "#/providers/use-song-mode-playback";
import { reorderAudioFileIds } from "./reorder-audio-file-ids";
import { WaveformCard } from "./waveform-card";

interface SongWorkspaceWaveformListProps {
	activeAnnotationId?: string;
	audioFiles: AudioFileRecord[];
	blobsByAudioId: Record<string, Blob>;
	getAnnotationsForFile: (audioFileId: string) => Annotation[];
	handleCreateAnnotation: (
		fileId: string,
		input: Omit<CreateAnnotationInput, "songId" | "audioFileId">,
	) => Promise<Annotation>;
	itemRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
	playback: PlaybackState;
	registerAudioElement: (
		fileId: string,
		element: HTMLAudioElement | null,
	) => void;
	reorderAudioFiles: (songId: string, orderedIds: string[]) => Promise<void>;
	reportPlaybackState: (
		fileId: string,
		patch: {
			isPlaying?: boolean;
			currentTimeMs?: number;
		},
	) => void;
	seekFile: (
		fileId: string,
		timeMs: number,
		autoplay?: boolean,
	) => Promise<void>;
	selectedFileId?: string;
	songId: string;
	togglePlayback: (fileId: string) => Promise<void>;
	updateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	deleteAnnotation: (annotationId: string) => Promise<void>;
	updateAudioFile: (
		audioFileId: string,
		patch: Partial<AudioFileRecord>,
	) => Promise<void>;
	workspacePlayheadMsByFileId: Record<string, number>;
	onSelectFile: (fileId: string) => void;
	onSelectAnnotation: (fileId: string, annotationId: string) => void;
}

export function SongWorkspaceWaveformList({
	activeAnnotationId,
	audioFiles,
	blobsByAudioId,
	getAnnotationsForFile,
	handleCreateAnnotation,
	itemRefs,
	playback,
	registerAudioElement,
	reorderAudioFiles,
	reportPlaybackState,
	seekFile,
	selectedFileId,
	songId,
	togglePlayback,
	updateAnnotation,
	deleteAnnotation,
	updateAudioFile,
	workspacePlayheadMsByFileId,
	onSelectAnnotation,
	onSelectFile,
}: SongWorkspaceWaveformListProps) {
	const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
	const orderedIdsRef = useRef<string[]>([]);
	orderedIdsRef.current = audioFiles.map((audioFile) => audioFile.id);

	if (audioFiles.length === 0) {
		return (
			<div className="border border-dashed border-[var(--color-border-subtle)] px-6 py-10 text-sm leading-7 text-[var(--color-text-muted)]">
				Add audio to start the stacked waveform review. Each file gets its own
				notes, time markers, range annotations, and immediate seek-and-play
				links.
			</div>
		);
	}

	return (
		<>
			{audioFiles.map((audioFile) => (
				<div
					key={audioFile.id}
					ref={(node) => {
						itemRefs.current[audioFile.id] = node;
					}}
				>
					<WaveformCard
						audioFile={audioFile}
						annotations={getAnnotationsForFile(audioFile.id)}
						blob={blobsByAudioId[audioFile.id]}
						currentTimeMs={
							playback.currentTimeByFileId[audioFile.id] ??
							workspacePlayheadMsByFileId[audioFile.id] ??
							0
						}
						isPlaying={
							playback.activeFileId === audioFile.id && playback.isPlaying
						}
						isSelected={selectedFileId === audioFile.id}
						activeAnnotationId={activeAnnotationId}
						onSelectFile={onSelectFile}
						onSelectAnnotation={(annotationId) =>
							onSelectAnnotation(audioFile.id, annotationId)
						}
						onCreateAnnotation={(annotationInput) =>
							handleCreateAnnotation(audioFile.id, annotationInput)
						}
						onUpdateAnnotation={updateAnnotation}
						onDeleteAnnotation={deleteAnnotation}
						onSeek={(timeMs, autoplay) =>
							seekFile(audioFile.id, timeMs, autoplay)
						}
						onTogglePlayback={() => togglePlayback(audioFile.id)}
						onRegisterAudioElement={(element) =>
							registerAudioElement(audioFile.id, element)
						}
						onReportPlayback={(patch) =>
							reportPlaybackState(audioFile.id, patch)
						}
						onStepVolume={(deltaDb) =>
							updateAudioFile(audioFile.id, {
								volumeDb: normalizeVolumeDb(audioFile.volumeDb + deltaDb),
							})
						}
						onDragStart={() => setDraggingFileId(audioFile.id)}
						onDragEnd={() => setDraggingFileId(null)}
						onDrop={() => {
							if (!draggingFileId) {
								return;
							}

							const orderedIds = reorderAudioFileIds(
								orderedIdsRef.current,
								draggingFileId,
								audioFile.id,
							);
							setDraggingFileId(null);
							if (!orderedIds) {
								return;
							}

							void reorderAudioFiles(songId, orderedIds);
						}}
					/>
				</div>
			))}
		</>
	);
}
