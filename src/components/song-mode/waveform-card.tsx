import {
	GripVertical,
	Minus,
	Pause,
	Play,
	Plus,
	RotateCcw,
	UnfoldHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveAudioFileSessionDateLabel } from "#/lib/song-mode/dates";
import { EMPTY_RICH_TEXT } from "#/lib/song-mode/rich-text";
import type {
	Annotation,
	AudioFileRecord,
	CreateAnnotationInput,
} from "#/lib/song-mode/types";
import {
	formatDuration,
	MAX_VOLUME_DB,
	MIN_VOLUME_DB,
	normalizeWaveformData,
} from "#/lib/song-mode/waveform";
import { useWaveformAudioGraph } from "./use-waveform-audio-graph";
import { useWaveformCanvas } from "./use-waveform-canvas";
import { WaveformCardAnnotationLayer } from "./waveform-card-annotation-layer";

const PLAYHEAD_ADD_MARKER_HOTSPOT_HEIGHT_PX = 36;
const DEFAULT_RANGE_ANNOTATION_DURATION_MS = 10_000;

interface HoveredAnnotationState {
	annotationId: string;
	x: number;
	y: number;
}

interface SeekDragState {
	pointerId: number;
	timeMs: number;
}

interface WaveformSeekClickState {
	clientX: number;
	timeMs: number;
}

interface WaveformCardProps {
	audioFile: AudioFileRecord;
	annotations: Annotation[];
	blob?: Blob;
	currentTimeMs: number;
	isPlaying: boolean;
	isSelected: boolean;
	activeAnnotationId?: string;
	onSelectFile: (fileId: string) => void;
	onSelectAnnotation: (annotationId: string) => void;
	onCreateAnnotation: (
		input: Omit<CreateAnnotationInput, "songId" | "audioFileId">,
	) => Promise<Annotation>;
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	onSeek: (timeMs: number, autoplay?: boolean) => Promise<void>;
	onTogglePlayback: () => Promise<void>;
	onRegisterAudioElement: (element: HTMLAudioElement | null) => void;
	onReportPlayback: (patch: {
		isPlaying?: boolean;
		currentTimeMs?: number;
	}) => void;
	onStepVolume: (deltaDb: number) => Promise<void>;
	onDragStart: () => void;
	onDragEnd: () => void;
	onDrop: () => void;
}

