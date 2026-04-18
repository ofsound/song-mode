import {
	Brackets,
	GripVertical,
	MapPin,
	Minus,
	Pause,
	Play,
	Plus,
	RotateCcw,
	X,
} from "lucide-react";
import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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

const DEFAULT_RANGE_ANNOTATION_DURATION_MS = 10_000;
const PLAYHEAD_SNAP_DISTANCE_PX = 20;

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

interface GutterHoverState {
	position: "top" | "bottom";
	x: number;
	timeMs: number;
}

interface BottomGutterDragState {
	pointerId: number;
	anchorTimeMs: number;
	currentTimeMs: number;
	moved: boolean;
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
	onDeleteAnnotation: (annotationId: string) => Promise<void>;
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
	onDeleteAnnotation,
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
	const [gutterHover, setGutterHover] = useState<GutterHoverState | null>(null);
	const [bottomGutterDrag, setBottomGutterDrag] =
		useState<BottomGutterDragState | null>(null);
	const [pendingRangeStartMs, setPendingRangeStartMs] = useState<number | null>(
		null,
	);
	const bottomGutterDragStateRef = useRef<BottomGutterDragState | null>(null);
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

	function getPlayheadClientX(): number | null {
		if (isPlaying || !canvasSurfaceRef.current) {
			return null;
		}

		const rect = canvasSurfaceRef.current.getBoundingClientRect();
		if (rect.width <= 0) {
			return null;
		}

		const clampedTimeMs = Math.max(
			0,
			Math.min(currentTimeMs, audioFile.durationMs),
		);
		const ratio = clampedTimeMs / Math.max(audioFile.durationMs, 1);
		return rect.left + ratio * rect.width;
	}

	function snapClientXToPlayhead(clientX: number): number {
		const playheadClientX = getPlayheadClientX();
		if (
			playheadClientX !== null &&
			Math.abs(clientX - playheadClientX) <= PLAYHEAD_SNAP_DISTANCE_PX
		) {
			return playheadClientX;
		}
		return clientX;
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
		await createRangeAnnotationFromBounds(
			timeMs,
			Math.min(
				audioFile.durationMs,
				timeMs + DEFAULT_RANGE_ANNOTATION_DURATION_MS,
			),
		);
	}

	async function createRangeAnnotationFromBounds(
		startMs: number,
		endMs: number,
	) {
		onSelectFile(audioFile.id);

		const annotation = await onCreateAnnotation({
			type: "range",
			startMs,
			endMs,
			title: `Range ${formatDuration(startMs)}`,
			body: EMPTY_RICH_TEXT,
			color: "var(--color-annotation-2)",
		});
		onSelectAnnotation(annotation.id);
	}

	function clampPlayheadTimeMs(): number {
		return Math.max(0, Math.min(currentTimeMs, audioFile.durationMs));
	}

	async function handleAddMarkerAtPlayhead() {
		await createPointAnnotationAtTime(clampPlayheadTimeMs());
	}

	function handleStartRangeAtPlayhead() {
		onSelectFile(audioFile.id);
		setPendingRangeStartMs(clampPlayheadTimeMs());
	}

	async function handleEndRangeAtPlayhead() {
		if (pendingRangeStartMs === null) {
			return;
		}

		const startCandidate = pendingRangeStartMs;
		const endCandidate = clampPlayheadTimeMs();
		let startMs = Math.min(startCandidate, endCandidate);
		let endMs = Math.max(startCandidate, endCandidate);

		if (endMs - startMs < 1) {
			endMs = Math.min(
				audioFile.durationMs,
				startMs + DEFAULT_RANGE_ANNOTATION_DURATION_MS,
			);
			if (endMs <= startMs) {
				startMs = Math.max(0, endMs - DEFAULT_RANGE_ANNOTATION_DURATION_MS);
			}
		}

		setPendingRangeStartMs(null);
		await createRangeAnnotationFromBounds(startMs, endMs);
	}

