import { richTextPreview } from "#/lib/song-mode/rich-text";
import type { Annotation, AudioFileRecord } from "#/lib/song-mode/types";
import { formatDuration } from "#/lib/song-mode/waveform";
import { useScrubDrag } from "./use-scrub-drag";

interface HoveredAnnotationState {
	annotationId: string;
	x: number;
	y: number;
}

interface WaveformCardAnnotationLayerProps {
	activeAnnotationId?: string;
	audioFile: AudioFileRecord;
	annotations: Annotation[];
	hoveredAnnotationRecord: Annotation | null;
	hoveredTooltipPosition: {
		left: string;
		top: string;
		transform: string;
	} | null;
	onSeek: (timeMs: number, autoplay?: boolean) => Promise<void>;
	onSelectAnnotation: (annotationId: string) => void;
	onSelectFile: (fileId: string) => void;
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	getTimePerPixel: () => number;
	setHoveredAnnotation: (annotation: HoveredAnnotationState | null) => void;
	updateHoveredAnnotationPosition: (
		annotationId: string,
		clientX: number,
		clientY: number,
	) => void;
}

export function WaveformCardAnnotationLayer({
	activeAnnotationId,
	audioFile,
	annotations,
	hoveredAnnotationRecord,
	hoveredTooltipPosition,
	onSeek,
	onSelectAnnotation,
	onSelectFile,
	onUpdateAnnotation,
	getTimePerPixel,
	setHoveredAnnotation,
	updateHoveredAnnotationPosition,
}: WaveformCardAnnotationLayerProps) {
	const { consumeSuppressedClick, getMarkerDragHandlers } = useScrubDrag({
		audioFileId: audioFile.id,
		durationMs: audioFile.durationMs,
		getTimePerPixel,
		onClearHover: () => setHoveredAnnotation(null),
		onSelectAnnotation,
		onSelectFile,
		onUpdateAnnotation,
	});

	return (
		<>
			{annotations.map((annotation) => {
				const left = `${(annotation.startMs / Math.max(audioFile.durationMs, 1)) * 100}%`;
				const width =
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
								width,
								backgroundColor:
									annotation.color ?? "var(--color-annotation-2)",
								opacity: activeAnnotationId === annotation.id ? 0.34 : 0.2,
							}}
						/>
					);
				}

				const markerDragHandlers = getMarkerDragHandlers(
					annotation.id,
					annotation.startMs,
				);

				return (
					<button
						key={annotation.id}
						type="button"
						data-annotation-hit
						aria-label={buildAnnotationAriaLabel(annotation)}
						onClick={(event) => {
							if (consumeSuppressedClick(annotation.id)) {
								event.preventDefault();
								event.stopPropagation();
								return;
							}

							event.stopPropagation();
							onSelectFile(audioFile.id);
							onSelectAnnotation(annotation.id);
							void onSeek(annotation.startMs, true);
						}}
						onPointerDown={markerDragHandlers.onPointerDown}
						onPointerMove={markerDragHandlers.onPointerMove}
						onPointerUp={markerDragHandlers.onPointerUp}
						onPointerCancel={markerDragHandlers.onPointerCancel}
						className="absolute bottom-0 top-0 w-3 -translate-x-1/2"
						style={{ left }}
					>
						<span className="absolute bottom-0 top-0 left-1/2 w-0.5 -translate-x-1/2 bg-[var(--color-waveform-marker-track)]" />
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
							className="absolute left-1/2 top-0 -translate-x-1/2 cursor-pointer leading-none"
						>
							<svg
								width={21}
								height={16.5}
								viewBox="0 0 14 11"
								className="block"
								aria-hidden={true}
							>
								<polygon
									points="7,11 0,0 14,0"
									className="fill-[var(--color-waveform-marker-dot-border)]"
								/>
								<polygon
									points="7,9.5 1.1,1.1 12.9,1.1"
									fill={annotation.color ?? "var(--color-annotation-4)"}
								/>
							</svg>
						</span>
					</button>
				);
			})}

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
		</>
	);
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
