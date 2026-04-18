import { type PointerEvent, useCallback, useRef } from "react";
import type { Annotation } from "#/lib/song-mode/types";

interface UseScrubDragOptions {
	audioFileId: string;
	durationMs: number;
	getTimePerPixel: () => number;
	onClearHover: () => void;
	onSelectAnnotation: (annotationId: string) => void;
	onSelectFile: (fileId: string) => void;
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
}

export function useScrubDrag({
	audioFileId,
	durationMs,
	getTimePerPixel,
	onClearHover,
	onSelectAnnotation,
	onSelectFile,
	onUpdateAnnotation,
}: UseScrubDragOptions) {
	const annotationDragStateRef = useRef<{
		annotationId: string;
		field: "startMs" | "endMs";
		pointerId: number;
		lastX: number;
		valueMs: number;
		dragging: boolean;
	} | null>(null);
	const suppressAnnotationClickRef = useRef<string | null>(null);

	const endMarkerDrag = useCallback(
		(event: PointerEvent<HTMLButtonElement>, preserveFocus = true) => {
			const dragState = annotationDragStateRef.current;
			if (!dragState || dragState.pointerId !== event.pointerId) {
				return;
			}

			if (dragState.dragging) {
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
		},
		[],
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
					annotationId,
					field,
					pointerId: event.pointerId,
					lastX: event.clientX,
					valueMs,
					dragging: false,
				};
				event.currentTarget.setPointerCapture?.(event.pointerId);
			},
			onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
				const dragState = annotationDragStateRef.current;
				if (
					!dragState ||
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
				endMarkerDrag(event),
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) =>
				endMarkerDrag(event, false),
		}),
		[
			audioFileId,
			endMarkerDrag,
			getTimePerPixel,
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
		getRangeEdgeDragHandlers,
	};
}
