import { type PointerEvent, useCallback, useRef } from "react";
import type { Annotation } from "#/lib/song-mode/types";

const MARKER_DELETE_DRAG_DISTANCE_PX = 30;

interface UseScrubDragOptions {
	audioFileId: string;
	durationMs: number;
	getTimePerPixel: () => number;
	onClearHover: () => void;
	onDeleteAnnotation: (annotationId: string) => Promise<void>;
	onSelectAnnotation: (annotationId: string) => void;
	onSelectFile: (fileId: string) => void;
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
}

type DragState =
	| {
			mode: "scrub";
			annotationId: string;
			field: "startMs" | "endMs";
			pointerId: number;
			lastX: number;
			startY: number;
			valueMs: number;
			originalValueMs: number;
			dragging: boolean;
	  }
	| {
			mode: "translate";
			annotationId: string;
			pointerId: number;
			lastX: number;
			startY: number;
			currentStartMs: number;
			currentEndMs: number;
			originalStartMs: number;
			originalEndMs: number;
			dragging: boolean;
	  };

export function useScrubDrag({
	audioFileId,
	durationMs,
	getTimePerPixel,
	onClearHover,
	onDeleteAnnotation,
	onSelectAnnotation,
	onSelectFile,
	onUpdateAnnotation,
}: UseScrubDragOptions) {
	const annotationDragStateRef = useRef<DragState | null>(null);
	const suppressAnnotationClickRef = useRef<string | null>(null);

	const finishMarkerDrag = useCallback(
		(event: PointerEvent<HTMLButtonElement>, preserveFocus = true) => {
			const dragState = annotationDragStateRef.current;
			if (!dragState || dragState.pointerId !== event.pointerId) {
				return null;
			}

			const verticalDistance = Math.abs(event.clientY - dragState.startY);
			const requestDelete =
				preserveFocus && verticalDistance > MARKER_DELETE_DRAG_DISTANCE_PX;

			if (dragState.dragging || requestDelete) {
				event.preventDefault();
				suppressAnnotationClickRef.current = dragState.annotationId;
			}

			annotationDragStateRef.current = null;
			document.body.style.removeProperty("user-select");
			if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
			if (preserveFocus) {
				event.currentTarget.focus();
			}

			return { dragState, requestDelete };
		},
		[],
	);

	const handleMarkerDragEnd = useCallback(
		async (event: PointerEvent<HTMLButtonElement>, preserveFocus: boolean) => {
			const result = finishMarkerDrag(event, preserveFocus);
			if (!result) {
				return;
			}

			const { dragState, requestDelete } = result;
			if (!requestDelete) {
				return;
			}

			if (dragState.mode === "scrub") {
				if (dragState.valueMs !== dragState.originalValueMs) {
					await onUpdateAnnotation(
						dragState.annotationId,
						dragState.field === "startMs"
							? { startMs: dragState.originalValueMs }
							: { endMs: dragState.originalValueMs },
					);
				}
			} else if (
				dragState.currentStartMs !== dragState.originalStartMs ||
				dragState.currentEndMs !== dragState.originalEndMs
			) {
				await onUpdateAnnotation(dragState.annotationId, {
					startMs: dragState.originalStartMs,
					endMs: dragState.originalEndMs,
				});
			}

			if (!window.confirm("Delete this marker?")) {
				return;
			}

			await onDeleteAnnotation(dragState.annotationId);
		},
		[finishMarkerDrag, onDeleteAnnotation, onUpdateAnnotation],
	);

	const consumeSuppressedClick = useCallback((annotationId: string) => {
		if (suppressAnnotationClickRef.current !== annotationId) {
			return false;
		}

		suppressAnnotationClickRef.current = null;
		return true;
	}, []);

	const getAnnotationDragHandlers = useCallback(
		({
			annotationId,
			field,
			handleSelector,
			maxMs,
			minMs,
			valueMs,
		}: {
			annotationId: string;
			field: "startMs" | "endMs";
			handleSelector: string;
			maxMs: number;
			minMs: number;
			valueMs: number;
		}) => ({
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
				if (
					event.button !== 0 ||
					!(event.target instanceof Element) ||
					!event.target.closest(handleSelector)
				) {
					return;
				}

				event.stopPropagation();
				onClearHover();
				annotationDragStateRef.current = {
					mode: "scrub",
					annotationId,
					field,
					pointerId: event.pointerId,
					lastX: event.clientX,
					startY: event.clientY,
					valueMs,
					originalValueMs: valueMs,
					dragging: false,
				};
				event.currentTarget.setPointerCapture?.(event.pointerId);
			},
			onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
				const dragState = annotationDragStateRef.current;
				if (
					!dragState ||
					dragState.mode !== "scrub" ||
					dragState.pointerId !== event.pointerId ||
					dragState.annotationId !== annotationId ||
					dragState.field !== field
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
					minMs,
					Math.min(
						maxMs,
						Math.round(dragState.valueMs + deltaX * timePerPixel * sensitivity),
					),
				);
				if (nextValue === dragState.valueMs) {
					return;
				}

				if (!dragState.dragging) {
					dragState.dragging = true;
					document.body.style.userSelect = "none";
					onSelectFile(audioFileId);
					onSelectAnnotation(annotationId);
				}

				event.preventDefault();
				event.stopPropagation();
				dragState.valueMs = nextValue;
				void onUpdateAnnotation(
					annotationId,
					field === "startMs" ? { startMs: nextValue } : { endMs: nextValue },
				);
			},
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) =>
				void handleMarkerDragEnd(event, true),
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) =>
				void handleMarkerDragEnd(event, false),
		}),
		[
			audioFileId,
			getTimePerPixel,
			handleMarkerDragEnd,
			onClearHover,
			onSelectAnnotation,
			onSelectFile,
			onUpdateAnnotation,
		],
	);

	const getMarkerDragHandlers = useCallback(
		(annotationId: string, startMs: number) =>
			getAnnotationDragHandlers({
				annotationId,
				field: "startMs",
				handleSelector: "[data-marker-handle]",
				maxMs: durationMs,
				minMs: 0,
				valueMs: startMs,
			}),
		[durationMs, getAnnotationDragHandlers],
	);

	const getRangeBodyDragHandlers = useCallback(
		(annotationId: string, startMs: number, endMs: number) => ({
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
				if (event.button !== 0) {
					return;
				}

				event.stopPropagation();
				onClearHover();
				annotationDragStateRef.current = {
					mode: "translate",
					annotationId,
					pointerId: event.pointerId,
					lastX: event.clientX,
					startY: event.clientY,
					currentStartMs: startMs,
					currentEndMs: endMs,
					originalStartMs: startMs,
					originalEndMs: endMs,
					dragging: false,
				};
				event.currentTarget.setPointerCapture?.(event.pointerId);
			},
			onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
				const dragState = annotationDragStateRef.current;
				if (
					!dragState ||
					dragState.mode !== "translate" ||
					dragState.pointerId !== event.pointerId ||
					dragState.annotationId !== annotationId
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
				const rangeDuration =
					dragState.originalEndMs - dragState.originalStartMs;
				const maxStart = Math.max(0, durationMs - rangeDuration);
				const proposedStart =
					dragState.currentStartMs + deltaX * timePerPixel * sensitivity;
				const nextStart = Math.round(
					Math.max(0, Math.min(maxStart, proposedStart)),
				);
				if (nextStart === dragState.currentStartMs) {
					return;
				}

				const nextEnd = nextStart + rangeDuration;

				if (!dragState.dragging) {
					dragState.dragging = true;
					document.body.style.userSelect = "none";
					onSelectFile(audioFileId);
					onSelectAnnotation(annotationId);
				}

				event.preventDefault();
				event.stopPropagation();
				dragState.currentStartMs = nextStart;
				dragState.currentEndMs = nextEnd;
				void onUpdateAnnotation(annotationId, {
					startMs: nextStart,
					endMs: nextEnd,
				});
			},
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) =>
				void handleMarkerDragEnd(event, true),
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) =>
				void handleMarkerDragEnd(event, false),
		}),
		[
			audioFileId,
			durationMs,
			getTimePerPixel,
			handleMarkerDragEnd,
			onClearHover,
			onSelectAnnotation,
			onSelectFile,
			onUpdateAnnotation,
		],
	);

	const getRangeEdgeDragHandlers = useCallback(
		(
			annotationId: string,
			edge: "start" | "end",
			startMs: number,
			endMs: number,
		) =>
			getAnnotationDragHandlers({
				annotationId,
				field: edge === "start" ? "startMs" : "endMs",
				handleSelector: `[data-range-handle="${edge}"]`,
				maxMs: edge === "start" ? endMs : durationMs,
				minMs: edge === "start" ? 0 : startMs,
				valueMs: edge === "start" ? startMs : endMs,
			}),
		[durationMs, getAnnotationDragHandlers],
	);

	return {
		consumeSuppressedClick,
		getMarkerDragHandlers,
		getRangeBodyDragHandlers,
		getRangeEdgeDragHandlers,
	};
}
