import { UnfoldHorizontal } from "lucide-react";
import { type PointerEvent, useState } from "react";
import { richTextPreview } from "#/lib/song-mode/rich-text";
import type { Annotation, AudioFileRecord } from "#/lib/song-mode/types";
import { formatDuration } from "#/lib/song-mode/waveform";
import { useScrubDrag } from "./use-scrub-drag";

const POINT_MARKER_RANGE_DURATION_MS = 10_000;
const POINT_MARKER_CONVERT_RANGE_HOTSPOT_HEIGHT_PX = 36;

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
	onDeleteAnnotation: (annotationId: string) => Promise<void>;
	onSeek: (timeMs: number, autoplay?: boolean) => Promise<void>;
	onSelectAnnotation: (annotationId: string) => void;
	onSelectFile: (fileId: string) => void;
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	getTimePerPixel: () => number;
	setHoveredAnnotation: (annotation: HoveredAnnotationState | null) => void;
	showPointMarkerConvertControl: boolean;
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
	onDeleteAnnotation,
	onSeek,
	onSelectAnnotation,
	onSelectFile,
	onUpdateAnnotation,
	getTimePerPixel,
	setHoveredAnnotation,
	showPointMarkerConvertControl,
	updateHoveredAnnotationPosition,
}: WaveformCardAnnotationLayerProps) {
	const [
		visiblePointMarkerRangeConvertId,
		setVisiblePointMarkerRangeConvertId,
	] = useState<string | null>(null);
	const [reshapingRangeId, setReshapingRangeId] = useState<string | null>(null);
	const [adjustingPointMarkerId, setAdjustingPointMarkerId] = useState<
		string | null
	>(null);
	const {
		consumeSuppressedClick,
		getMarkerDragHandlers,
		getRangeBodyDragHandlers,
		getRangeEdgeDragHandlers,
	} = useScrubDrag({
		audioFileId: audioFile.id,
		durationMs: audioFile.durationMs,
		getTimePerPixel,
		onClearHover: () => setHoveredAnnotation(null),
		onDeleteAnnotation,
		onSelectAnnotation,
		onSelectFile,
		onUpdateAnnotation,
	});

	function attachReshapeTracking(
		annotationId: string,
		handlers: {
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
		},
	) {
		return {
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
				setReshapingRangeId(annotationId);
				handlers.onPointerDown(event);
			},
			onPointerMove: handlers.onPointerMove,
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
				handlers.onPointerUp(event);
				setReshapingRangeId(null);
			},
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
				handlers.onPointerCancel(event);
				setReshapingRangeId(null);
			},
		};
	}

	function attachPointMarkerAdjustTracking(
		annotationId: string,
		handlers: {
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
		},
	) {
		return {
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
				if (
					event.button === 0 &&
					event.target instanceof Element &&
					event.target.closest("[data-marker-handle]")
				) {
					setAdjustingPointMarkerId(annotationId);
				}
				handlers.onPointerDown(event);
			},
			onPointerMove: handlers.onPointerMove,
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
				handlers.onPointerUp(event);
				setAdjustingPointMarkerId(null);
			},
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
				handlers.onPointerCancel(event);
				setAdjustingPointMarkerId(null);
			},
		};
	}

	return (
		<>
			{annotations.map((annotation) => {
				const left = `${(annotation.startMs / Math.max(audioFile.durationMs, 1)) * 100}%`;
				const width =
					annotation.type === "range" && annotation.endMs
						? `${((annotation.endMs - annotation.startMs) / Math.max(audioFile.durationMs, 1)) * 100}%`
						: undefined;

				if (annotation.type === "range" && annotation.endMs) {
					const rangeColor = annotation.color ?? "var(--color-annotation-2)";
					const rangeBodyHandlers = attachReshapeTracking(
						annotation.id,
						getRangeBodyDragHandlers(
							annotation.id,
							annotation.startMs,
							annotation.endMs,
						),
					);
					const rangeStartDragHandlers = attachReshapeTracking(
						annotation.id,
						getRangeEdgeDragHandlers(
							annotation.id,
							"start",
							annotation.startMs,
							annotation.endMs,
						),
					);
					const rangeEndDragHandlers = attachReshapeTracking(
						annotation.id,
						getRangeEdgeDragHandlers(
							annotation.id,
							"end",
							annotation.startMs,
							annotation.endMs,
						),
					);

					return (
						<div
							key={annotation.id}
							className="absolute bottom-0 top-0 z-10"
							style={{
								left,
								width,
							}}
						>
							<div
								aria-hidden
								data-range-waveform-highlight
								className={`pointer-events-none absolute top-[var(--waveform-marker-gutter-height)] bottom-[var(--waveform-marker-gutter-height)] border ${
									reshapingRangeId === annotation.id
										? activeAnnotationId === annotation.id
											? "border-[var(--color-waveform-annotation-active)] shadow-[0_0_0_1px_var(--color-waveform-annotation-active)]"
											: "border-[var(--color-waveform-annotation-inactive)]"
										: "border-transparent shadow-none"
								}`}
								style={{
									left: 0,
									width: "100%",
								}}
							/>
							<button
								type="button"
								data-annotation-hit
								aria-label={`${buildAnnotationAriaLabel(annotation)} — gutter`}
								onPointerEnter={(event) =>
									updateHoveredAnnotationPosition(
										annotation.id,
										event.clientX,
										event.clientY,
									)
								}
								onPointerMove={(event) => {
									rangeBodyHandlers.onPointerMove(event);
									updateHoveredAnnotationPosition(
										annotation.id,
										event.clientX,
										event.clientY,
									);
								}}
								onPointerLeave={() => setHoveredAnnotation(null)}
								onPointerDown={rangeBodyHandlers.onPointerDown}
								onPointerUp={rangeBodyHandlers.onPointerUp}
								onPointerCancel={rangeBodyHandlers.onPointerCancel}
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
								className="pointer-events-auto absolute inset-x-0 bottom-0 cursor-grab border-0 p-0 active:cursor-grabbing"
								style={{
									height: "var(--waveform-marker-gutter-height)",
									backgroundColor: rangeColor,
									opacity: activeAnnotationId === annotation.id ? 0.34 : 0.2,
								}}
							/>
							<button
								type="button"
								data-annotation-hit
								aria-label={buildRangeHandleAriaLabel(annotation, "start")}
								onPointerDown={rangeStartDragHandlers.onPointerDown}
								onPointerMove={rangeStartDragHandlers.onPointerMove}
								onPointerUp={rangeStartDragHandlers.onPointerUp}
								onPointerCancel={rangeStartDragHandlers.onPointerCancel}
								className="pointer-events-auto absolute bottom-0 left-0 h-[var(--waveform-marker-gutter-height)] w-3 -translate-x-1/2"
							>
								<span
									aria-hidden
									className="absolute top-[var(--waveform-marker-gutter-height)] bottom-0 left-1/2 w-0.5 -translate-x-1/2 opacity-0"
									style={{ backgroundColor: rangeColor }}
								/>
								<span
									data-range-handle="start"
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
									className="absolute bottom-0 left-1/2 h-[var(--waveform-marker-gutter-height)] w-3 -translate-x-full cursor-ew-resize"
								/>
							</button>
							<button
								type="button"
								data-annotation-hit
								aria-label={buildRangeHandleAriaLabel(annotation, "end")}
								onPointerDown={rangeEndDragHandlers.onPointerDown}
								onPointerMove={rangeEndDragHandlers.onPointerMove}
								onPointerUp={rangeEndDragHandlers.onPointerUp}
								onPointerCancel={rangeEndDragHandlers.onPointerCancel}
								className="pointer-events-auto absolute bottom-0 left-full h-[var(--waveform-marker-gutter-height)] w-3 -translate-x-1/2"
							>
								<span
									aria-hidden
									className="absolute top-[var(--waveform-marker-gutter-height)] bottom-0 left-1/2 w-0.5 -translate-x-1/2 opacity-0"
									style={{ backgroundColor: rangeColor }}
								/>
								<span
									data-range-handle="end"
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
									className="absolute bottom-0 left-1/2 h-[var(--waveform-marker-gutter-height)] w-3 cursor-ew-resize"
								/>
							</button>
						</div>
					);
				}

				const markerDragHandlers = attachPointMarkerAdjustTracking(
					annotation.id,
					getMarkerDragHandlers(annotation.id, annotation.startMs),
				);
				const isConvertRangeVisible =
					visiblePointMarkerRangeConvertId === annotation.id;
				const nextRangeEndMs = Math.min(
					audioFile.durationMs,
					annotation.startMs + POINT_MARKER_RANGE_DURATION_MS,
				);

				return (
					<div
						key={annotation.id}
						className="absolute bottom-0 top-0 z-10"
						style={{ left }}
					>
						<button
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
							className="pointer-events-auto absolute bottom-0 top-0 left-1/2 w-3 -translate-x-1/2"
						>
							<span
								aria-hidden
								className={`pointer-events-none absolute top-[var(--waveform-marker-gutter-height)] bottom-[var(--waveform-marker-gutter-height)] left-1/2 w-0.5 -translate-x-1/2 transition-opacity duration-100 ${
									adjustingPointMarkerId === annotation.id
										? "opacity-100"
										: "opacity-0"
								}`}
								style={{
									backgroundColor:
										annotation.color ?? "var(--color-annotation-4)",
								}}
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
						{showPointMarkerConvertControl ? (
							<button
								type="button"
								data-annotation-hit
								data-testid={`marker-convert-range-button-${annotation.id}`}
								data-visible={isConvertRangeVisible}
								aria-label={`Convert ${buildPointMarkerLabel(annotation)} to a range`}
								title="Convert marker to range"
								onPointerDown={(event) => {
									event.stopPropagation();
								}}
								onPointerEnter={() => {
									setHoveredAnnotation(null);
									setVisiblePointMarkerRangeConvertId(annotation.id);
								}}
								onPointerLeave={() =>
									setVisiblePointMarkerRangeConvertId((current) =>
										current === annotation.id ? null : current,
									)
								}
								onFocus={() => {
									setHoveredAnnotation(null);
									setVisiblePointMarkerRangeConvertId(annotation.id);
								}}
								onBlur={() =>
									setVisiblePointMarkerRangeConvertId((current) =>
										current === annotation.id ? null : current,
									)
								}
								onClick={(event) => {
									event.stopPropagation();
									setVisiblePointMarkerRangeConvertId(null);
									onSelectFile(audioFile.id);
									onSelectAnnotation(annotation.id);
									void onUpdateAnnotation(annotation.id, {
										type: "range",
										endMs: nextRangeEndMs,
										color: "var(--color-annotation-2)",
									});
								}}
								className={`pointer-events-auto absolute bottom-[calc(var(--waveform-marker-gutter-height)+0.25rem)] left-1/2 inline-flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm transition-all duration-150 focus-visible:opacity-100 focus-visible:scale-100 ${
									isConvertRangeVisible
										? "border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] text-[var(--color-text)] opacity-100 scale-100"
										: "border-transparent bg-transparent text-[var(--color-text-muted)] opacity-0 scale-95"
								}`}
								style={{
									height: `${POINT_MARKER_CONVERT_RANGE_HOTSPOT_HEIGHT_PX}px`,
								}}
							>
								<UnfoldHorizontal size={14} />
							</button>
						) : null}
					</div>
				);
			})}

			{hoveredAnnotationRecord && hoveredTooltipPosition ? (
				<div
					className="waveform-annotation-tooltip pointer-events-none absolute z-20"
					style={hoveredTooltipPosition}
				>
					<p className="text-[0.72rem] font-medium text-[var(--color-text-muted)]">
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

function buildPointMarkerLabel(annotation: Annotation): string {
	return annotation.title.trim() || "Untitled marker";
}

function buildRangeHandleAriaLabel(
	annotation: Annotation,
	edge: "start" | "end",
): string {
	const title = annotation.title.trim() || "Untitled range";
	return `Adjust ${edge} of ${title}`;
}
