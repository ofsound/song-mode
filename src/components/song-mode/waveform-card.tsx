import {
	Flag,
	GripVertical,
	Pause,
	Play,
	SquareStack,
	TimerReset,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_RICH_TEXT } from "#/lib/song-mode/rich-text";
import type {
	Annotation,
	AudioFileRecord,
	CreateAnnotationInput,
} from "#/lib/song-mode/types";
import { formatDuration } from "#/lib/song-mode/waveform";

type WaveformMode = "seek" | "point" | "range";

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
	onSeek: (timeMs: number, autoplay?: boolean) => Promise<void>;
	onTogglePlayback: () => Promise<void>;
	onRegisterAudioElement: (element: HTMLAudioElement | null) => void;
	onReportPlayback: (patch: {
		isPlaying?: boolean;
		currentTimeMs?: number;
	}) => void;
	onDragStart: () => void;
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
	onSeek,
	onTogglePlayback,
	onRegisterAudioElement,
	onReportPlayback,
	onDragStart,
	onDrop,
}: WaveformCardProps) {
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [mode, setMode] = useState<WaveformMode>("seek");
	const [rangeAnchorMs, setRangeAnchorMs] = useState<number | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const surfaceRef = useRef<HTMLDivElement | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const sortedAnnotations = useMemo(
		() => [...annotations].sort((left, right) => left.startMs - right.startMs),
		[annotations],
	);

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

	useEffect(() => {
		const canvas = canvasRef.current;
		const surface = surfaceRef.current;
		if (!canvas || !surface) {
			return;
		}

		const context = canvas.getContext("2d");
		if (!context) {
			return;
		}

		const draw = () => {
			const width = surface.clientWidth;
			const height = 164;
			const ratio = window.devicePixelRatio || 1;
			canvas.width = width * ratio;
			canvas.height = height * ratio;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;

			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			context.clearRect(0, 0, width, height);

			context.fillStyle = "rgba(255,255,255,0.02)";
			context.fillRect(0, 0, width, height);

			context.strokeStyle = "rgba(148, 163, 184, 0.12)";
			context.lineWidth = 1;
			context.beginPath();
			context.moveTo(0, height / 2);
			context.lineTo(width, height / 2);
			context.stroke();

			const peaks = audioFile.waveform.peaks;
			const step = width / Math.max(peaks.length, 1);
			const middle = height / 2;

			for (let index = 0; index < peaks.length; index += 1) {
				const peak = peaks[index] ?? 0;
				const x = index * step;
				const y = Math.max(2, peak * (height * 0.42));

				context.strokeStyle = isSelected
					? "rgba(126, 244, 208, 0.88)"
					: "rgba(148, 163, 184, 0.56)";
				context.lineWidth = Math.max(1, step * 0.68);
				context.beginPath();
				context.moveTo(x, middle - y);
				context.lineTo(x, middle + y);
				context.stroke();
			}

			const progressX =
				width * (currentTimeMs / Math.max(audioFile.durationMs, 1));
			context.fillStyle = "rgba(126, 244, 208, 0.08)";
			context.fillRect(0, 0, progressX, height);
			context.strokeStyle = "rgba(126, 244, 208, 0.92)";
			context.lineWidth = 2;
			context.beginPath();
			context.moveTo(progressX, 0);
			context.lineTo(progressX, height);
			context.stroke();

			if (mode === "range" && rangeAnchorMs !== null) {
				const anchorX =
					width * (rangeAnchorMs / Math.max(audioFile.durationMs, 1));
				context.strokeStyle = "rgba(244, 182, 79, 0.88)";
				context.setLineDash([7, 5]);
				context.beginPath();
				context.moveTo(anchorX, 0);
				context.lineTo(anchorX, height);
				context.stroke();
				context.setLineDash([]);
			}
		};

		const observer = new ResizeObserver(draw);
		observer.observe(surface);
		draw();

		return () => {
			observer.disconnect();
		};
	}, [
		audioFile.durationMs,
		audioFile.waveform.peaks,
		currentTimeMs,
		isSelected,
		mode,
		rangeAnchorMs,
	]);

	async function handleWaveformAction(clientX: number) {
		if (!surfaceRef.current) {
			return;
		}

		const rect = surfaceRef.current.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		const timeMs = Math.round(audioFile.durationMs * ratio);

		onSelectFile(audioFile.id);

		if (mode === "seek") {
			await onSeek(timeMs);
			return;
		}

		if (mode === "point") {
			const annotation = await onCreateAnnotation({
				type: "point",
				startMs: timeMs,
				title: `Marker ${formatDuration(timeMs)}`,
				body: EMPTY_RICH_TEXT,
				color: "#63b4ff",
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
			color: "#f6b53b",
		});
		onSelectAnnotation(annotation.id);
		setRangeAnchorMs(null);
		setMode("seek");
	}

	return (
		<article
			draggable
			onDragStart={onDragStart}
			onDragOver={(event) => event.preventDefault()}
			onDrop={(event) => {
				event.preventDefault();
				onDrop();
			}}
			className={`rounded-[1.7rem] border ${
				isSelected
					? "border-[var(--accent-strong)] bg-[color-mix(in_oklab,var(--panel)_82%,black_18%)]"
					: "border-[var(--border-strong)] bg-[var(--panel)]"
			} p-4 shadow-[0_16px_40px_rgba(2,6,23,0.18)]`}
		>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<button
						type="button"
						className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border-muted)] bg-[var(--panel-elevated)] text-[var(--text-dim)]"
						title="Drag to reorder"
					>
						<GripVertical size={16} />
					</button>
					<div className="min-w-0">
						<button
							type="button"
							onClick={() => onSelectFile(audioFile.id)}
							className="block truncate text-left text-lg font-semibold text-[var(--text-strong)]"
						>
							{audioFile.title}
						</button>
						<p className="mt-1 text-sm text-[var(--text-subtle)]">
							{formatDuration(audioFile.durationMs)} ·{" "}
							{sortedAnnotations.length} markers
						</p>
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
						onClick={() => {
							onSelectFile(audioFile.id);
							onTogglePlayback();
						}}
						className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-2 text-sm font-semibold text-[var(--ink)]"
					>
						{isPlaying ? <Pause size={16} /> : <Play size={16} />}
						{isPlaying ? "Pause" : "Play"}
					</button>
				</div>
			</div>

			{/* biome-ignore lint/a11y/useSemanticElements: the waveform surface contains nested marker buttons, so a semantic button wrapper is not valid */}
			<div
				ref={surfaceRef}
				className="relative overflow-hidden rounded-[1.5rem] border border-[var(--border-muted)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]"
				role="button"
				tabIndex={0}
				aria-label={`Waveform for ${audioFile.title}`}
				onClick={(event) => {
					if ((event.target as HTMLElement).closest("[data-annotation-hit]")) {
						return;
					}
					void handleWaveformAction(event.clientX);
				}}
				onKeyDown={(event) => {
					if (event.key !== "Enter" && event.key !== " ") {
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
								onClick={(event) => {
									event.stopPropagation();
									onSelectFile(audioFile.id);
									onSelectAnnotation(annotation.id);
									void onSeek(annotation.startMs, true);
								}}
								className={`absolute bottom-4 top-4 rounded-xl border ${
									activeAnnotationId === annotation.id
										? "border-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.5)]"
										: "border-white/20"
								}`}
								style={{
									left,
									width: right,
									backgroundColor: annotation.color ?? "#f6b53b",
									opacity: activeAnnotationId === annotation.id ? 0.34 : 0.2,
								}}
								title={annotation.title || "Range"}
							/>
						);
					}

					return (
						<button
							key={annotation.id}
							type="button"
							data-annotation-hit
							onClick={(event) => {
								event.stopPropagation();
								onSelectFile(audioFile.id);
								onSelectAnnotation(annotation.id);
								void onSeek(annotation.startMs, true);
							}}
							className="absolute bottom-0 top-0 w-3 -translate-x-1/2"
							style={{ left }}
							title={annotation.title || "Marker"}
						>
							<span
								className={`absolute bottom-0 top-0 left-1/2 w-0.5 -translate-x-1/2 ${
									activeAnnotationId === annotation.id
										? "bg-white"
										: "bg-[var(--accent)]"
								}`}
							/>
							<span
								className="absolute left-1/2 top-4 h-3 w-3 -translate-x-1/2 rounded-full border border-white/35"
								style={{
									backgroundColor: annotation.color ?? "#63b4ff",
								}}
							/>
						</button>
					);
				})}

				{mode === "range" && rangeAnchorMs !== null && (
					<div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-[rgba(246,181,59,0.32)] bg-[rgba(246,181,59,0.12)] px-3 py-1 text-xs font-medium text-[var(--text-strong)]">
						Pick the range end point
					</div>
				)}
			</div>

			<div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-subtle)]">
				<span>
					{formatDuration(currentTimeMs)} /{" "}
					{formatDuration(audioFile.durationMs)}
				</span>
				<span>
					{mode === "seek"
						? "Click to seek"
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
				onPlay={() =>
					onReportPlayback({
						isPlaying: true,
						currentTimeMs: (audioRef.current?.currentTime ?? 0) * 1000,
					})
				}
				onPause={() =>
					onReportPlayback({
						isPlaying: false,
						currentTimeMs: (audioRef.current?.currentTime ?? 0) * 1000,
					})
				}
				onTimeUpdate={() =>
					onReportPlayback({
						currentTimeMs: (audioRef.current?.currentTime ?? 0) * 1000,
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
			className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium ${
				active
					? "border-[var(--accent-strong)] bg-[var(--accent-muted)] text-[var(--text-strong)]"
					: "border-[var(--border-muted)] bg-[var(--panel-elevated)] text-[var(--text-dim)]"
			}`}
		>
			{icon}
			{label}
		</button>
	);
}