	function handleCancelPendingRange() {
		setPendingRangeStartMs(null);
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

	function handleGutterPointerMove(
		position: "top" | "bottom",
		event: ReactPointerEvent<HTMLDivElement>,
	) {
		const gutter = event.currentTarget;
		const rect = gutter.getBoundingClientRect();
		const snappedClientX = snapClientXToPlayhead(event.clientX);
		const timeMs = getWaveformTimeMs(snappedClientX);
		if (timeMs === null) {
			return;
		}

		setGutterHover({
			position,
			x: snappedClientX - rect.left,
			timeMs,
		});
	}

	function handleGutterPointerLeave() {
		setGutterHover(null);
	}

	function handleTopGutterClick(event: ReactMouseEvent<HTMLDivElement>) {
		event.stopPropagation();
		const timeMs = getWaveformTimeMs(snapClientXToPlayhead(event.clientX));
		if (timeMs === null) {
			return;
		}

		void createPointAnnotationAtTime(timeMs);
	}

	function clearBottomGutterDrag(target: HTMLDivElement, pointerId: number) {
		bottomGutterDragStateRef.current = null;
		setBottomGutterDrag(null);
		if (target.hasPointerCapture?.(pointerId)) {
			target.releasePointerCapture(pointerId);
		}
	}

	function handleBottomGutterPointerDown(
		event: ReactPointerEvent<HTMLDivElement>,
	) {
		if (event.button !== 0) {
			return;
		}

		const timeMs = getWaveformTimeMs(snapClientXToPlayhead(event.clientX));
		if (timeMs === null) {
			return;
		}

		event.stopPropagation();
		onSelectFile(audioFile.id);

		const dragState: BottomGutterDragState = {
			pointerId: event.pointerId,
			anchorTimeMs: timeMs,
			currentTimeMs: timeMs,
			moved: false,
		};
		bottomGutterDragStateRef.current = dragState;
		setBottomGutterDrag(dragState);
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}

	function handleBottomGutterPointerMove(
		event: ReactPointerEvent<HTMLDivElement>,
	) {
		handleGutterPointerMove("bottom", event);

		const dragState = bottomGutterDragStateRef.current;
		if (!dragState || dragState.pointerId !== event.pointerId) {
			return;
		}

		const timeMs = getWaveformTimeMs(event.clientX);
		if (timeMs === null || timeMs === dragState.currentTimeMs) {
			return;
		}

		const moved = dragState.moved || timeMs !== dragState.anchorTimeMs;
		const nextState: BottomGutterDragState = {
			...dragState,
			currentTimeMs: timeMs,
			moved,
		};
		bottomGutterDragStateRef.current = nextState;
		setBottomGutterDrag(nextState);
	}

	async function handleBottomGutterPointerUp(
		event: ReactPointerEvent<HTMLDivElement>,
	) {
		const dragState = bottomGutterDragStateRef.current;
		if (!dragState || dragState.pointerId !== event.pointerId) {
			return;
		}

		event.stopPropagation();
		clearBottomGutterDrag(event.currentTarget, event.pointerId);

		if (!dragState.moved) {
			await createRangeAnnotationAtTime(dragState.anchorTimeMs);
			return;
		}

		const startMs = Math.min(dragState.anchorTimeMs, dragState.currentTimeMs);
		const endMs = Math.max(dragState.anchorTimeMs, dragState.currentTimeMs);
		await createRangeAnnotationFromBounds(startMs, endMs);
	}

	function handleBottomGutterPointerCancel(
		event: ReactPointerEvent<HTMLDivElement>,
	) {
		const dragState = bottomGutterDragStateRef.current;
		if (!dragState || dragState.pointerId !== event.pointerId) {
			return;
		}

		clearBottomGutterDrag(event.currentTarget, event.pointerId);
	}

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
						aria-label={`Add marker at playhead for ${audioFile.title}`}
						title={`Add marker at ${formatDuration(clampPlayheadTimeMs())}`}
						onClick={() => {
							void handleAddMarkerAtPlayhead();
						}}
						className="action-secondary inline-flex h-9 items-center gap-1.5 px-3 text-xs font-medium"
					>
						<MapPin size={14} />
						<span>Add marker</span>
					</button>
					{pendingRangeStartMs === null ? (
						<button
							type="button"
							aria-label={`Start range at playhead for ${audioFile.title}`}
							title={`Start range at ${formatDuration(clampPlayheadTimeMs())}`}
							onClick={handleStartRangeAtPlayhead}
							className="action-secondary inline-flex h-9 items-center gap-1.5 px-3 text-xs font-medium"
						>
							<Brackets size={14} />
							<span>Start range</span>
						</button>
					) : (
						<>
							<button
								type="button"
								aria-label={`End range at playhead for ${audioFile.title}`}
								title={`End range (started at ${formatDuration(pendingRangeStartMs)})`}
								onClick={() => {
									void handleEndRangeAtPlayhead();
								}}
								className="action-primary inline-flex h-9 items-center gap-1.5 px-3 text-xs font-medium"
							>
								<Brackets size={14} />
								<span>End range @ {formatDuration(pendingRangeStartMs)}</span>
							</button>
							<button
								type="button"
								aria-label={`Cancel pending range for ${audioFile.title}`}
								title="Cancel pending range"
								onClick={handleCancelPendingRange}
								className="action-secondary inline-flex h-9 w-9 items-center justify-center p-0"
							>
								<X size={16} />
							</button>
						</>
					)}
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
						setGutterHover(null);
					}}
					onPointerDown={(event) => {
						if (
							event.button !== 0 ||
							(event.target as HTMLElement).closest("[data-annotation-hit]")
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
							(event.target as HTMLElement).closest("[data-annotation-hit]")
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
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only gutter quick-add; keyboard users cannot pick an arbitrary time on the gutter */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only quick-add affordance; the gutter does not behave as a single button because the click position picks the time */}
					<div
						className="waveform-surface__gutter relative min-h-0"
						data-testid="waveform-gutter-top"
						onPointerEnter={(event) => handleGutterPointerMove("top", event)}
						onPointerMove={(event) => handleGutterPointerMove("top", event)}
						onPointerLeave={handleGutterPointerLeave}
						onClick={handleTopGutterClick}
					>
						{gutterHover?.position === "top" ? (
							<span
								aria-hidden
								data-testid="gutter-add-marker-icon"
								className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
								style={{ left: `${gutterHover.x}px` }}
							>
								<Plus size={14} />
							</span>
						) : null}
					</div>
					<div
						ref={canvasSurfaceRef}
						className="relative min-h-0 border-y border-[var(--color-border-subtle)]"
						data-testid="waveform-canvas-surface"
					>
						<canvas ref={canvasRef} className="block w-full" />
					</div>
					<div
						className="waveform-surface__gutter relative min-h-0"
						data-testid="waveform-gutter-bottom"
						onPointerEnter={(event) => handleGutterPointerMove("bottom", event)}
						onPointerMove={handleBottomGutterPointerMove}
						onPointerLeave={handleGutterPointerLeave}
						onPointerDown={handleBottomGutterPointerDown}
						onPointerUp={handleBottomGutterPointerUp}
						onPointerCancel={handleBottomGutterPointerCancel}
					>
						{bottomGutterDrag?.moved ? (
							<span
								aria-hidden
								data-testid="gutter-add-range-preview"
								className="pointer-events-none absolute inset-y-0"
								style={{
									left: `${
										(Math.min(
											bottomGutterDrag.anchorTimeMs,
											bottomGutterDrag.currentTimeMs,
										) /
											Math.max(audioFile.durationMs, 1)) *
										100
									}%`,
									width: `${
										(Math.abs(
											bottomGutterDrag.currentTimeMs -
												bottomGutterDrag.anchorTimeMs,
										) /
											Math.max(audioFile.durationMs, 1)) *
										100
									}%`,
									backgroundColor: "var(--color-annotation-2)",
									opacity: 0.45,
								}}
							/>
						) : null}
						{gutterHover?.position === "bottom" && !bottomGutterDrag ? (
							<span
								aria-hidden
								data-testid="gutter-add-range-icon"
								className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
								style={{ left: `${gutterHover.x}px` }}
							>
								<Plus size={14} />
							</span>
						) : null}
					</div>
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
							onDeleteAnnotation={onDeleteAnnotation}
							onSeek={onSeek}
							onSelectAnnotation={onSelectAnnotation}
							onSelectFile={onSelectFile}
							onUpdateAnnotation={onUpdateAnnotation}
							getTimePerPixel={getTimePerPixel}
							setHoveredAnnotation={setHoveredAnnotation}
							updateHoveredAnnotationPosition={updateHoveredAnnotationPosition}
						/>
					</div>
				</div>
			</div>

			<div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--color-text-subtle)]">
				<span className="text-sm tabular-nums text-[var(--color-text)]">
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