export function WaveformCard({
	audioFile,
	annotations,
	blob,
	currentTimeMs,
	isPlaying,
	isSelected,
	activeAnnotationId,
	onSelectFile,
	onSelectAnnotation,
	onCreateAnnotation,
	onUpdateAnnotation,
	onSeek,
	onTogglePlayback,
	onRegisterAudioElement,
	onReportPlayback,
	onStepVolume,
	onDragStart,
	onDragEnd,
	onDrop,
}: WaveformCardProps) {
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [hoveredAnnotation, setHoveredAnnotation] =
		useState<HoveredAnnotationState | null>(null);
	const [isPlayheadAddMarkerVisible, setIsPlayheadAddMarkerVisible] =
		useState(false);
	const articleRef = useRef<HTMLElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const waveformShellRef = useRef<HTMLDivElement | null>(null);
	const canvasSurfaceRef = useRef<HTMLDivElement | null>(null);
	const annotationOverlayRef = useRef<HTMLDivElement | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const isDragArmedRef = useRef(false);
	const seekDragStateRef = useRef<SeekDragState | null>(null);
	const lastSeekClickRef = useRef<WaveformSeekClickState | null>(null);

	const sortedAnnotations = useMemo(
		() => [...annotations].sort((left, right) => left.startMs - right.startMs),
		[annotations],
	);
	const waveform = useMemo(
		() => normalizeWaveformData(audioFile.waveform, audioFile.durationMs),
		[audioFile.durationMs, audioFile.waveform],
	);
	const playheadTimeMs = Math.max(
		0,
		Math.min(currentTimeMs, audioFile.durationMs),
	);
	const playheadLeft = `${(playheadTimeMs / Math.max(audioFile.durationMs, 1)) * 100}%`;
	const hoveredAnnotationRecord = useMemo(
		() =>
			hoveredAnnotation
				? (annotations.find(
						(annotation) => annotation.id === hoveredAnnotation.annotationId,
					) ?? null)
				: null,
		[annotations, hoveredAnnotation],
	);
	const hoveredTooltipPosition = useMemo(() => {
		if (!hoveredAnnotation || !annotationOverlayRef.current) {
			return null;
		}

		const overlay = annotationOverlayRef.current;
		const width = overlay.clientWidth;
		const height = overlay.clientHeight;
		if (width <= 0 || height <= 0) {
			return null;
		}

		const anchorX = Math.max(10, Math.min(width - 10, hoveredAnnotation.x));
		const anchorY = Math.max(10, Math.min(height - 10, hoveredAnnotation.y));
		const placeLeft = anchorX > width * 0.62;
		const placeBelow = anchorY < 82;

		return {
			left: `${anchorX + (placeLeft ? -14 : 14)}px`,
			top: `${anchorY + (placeBelow ? 14 : -14)}px`,
			transform: `${placeLeft ? "translateX(-100%)" : "translateX(0)"} ${placeBelow ? "translateY(0)" : "translateY(-100%)"}`,
		};
	}, [hoveredAnnotation]);

	useEffect(() => {
		if (!blob) {
			setObjectUrl(null);
			return;
		}

		const nextObjectUrl = URL.createObjectURL(blob);
		setObjectUrl(nextObjectUrl);
		return () => {
			URL.revokeObjectURL(nextObjectUrl);
		};
	}, [blob]);

	useEffect(() => {
		if (!audioRef.current) {
			return;
		}

		const nextTime = Math.max(0, currentTimeMs / 1000);
		if (
			audioRef.current.paused &&
			Math.abs(audioRef.current.currentTime - nextTime) > 0.3
		) {
			audioRef.current.currentTime = nextTime;
		}
	}, [currentTimeMs]);

	useWaveformAudioGraph({
		audioRef,
		isPlaying,
		volumeDb: audioFile.volumeDb,
	});

	useWaveformCanvas({
		canvasRef,
		currentTimeMs,
		isSelected,
		surfaceRef: canvasSurfaceRef,
		waveform,
	});

	function isClientXYInCanvasSurface(
		clientX: number,
		clientY: number,
	): boolean {
		if (!canvasSurfaceRef.current) {
			return false;
		}

		const rect = canvasSurfaceRef.current.getBoundingClientRect();
		if (clientX < rect.left || clientX > rect.right) {
			return false;
		}

		if (!Number.isFinite(clientY)) {
			return true;
		}

		return clientY >= rect.top && clientY <= rect.bottom;
	}

	function getWaveformTimeMs(clientX: number): number | null {
		if (!canvasSurfaceRef.current) {
			return null;
		}

		const rect = canvasSurfaceRef.current.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return Math.round(audioFile.durationMs * ratio);
	}

	function getTimePerPixel(): number {
		if (!canvasSurfaceRef.current) {
			return 0;
		}

		const rect = canvasSurfaceRef.current.getBoundingClientRect();
		if (rect.width <= 0) {
			return 0;
		}

		return audioFile.durationMs / rect.width;
	}

	function updateHoveredAnnotationPosition(
		annotationId: string,
		clientX: number,
		clientY: number,
	) {
		const overlay = annotationOverlayRef.current;
		if (!overlay) {
			return;
		}

		const rect = overlay.getBoundingClientRect();
		setHoveredAnnotation({
			annotationId,
			x: clientX - rect.left,
			y: clientY - rect.top,
		});
	}

	async function createPointAnnotationAtTime(timeMs: number) {
		onSelectFile(audioFile.id);

		const annotation = await onCreateAnnotation({
			type: "point",
			startMs: timeMs,
			title: `Marker ${formatDuration(timeMs)}`,
			body: EMPTY_RICH_TEXT,
			color: "var(--color-annotation-4)",
		});
		onSelectAnnotation(annotation.id);
	}

	async function createRangeAnnotationAtTime(timeMs: number) {
		onSelectFile(audioFile.id);

		const annotation = await onCreateAnnotation({
			type: "range",
			startMs: timeMs,
			endMs: Math.min(
				audioFile.durationMs,
				timeMs + DEFAULT_RANGE_ANNOTATION_DURATION_MS,
			),
			title: `Range ${formatDuration(timeMs)}`,
			body: EMPTY_RICH_TEXT,
			color: "var(--color-annotation-2)",
		});
		onSelectAnnotation(annotation.id);
	}

	function clearSeekDragState(
		target: HTMLDivElement,
		pointerId: number,
	): SeekDragState | null {
		const dragState = seekDragStateRef.current;
		if (!dragState || dragState.pointerId !== pointerId) {
			return null;
		}

		seekDragStateRef.current = null;
		if (target.hasPointerCapture?.(pointerId)) {
			target.releasePointerCapture(pointerId);
		}
		return dragState;
	}

	const shouldIgnoreRowSelection = (target: EventTarget | null): boolean => {
		if (!(target instanceof HTMLElement)) {
			return true;
		}

		return Boolean(
			target.closest(
				[
					"button",
					"a",
					"input",
					"select",
					"textarea",
					"summary",
					"[role='button']",
					"[role='link']",
					"[contenteditable='true']",
				].join(","),
			),
		);
	};

	const setDragArmed = (isArmed: boolean) => {
		isDragArmedRef.current = isArmed;
		if (articleRef.current) {
			articleRef.current.draggable = isArmed;
		}
	};

	const sessionDateLabel = resolveAudioFileSessionDateLabel(audioFile);

	return (
		<article
			ref={articleRef}
			draggable={false}
			onPointerDown={(event) => {
				if (shouldIgnoreRowSelection(event.target)) {
					return;
				}

				onSelectFile(audioFile.id);
			}}
			onDragStart={(event) => {
				if (!isDragArmedRef.current) {
					event.preventDefault();
					return;
				}

				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", audioFile.id);

				const article = articleRef.current;
				if (article) {
					const bounds = article.getBoundingClientRect();
					const dragImageX = Number.isFinite(event.clientX)
						? Math.max(0, event.clientX - bounds.left)
						: 24;
					const dragImageY = Number.isFinite(event.clientY)
						? Math.max(0, event.clientY - bounds.top)
						: 24;
					event.dataTransfer.setDragImage(article, dragImageX, dragImageY);
				}

				onDragStart();
			}}
			onDragEnd={() => {
				setDragArmed(false);
				onDragEnd();
			}}
			onDragOver={(event) => event.preventDefault()}
			onDrop={(event) => {
				event.preventDefault();
				onDrop();
			}}
			className={`waveform-card ${isSelected ? "waveform-card--selected" : ""}`}
		>
			<span className="waveform-card__tab" aria-hidden="true" />
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<button
						type="button"
						aria-label={`Reorder ${audioFile.title}`}
						onPointerDown={() => {
							setDragArmed(true);
							onSelectFile(audioFile.id);
						}}
						onPointerUp={() => setDragArmed(false)}
						onPointerCancel={() => setDragArmed(false)}
						onBlur={() => setDragArmed(false)}
						className="inline-flex h-10 w-10 items-center justify-center border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]"
						title="Drag to reorder"
					>
						<GripVertical size={16} />
					</button>
					<div className="flex min-w-0 flex-1 items-baseline gap-3">
						<button
							type="button"
							onClick={() => onSelectFile(audioFile.id)}
							className="min-w-0 truncate text-left text-lg font-semibold text-[var(--color-text)]"
						>
							{audioFile.title}
						</button>
						{sessionDateLabel ? (
							<span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-[var(--color-text-muted)]">
								{sessionDateLabel}
							</span>
						) : null}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						aria-label={`Reset playhead for ${audioFile.title}`}
						title="Reset playhead to start"
						onClick={() => {
							onSelectFile(audioFile.id);
							void onSeek(0, false);
						}}
						className="action-secondary inline-flex h-9 w-9 items-center justify-center p-0"
					>
						<RotateCcw size={16} />
					</button>
					<button
						type="button"
						aria-label={isPlaying ? "Pause" : "Play"}
						title={isPlaying ? "Pause" : "Play"}
						onClick={() => {
							onSelectFile(audioFile.id);
							onTogglePlayback();
						}}
						className="action-primary inline-flex h-9 w-9 items-center justify-center p-0"
					>
						{isPlaying ? <Pause size={16} /> : <Play size={16} />}
					</button>
				</div>
			</div>

			<div>
				{/* biome-ignore lint/a11y/useSemanticElements: the waveform surface contains nested marker buttons, so a semantic button wrapper is not valid */}
				<div
					ref={waveformShellRef}
					className="waveform-surface relative grid overflow-hidden border border-[var(--color-border-subtle)]"
					style={{
						height:
							"calc(var(--song-workspace-waveform-height) + 2 * var(--waveform-marker-gutter-height))",
						gridTemplateRows:
							"var(--waveform-marker-gutter-height) minmax(0, 1fr) var(--waveform-marker-gutter-height)",
					}}
					role="button"
					tabIndex={0}
					aria-label={`Waveform for ${audioFile.title}`}
					onPointerLeave={() => {
						setHoveredAnnotation(null);
						setIsPlayheadAddMarkerVisible(false);
					}}
					onPointerDown={(event) => {
						if (
							event.button !== 0 ||
							(event.target as HTMLElement).closest(
								"[data-annotation-hit], [data-playhead-add-marker-hit], [data-playhead-add-range-hit]",
							)
						) {
							return;
						}

						if (!isClientXYInCanvasSurface(event.clientX, event.clientY)) {
							return;
						}

						const timeMs = getWaveformTimeMs(event.clientX);
						if (timeMs === null) {
							return;
						}

						onSelectFile(audioFile.id);
						seekDragStateRef.current = {
							pointerId: event.pointerId,
							timeMs,
						};
						event.currentTarget.setPointerCapture?.(event.pointerId);

						if (audioRef.current) {
							audioRef.current.currentTime = timeMs / 1000;
						}
						onReportPlayback({ currentTimeMs: timeMs });
					}}
					onPointerMove={(event) => {
						const dragState = seekDragStateRef.current;
						if (!dragState || dragState.pointerId !== event.pointerId) {
							return;
						}

						const timeMs = getWaveformTimeMs(event.clientX);
						if (timeMs === null || timeMs === dragState.timeMs) {
							return;
						}

						dragState.timeMs = timeMs;
						if (audioRef.current) {
							audioRef.current.currentTime = timeMs / 1000;
						}
						onReportPlayback({ currentTimeMs: timeMs });
					}}
					onPointerUp={(event) => {
						const dragState = clearSeekDragState(
							event.currentTarget,
							event.pointerId,
						);
						if (!dragState) {
							return;
						}

						lastSeekClickRef.current = {
							clientX: event.clientX,
							timeMs: dragState.timeMs,
						};
						void onSeek(dragState.timeMs, false);
					}}
					onPointerCancel={(event) => {
						clearSeekDragState(event.currentTarget, event.pointerId);
					}}
					onDoubleClick={(event) => {
						if (
							(event.target as HTMLElement).closest(
								"[data-annotation-hit], [data-playhead-add-marker-hit], [data-playhead-add-range-hit]",
							)
						) {
							return;
						}

						if (!isClientXYInCanvasSurface(event.clientX, event.clientY)) {
							return;
						}

						const lastSeekClick = lastSeekClickRef.current;
						const timeMs =
							lastSeekClick &&
							Math.abs(lastSeekClick.clientX - event.clientX) <= 1
								? lastSeekClick.timeMs
								: getWaveformTimeMs(event.clientX);
						if (timeMs === null) {
							return;
						}

						onSelectFile(audioFile.id);
						void onSeek(timeMs, true);
					}}
					onKeyDown={(event) => {
						if (event.key !== "Enter") {
							return;
						}

						event.preventDefault();
						const bounds = canvasSurfaceRef.current?.getBoundingClientRect();
						if (!bounds) {
							return;
						}

						void onSeek(Math.round(audioFile.durationMs / 2));
					}}
				>
					<div
						className="waveform-surface__gutter min-h-0 pointer-events-none"
						aria-hidden
					/>
					<div
						ref={canvasSurfaceRef}
						className="relative min-h-0 border-y border-[var(--color-border-subtle)]"
						data-testid="waveform-canvas-surface"
					>
						<canvas ref={canvasRef} className="block w-full" />
						<div
							className="pointer-events-none absolute bottom-0 top-0 z-10"
							style={{ left: playheadLeft }}
						>
							<button
								type="button"
								data-playhead-add-marker-hit
								data-testid="playhead-add-marker-button"
								data-visible={isPlayheadAddMarkerVisible}
								aria-label={`Add marker at ${formatDuration(playheadTimeMs)} for ${audioFile.title}`}
								title="Add point marker at playhead"
								onPointerDown={(event) => {
									event.stopPropagation();
								}}
								onPointerEnter={() => setIsPlayheadAddMarkerVisible(true)}
								onPointerLeave={() => setIsPlayheadAddMarkerVisible(false)}
								onFocus={() => setIsPlayheadAddMarkerVisible(true)}
								onBlur={(event) => {
									if (
										event.relatedTarget instanceof Node &&
										event.currentTarget.contains(event.relatedTarget)
									) {
										return;
									}

									setIsPlayheadAddMarkerVisible(false);
								}}
								onKeyDown={(event) => {
									event.stopPropagation();
									if (event.key === "Enter") {
										event.preventDefault();
										void createPointAnnotationAtTime(playheadTimeMs);
									}
									if (event.key === " ") {
										event.preventDefault();
									}
								}}
								onKeyUp={(event) => {
									event.stopPropagation();
									if (event.key !== " ") {
										return;
									}

									event.preventDefault();
									void createPointAnnotationAtTime(playheadTimeMs);
								}}
								onClick={(event) => {
									event.stopPropagation();
									void createPointAnnotationAtTime(playheadTimeMs);
								}}
								className={`pointer-events-auto absolute left-1/2 top-1 inline-flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm transition-all duration-150 focus-visible:opacity-100 focus-visible:scale-100 ${
									isPlayheadAddMarkerVisible
										? "border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] text-[var(--color-text)] opacity-100 scale-100"
										: "border-transparent bg-transparent text-[var(--color-text-muted)] opacity-0 scale-95"
								}`}
								style={{
									height: `${PLAYHEAD_ADD_MARKER_HOTSPOT_HEIGHT_PX}px`,
								}}
							>
								<Plus size={14} />
							</button>
							<button
								type="button"
								data-playhead-add-range-hit
								data-testid="playhead-add-range-button"
								data-visible={isPlayheadAddMarkerVisible}
								aria-label={`Add range at ${formatDuration(playheadTimeMs)} for ${audioFile.title}`}
								title="Add range at playhead"
								onPointerDown={(event) => {
									event.stopPropagation();
								}}
								onPointerEnter={() => setIsPlayheadAddMarkerVisible(true)}
								onPointerLeave={() => setIsPlayheadAddMarkerVisible(false)}
								onFocus={() => setIsPlayheadAddMarkerVisible(true)}
								onBlur={(event) => {
									if (
										event.relatedTarget instanceof Node &&
										event.currentTarget.contains(event.relatedTarget)
									) {
										return;
									}

									setIsPlayheadAddMarkerVisible(false);
								}}
								onClick={(event) => {
									event.stopPropagation();
									void createRangeAnnotationAtTime(playheadTimeMs);
								}}
								className={`pointer-events-auto absolute bottom-1 left-1/2 inline-flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm transition-all duration-150 focus-visible:opacity-100 focus-visible:scale-100 ${
									isPlayheadAddMarkerVisible
										? "border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] text-[var(--color-text)] opacity-100 scale-100"
										: "border-transparent bg-transparent text-[var(--color-text-muted)] opacity-0 scale-95"
								}`}
								style={{
									height: `${PLAYHEAD_ADD_MARKER_HOTSPOT_HEIGHT_PX}px`,
								}}
							>
								<UnfoldHorizontal size={14} />
							</button>
						</div>
					</div>
					<div
						className="waveform-surface__gutter min-h-0 pointer-events-none"
						aria-hidden
					/>
					<div
						ref={annotationOverlayRef}
						className="pointer-events-none absolute inset-0 z-20"
						data-testid="waveform-annotation-overlay"
					>
						<WaveformCardAnnotationLayer
							activeAnnotationId={activeAnnotationId}
							audioFile={audioFile}
							annotations={sortedAnnotations}
							hoveredAnnotationRecord={hoveredAnnotationRecord}
							hoveredTooltipPosition={hoveredTooltipPosition}
							onSeek={onSeek}
							onSelectAnnotation={onSelectAnnotation}
							onSelectFile={onSelectFile}
							onUpdateAnnotation={onUpdateAnnotation}
							getTimePerPixel={getTimePerPixel}
							setHoveredAnnotation={setHoveredAnnotation}
							showPointMarkerConvertControl
							updateHoveredAnnotationPosition={updateHoveredAnnotationPosition}
						/>
					</div>
				</div>
			</div>

			<div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--color-text-subtle)]">
				<span className="tabular-nums">
					{formatDuration(currentTimeMs)} /{" "}
					{formatDuration(audioFile.durationMs)}
				</span>
				<div className="inline-flex items-center gap-1.5">
					<button
						type="button"
						onClick={() => void onStepVolume(-1)}
						disabled={audioFile.volumeDb <= MIN_VOLUME_DB}
						aria-label={`Decrease volume for ${audioFile.title}`}
						className="icon-button icon-button--sm disabled:cursor-not-allowed disabled:opacity-45"
					>
						<Minus size={12} />
					</button>
					<output
						aria-live="polite"
						className="min-w-[3rem] text-center text-xs font-semibold tabular-nums text-[var(--color-text)]"
					>
						{formatVolumeDb(audioFile.volumeDb)}
					</output>
					<button
						type="button"
						onClick={() => void onStepVolume(1)}
						disabled={audioFile.volumeDb >= MAX_VOLUME_DB}
						aria-label={`Increase volume for ${audioFile.title}`}
						className="icon-button icon-button--sm disabled:cursor-not-allowed disabled:opacity-45"
					>
						<Plus size={12} />
					</button>
				</div>
			</div>

			{/* biome-ignore lint/a11y/useMediaCaption: hidden transport audio is controlled programmatically instead of being exposed as standalone media */}
			<audio
				ref={(element) => {
					audioRef.current = element;
					onRegisterAudioElement(element);
				}}
				src={objectUrl ?? undefined}
				preload="metadata"
				className="hidden"
				onPlay={(event) =>
					onReportPlayback({
						isPlaying: true,
						currentTimeMs: event.currentTarget.currentTime * 1000,
					})
				}
				onPause={(event) =>
					onReportPlayback({
						isPlaying: false,
						currentTimeMs: event.currentTarget.currentTime * 1000,
					})
				}
				onTimeUpdate={(event) =>
					onReportPlayback({
						currentTimeMs: event.currentTarget.currentTime * 1000,
					})
				}
				onLoadedMetadata={() => {
					if (
						audioRef.current &&
						Math.abs(audioRef.current.currentTime - currentTimeMs / 1000) > 0.3
					) {
						audioRef.current.currentTime = currentTimeMs / 1000;
					}
				}}
				onEnded={() =>
					onReportPlayback({
						isPlaying: false,
						currentTimeMs: audioFile.durationMs,
					})
				}
			/>
		</article>
	);
}

function formatVolumeDb(volumeDb: number): string {
	if (volumeDb > 0) {
		return `+${volumeDb} dB`;
	}

	return `${volumeDb} dB`;
}
