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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_RICH_TEXT, richTextPreview } from "#/lib/song-mode/rich-text";
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
	volumeDbToGain,
} from "#/lib/song-mode/waveform";
import { useTheme } from "#/providers/theme-provider";

type WaveformMode = "seek" | "point" | "range";

interface AudioGraph {
	context: AudioContext;
	sourceNode: MediaElementAudioSourceNode;
	gainNode: GainNode;
}

interface HoveredAnnotationState {
	annotationId: string;
	x: number;
	y: number;
}

const audioGraphByElement = new WeakMap<HTMLAudioElement, AudioGraph>();

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
	const { theme } = useTheme();
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [mode, setMode] = useState<WaveformMode>("seek");
	const [rangeAnchorMs, setRangeAnchorMs] = useState<number | null>(null);
	const articleRef = useRef<HTMLElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const surfaceRef = useRef<HTMLDivElement | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
	const gainNodeRef = useRef<GainNode | null>(null);
	const isDragArmedRef = useRef(false);
	const markerDragStateRef = useRef<{
		annotationId: string;
		pointerId: number;
		lastX: number;
		valueMs: number;
		dragging: boolean;
	} | null>(null);
	const suppressAnnotationClickRef = useRef<string | null>(null);
	const [hoveredAnnotation, setHoveredAnnotation] =
		useState<HoveredAnnotationState | null>(null);

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

	const ensureAudioGraph = useCallback(() => {
		if (typeof window === "undefined") {
			return null;
		}

		if (
			audioContextRef.current &&
			sourceNodeRef.current &&
			gainNodeRef.current
		) {
			return audioContextRef.current;
		}

		const element = audioRef.current;
		if (!element) {
			return null;
		}

		const existingGraph = audioGraphByElement.get(element);
		if (existingGraph) {
			audioContextRef.current = existingGraph.context;
			sourceNodeRef.current = existingGraph.sourceNode;
			gainNodeRef.current = existingGraph.gainNode;
			element.volume = 1;
			return existingGraph.context;
		}

		const AudioContextCtor =
			window.AudioContext ||
			(window as Window & { webkitAudioContext?: typeof AudioContext })
				.webkitAudioContext;

		if (!AudioContextCtor) {
			return null;
		}

		const context = new AudioContextCtor();
		const source = context.createMediaElementSource(element);
		const gainNode = context.createGain();

		source.connect(gainNode);
		gainNode.connect(context.destination);

		audioGraphByElement.set(element, {
			context,
			sourceNode: source,
			gainNode,
		});
		audioContextRef.current = context;
		sourceNodeRef.current = source;
		gainNodeRef.current = gainNode;
		element.volume = 1;

		return context;
	}, []);

	useEffect(() => {
		const context = ensureAudioGraph();
		const gainNode = gainNodeRef.current;
		const nextGain = volumeDbToGain(audioFile.volumeDb);

		if (context && gainNode) {
			gainNode.gain.value = nextGain;
			return;
		}

		if (audioRef.current) {
			audioRef.current.volume = Math.min(1, nextGain);
		}
	}, [audioFile.volumeDb, ensureAudioGraph]);

	useEffect(() => {
		if (!isPlaying) {
			return;
		}

		const context = ensureAudioGraph();
		if (!context || context.state !== "suspended") {
			return;
		}

		void context.resume().catch(() => undefined);
	}, [ensureAudioGraph, isPlaying]);

	useEffect(() => {
		return () => {
			audioContextRef.current = null;
			sourceNodeRef.current = null;
			gainNodeRef.current = null;
		};
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		const surface = surfaceRef.current;
		void theme;
		if (!canvas || !surface) {
			return;
		}

		const context = canvas.getContext("2d");
		if (!context) {
			return;
		}

		const draw = () => {
			const width = Math.round(surface.clientWidth);
			const height = 164;
			if (width <= 0) {
				return false;
			}

			const ratio = window.devicePixelRatio || 1;
			const styles = window.getComputedStyle(surface);
			const readColor = (name: string) =>
				styles.getPropertyValue(name).trim() || "transparent";
			canvas.width = width * ratio;
			canvas.height = height * ratio;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;

			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			context.clearRect(0, 0, width, height);

			context.fillStyle = readColor("--canvas-waveform-surface");
			context.fillRect(0, 0, width, height);

			context.strokeStyle = readColor("--canvas-waveform-grid");
			context.lineWidth = 1;
			context.beginPath();
			context.moveTo(0, height / 2);
			context.lineTo(width, height / 2);
			context.stroke();

			const peaks = waveform.peaks;
			const step = width / Math.max(peaks.length, 1);
			const middle = height / 2;

			for (let index = 0; index < peaks.length; index += 1) {
				const peak = peaks[index] ?? 0;
				const x = index * step;
				const y = Math.max(2, peak * (height * 0.42));

				context.strokeStyle = isSelected
					? readColor("--canvas-waveform-selected")
					: readColor("--canvas-waveform-base");
				context.lineWidth = Math.max(1, step * 0.68);
				context.beginPath();
				context.moveTo(x, middle - y);
				context.lineTo(x, middle + y);
				context.stroke();
			}

			const progressX =
				width * (currentTimeMs / Math.max(waveform.durationMs, 1));
			context.fillStyle = readColor("--canvas-waveform-progress");
			context.fillRect(0, 0, progressX, height);
			context.strokeStyle = readColor("--canvas-waveform-progress-line");
			context.lineWidth = 2;
			context.beginPath();
			context.moveTo(progressX, 0);
			context.lineTo(progressX, height);
			context.stroke();

			if (mode === "range" && rangeAnchorMs !== null) {
				const anchorX =
					width * (rangeAnchorMs / Math.max(waveform.durationMs, 1));
				context.strokeStyle = readColor("--canvas-waveform-range");
				context.setLineDash([7, 5]);
				context.beginPath();
				context.moveTo(anchorX, 0);
				context.lineTo(anchorX, height);
				context.stroke();
				context.setLineDash([]);
			}
			return true;
		};

		let frameId = 0;
		const scheduleDraw = () => {
			if (frameId) {
				window.cancelAnimationFrame(frameId);
			}

			frameId = window.requestAnimationFrame(() => {
				if (!draw()) {
					frameId = window.requestAnimationFrame(() => {
						draw();
					});
				}
			});
		};

		const observer = new ResizeObserver(scheduleDraw);
		observer.observe(surface);
		scheduleDraw();

		return () => {
			observer.disconnect();
			if (frameId) {
				window.cancelAnimationFrame(frameId);
			}
		};
	}, [
		currentTimeMs,
		isSelected,
		mode,
		rangeAnchorMs,
		theme,
		waveform.durationMs,
		waveform.peaks,
	]);

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

	function endMarkerDrag(
		event: React.PointerEvent<HTMLButtonElement>,
		preserveFocus = true,
	) {
		const dragState = markerDragStateRef.current;
		if (!dragState || dragState.pointerId !== event.pointerId) {
			return;
		}

		if (dragState.dragging) {
			event.preventDefault();
			suppressAnnotationClickRef.current = dragState.annotationId;
		}

		markerDragStateRef.current = null;
		document.body.style.removeProperty("user-select");
		if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		if (preserveFocus) {
			event.currentTarget.focus();
		}
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
					<div className="min-w-0">
						<button
							type="button"
							onClick={() => onSelectFile(audioFile.id)}
							className="block truncate text-left text-lg font-semibold text-[var(--color-text)]"
						>
							{audioFile.title}
						</button>
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

					{sortedAnnotations.map((annotation) => {
						const left = `${(annotation.startMs / Math.max(audioFile.durationMs, 1)) * 100}%`;
						const right =
							annotation.type === "range" && annotation.endMs
								? `${((annotation.endMs - annotation.startMs) / Math.max(audioFile.durationMs, 1)) * 100}%`
								: undefined;

						if (annotation.type === "range" && annotation.endMs) {
							return (
								<button
									key={annotation.id}
									type="button"
									data-annotation-hit
									aria-label={buildAnnotationAriaLabel(annotation)}
									onPointerEnter={(event) =>
										updateHoveredAnnotationPosition(
											annotation.id,
											event.clientX,
											event.clientY,
										)
									}
									onPointerMove={(event) =>
										updateHoveredAnnotationPosition(
											annotation.id,
											event.clientX,
											event.clientY,
										)
									}
									onPointerLeave={() => setHoveredAnnotation(null)}
									onClick={(event) => {
										event.stopPropagation();
										onSelectFile(audioFile.id);
										onSelectAnnotation(annotation.id);
										void onSeek(annotation.startMs, true);
									}}
									className={`absolute bottom-4 top-4 border ${
										activeAnnotationId === annotation.id
											? "border-[var(--color-waveform-annotation-active)] shadow-[0_0_0_1px_var(--color-waveform-annotation-active)]"
											: "border-[var(--color-waveform-annotation-inactive)]"
									}`}
									style={{
										left,
										width: right,
										backgroundColor:
											annotation.color ?? "var(--color-annotation-2)",
										opacity: activeAnnotationId === annotation.id ? 0.34 : 0.2,
									}}
								/>
							);
						}

						return (
							<button
								key={annotation.id}
								type="button"
								data-annotation-hit
								aria-label={buildAnnotationAriaLabel(annotation)}
								onClick={(event) => {
									if (suppressAnnotationClickRef.current === annotation.id) {
										suppressAnnotationClickRef.current = null;
										event.preventDefault();
										event.stopPropagation();
										return;
									}

									event.stopPropagation();
									onSelectFile(audioFile.id);
									onSelectAnnotation(annotation.id);
									void onSeek(annotation.startMs, true);
								}}
								onPointerDown={(event) => {
									if (
										event.button !== 0 ||
										!(event.target instanceof HTMLElement) ||
										!event.target.closest("[data-marker-handle]")
									) {
										return;
									}

									event.stopPropagation();
									setHoveredAnnotation(null);
									markerDragStateRef.current = {
										annotationId: annotation.id,
										pointerId: event.pointerId,
										lastX: event.clientX,
										valueMs: annotation.startMs,
										dragging: false,
									};
									event.currentTarget.setPointerCapture?.(event.pointerId);
								}}
								onPointerMove={(event) => {
									const dragState = markerDragStateRef.current;
									if (
										!dragState ||
										dragState.pointerId !== event.pointerId ||
										dragState.annotationId !== annotation.id
									) {
										return;
									}

									const timePerPixel = getTimePerPixel();
									if (timePerPixel <= 0) {
										return;
									}

									const deltaX = event.clientX - dragState.lastX;
									dragState.lastX = event.clientX;
									if (deltaX === 0) {
										return;
									}

									const sensitivity = event.shiftKey ? 0.25 : 1;
									const nextValue = Math.max(
										0,
										Math.min(
											audioFile.durationMs,
											Math.round(
												dragState.valueMs + deltaX * timePerPixel * sensitivity,
											),
										),
									);
									if (nextValue === dragState.valueMs) {
										return;
									}

									if (!dragState.dragging) {
										dragState.dragging = true;
										document.body.style.userSelect = "none";
										onSelectFile(audioFile.id);
										onSelectAnnotation(annotation.id);
									}

									event.preventDefault();
									event.stopPropagation();
									dragState.valueMs = nextValue;
									void onUpdateAnnotation(annotation.id, {
										startMs: nextValue,
									});
								}}
								onPointerUp={(event) => endMarkerDrag(event)}
								onPointerCancel={(event) => endMarkerDrag(event, false)}
								className="absolute bottom-0 top-0 w-3 -translate-x-1/2"
								style={{ left }}
							>
								<span
									className={`absolute bottom-0 top-0 left-1/2 w-0.5 -translate-x-1/2 ${
										activeAnnotationId === annotation.id
											? "bg-[var(--color-waveform-marker-active)]"
											: "bg-[var(--color-waveform-marker-track)]"
									}`}
								/>
								<span
									data-marker-handle
									onPointerEnter={(event) =>
										updateHoveredAnnotationPosition(
											annotation.id,
											event.clientX,
											event.clientY,
										)
									}
									onPointerMove={(event) =>
										updateHoveredAnnotationPosition(
											annotation.id,
											event.clientX,
											event.clientY,
										)
									}
									onPointerLeave={() => setHoveredAnnotation(null)}
										className="absolute left-1/2 top-4 h-3 w-3 -translate-x-1/2 cursor-pointer border border-[var(--color-waveform-marker-dot-border)]"
									style={{
										backgroundColor:
											annotation.color ?? "var(--color-annotation-4)",
									}}
								/>
							</button>
						);
					})}

					{mode === "range" && rangeAnchorMs !== null && (
						<div className="range-hint-pill pointer-events-none absolute bottom-3 left-3 px-3 py-1 text-xs font-medium">
							Pick the range end point
						</div>
					)}
					{hoveredAnnotationRecord && hoveredTooltipPosition ? (
						<div
							className="waveform-annotation-tooltip pointer-events-none absolute z-20"
							style={hoveredTooltipPosition}
						>
							<p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
								{hoveredAnnotationRecord.type === "range" ? "Range" : "Marker"}
							</p>
							<p className="mt-1 text-[0.72rem] font-medium text-[var(--color-text-muted)]">
								{formatAnnotationTime(hoveredAnnotationRecord)}
							</p>
							<p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
								{hoveredAnnotationRecord.title?.trim() ||
									(hoveredAnnotationRecord.type === "range"
										? "Untitled range"
										: "Untitled marker")}
							</p>
							<p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
								{richTextPreview(
									hoveredAnnotationRecord.body,
									hoveredAnnotationRecord.type === "range"
										? "No range description yet."
										: "No marker description yet.",
								)}
							</p>
						</div>
					) : null}
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

function formatAnnotationTime(annotation: Annotation): string {
	if (
		annotation.type === "range" &&
		typeof annotation.endMs === "number" &&
		annotation.endMs > annotation.startMs
	) {
		return `${formatDuration(annotation.startMs)} - ${formatDuration(annotation.endMs)}`;
	}

	return formatDuration(annotation.startMs);
}

function buildAnnotationAriaLabel(annotation: Annotation): string {
	const typeLabel = annotation.type === "range" ? "range" : "marker";
	const title = annotation.title?.trim() || `Untitled ${typeLabel}`;
	return `${title} at ${formatAnnotationTime(annotation)}`;
}

function ModeButton({
	icon,
	active,
	label,
	onClick,
}: {
	icon: React.ReactNode;
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
