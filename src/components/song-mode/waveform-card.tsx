import {
	Flag,
	GripVertical,
	Minus,
	Pause,
	Play,
	Plus,
	RotateCcw,
	SquareStack,
	TimerReset,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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

type WaveformMode = "seek" | "point" | "range";

interface HoveredAnnotationState {
	annotationId: string;
	x: number;
	y: number;
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
	const [mode, setMode] = useState<WaveformMode>("seek");
	const [rangeAnchorMs, setRangeAnchorMs] = useState<number | null>(null);
	const [hoveredAnnotation, setHoveredAnnotation] =
		useState<HoveredAnnotationState | null>(null);
	const articleRef = useRef<HTMLElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const surfaceRef = useRef<HTMLDivElement | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const isDragArmedRef = useRef(false);

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
		if (!hoveredAnnotation || !surfaceRef.current) {
			return null;
		}

		const width = surfaceRef.current.clientWidth;
		const height = surfaceRef.current.clientHeight;
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
		mode,
		rangeAnchorMs,
		surfaceRef,
		waveform,
	});

	function getWaveformTimeMs(clientX: number): number | null {
		if (!surfaceRef.current) {
			return null;
		}

		const rect = surfaceRef.current.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return Math.round(audioFile.durationMs * ratio);
	}

	function getTimePerPixel(): number {
		if (!surfaceRef.current) {
			return 0;
		}

		const rect = surfaceRef.current.getBoundingClientRect();
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
		if (!surfaceRef.current) {
			return;
		}

		const rect = surfaceRef.current.getBoundingClientRect();
		setHoveredAnnotation({
			annotationId,
			x: clientX - rect.left,
			y: clientY - rect.top,
		});
	}

	async function handleWaveformAction(clientX: number, autoplay?: boolean) {
		const timeMs = getWaveformTimeMs(clientX);
		if (timeMs === null) {
			return;
		}

		onSelectFile(audioFile.id);

		if (mode === "seek") {
			if (typeof autoplay === "boolean") {
				await onSeek(timeMs, autoplay);
				return;
			}

			await onSeek(timeMs);
			return;
		}

		if (mode === "point") {
			const annotation = await onCreateAnnotation({
				type: "point",
				startMs: timeMs,
				title: `Marker ${formatDuration(timeMs)}`,
				body: EMPTY_RICH_TEXT,
				color: "var(--color-annotation-4)",
			});
			onSelectAnnotation(annotation.id);
			setMode("seek");
			return;
		}

		if (rangeAnchorMs === null) {
			setRangeAnchorMs(timeMs);
			return;
		}

		const startMs = Math.min(rangeAnchorMs, timeMs);
		const endMs = Math.max(rangeAnchorMs, timeMs);
		const annotation = await onCreateAnnotation({
			type: "range",
			startMs,
			endMs,
			title: `Range ${formatDuration(startMs)}`,
			body: EMPTY_RICH_TEXT,
			color: "var(--color-annotation-2)",
		});
		onSelectAnnotation(annotation.id);
		setRangeAnchorMs(null);
		setMode("seek");
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
					<ModeButton
						icon={<TimerReset size={14} />}
						active={mode === "seek"}
						label="Seek"
						onClick={() => {
							setMode("seek");
							setRangeAnchorMs(null);
						}}
					/>
					<ModeButton
						icon={<Flag size={14} />}
						active={mode === "point"}
						label="Point"
						onClick={() => {
							setMode("point");
							setRangeAnchorMs(null);
						}}
					/>
					<ModeButton
						icon={<SquareStack size={14} />}
						active={mode === "range"}
						label={rangeAnchorMs === null ? "Range" : "Finish range"}
						onClick={() => {
							setMode("range");
						}}
					/>
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

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
				{/* biome-ignore lint/a11y/useSemanticElements: the waveform surface contains nested marker buttons, so a semantic button wrapper is not valid */}
				<div
					ref={surfaceRef}
					className="waveform-surface relative overflow-hidden border border-[var(--color-border-subtle)]"
					role="button"
					tabIndex={0}
					aria-label={`Waveform for ${audioFile.title}`}
					onPointerLeave={() => setHoveredAnnotation(null)}
					onClick={(event) => {
						if (
							(event.target as HTMLElement).closest("[data-annotation-hit]")
						) {
							return;
						}
						void handleWaveformAction(event.clientX);
					}}
					onDoubleClick={(event) => {
						if (
							mode !== "seek" ||
							(event.target as HTMLElement).closest("[data-annotation-hit]")
						) {
							return;
						}
						void handleWaveformAction(event.clientX, true);
					}}
					onKeyDown={(event) => {
						if (event.key !== "Enter") {
							return;
						}

						event.preventDefault();
						const bounds = surfaceRef.current?.getBoundingClientRect();
						if (!bounds) {
							return;
						}

						void handleWaveformAction(bounds.left + bounds.width / 2);
					}}
				>
					<button
						type="button"
						aria-label={`Reset playhead for ${audioFile.title}`}
						title="Reset playhead to start"
						onClick={(event) => {
							event.stopPropagation();
							onSelectFile(audioFile.id);
							void onSeek(0, false);
						}}
						className="absolute left-1 top-1 z-10 inline-flex h-8 w-8 items-center justify-center border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] shadow-sm transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
					>
						<RotateCcw size={14} />
					</button>
					<canvas ref={canvasRef} className="block w-full" />
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
						updateHoveredAnnotationPosition={updateHoveredAnnotationPosition}
					/>
					{mode === "range" && rangeAnchorMs !== null && (
						<div className="range-hint-pill pointer-events-none absolute bottom-3 left-3 px-3 py-1 text-xs font-medium">
							Pick the range end point
						</div>
					)}
				</div>

				<div className="flex min-w-[5.75rem] flex-col items-stretch justify-center border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] px-2 py-3">
					<span className="field-label text-center text-[0.56rem]">Volume</span>
					<div className="mt-2 flex items-center justify-between gap-2">
						<button
							type="button"
							onClick={() => void onStepVolume(-1)}
							disabled={audioFile.volumeDb <= MIN_VOLUME_DB}
							aria-label={`Decrease volume for ${audioFile.title}`}
							className="icon-button h-8 w-8 disabled:cursor-not-allowed disabled:opacity-45"
						>
							<Minus size={14} />
						</button>
						<button
							type="button"
							onClick={() => void onStepVolume(1)}
							disabled={audioFile.volumeDb >= MAX_VOLUME_DB}
							aria-label={`Increase volume for ${audioFile.title}`}
							className="icon-button h-8 w-8 disabled:cursor-not-allowed disabled:opacity-45"
						>
							<Plus size={14} />
						</button>
					</div>
					<output
						aria-live="polite"
						className="mt-3 text-center text-sm font-semibold text-[var(--color-text)]"
					>
						{formatVolumeDb(audioFile.volumeDb)}
					</output>
				</div>
			</div>

			<div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--color-text-subtle)]">
				<span>
					{formatDuration(currentTimeMs)} /{" "}
					{formatDuration(audioFile.durationMs)}
				</span>
				<span>
					{mode === "seek"
						? "Click to seek · Double-click to play"
						: mode === "point"
							? "Click to add a point marker"
							: rangeAnchorMs === null
								? "Click to set a range start"
								: "Click again to finish the range"}
				</span>
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

function ModeButton({
	icon,
	active,
	label,
	onClick,
}: {
	icon: ReactNode;
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium ${
				active
					? "border-[var(--color-accent-strong)] bg-[var(--color-accent-surface)] text-[var(--color-text)]"
					: "border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]"
			}`}
		>
			{icon}
			{label}
		</button>
	);
}
