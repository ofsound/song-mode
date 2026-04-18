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
	const markerDragStateRef = useRef<{
		annotationId: string;
		pointerId: number;
		lastX: number;
		valueMs: number;
		dragging: boolean;
	} | null>(null);
	const suppressAnnotationClickRef = useRef<string | null>(null);

	const endMarkerDrag = useCallback(
		(event: PointerEvent<HTMLButtonElement>, preserveFocus = true) => {
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

	const getMarkerDragHandlers = useCallback(
		(annotationId: string, startMs: number) => ({
			onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
				if (
					event.button !== 0 ||
					!(event.target instanceof HTMLElement) ||
					!event.target.closest("[data-marker-handle]")
				) {
					return;
				}

				event.stopPropagation();
				onClearHover();
				markerDragStateRef.current = {
					annotationId,
					pointerId: event.pointerId,
					lastX: event.clientX,
					valueMs: startMs,
					dragging: false,
				};
				event.currentTarget.setPointerCapture?.(event.pointerId);
			},
			onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
				const dragState = markerDragStateRef.current;
				if (
					!dragState ||
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
				const nextValue = Math.max(
					0,
					Math.min(
						durationMs,
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
				void onUpdateAnnotation(annotationId, {
					startMs: nextValue,
				});
			},
			onPointerUp: (event: PointerEvent<HTMLButtonElement>) =>
				endMarkerDrag(event),
			onPointerCancel: (event: PointerEvent<HTMLButtonElement>) =>
				endMarkerDrag(event, false),
		}),
		[
			audioFileId,
			durationMs,
			endMarkerDrag,
			getTimePerPixel,
			onClearHover,
			onSelectAnnotation,
			onSelectFile,
			onUpdateAnnotation,
		],
	);

	return {
		consumeSuppressedClick,
		getMarkerDragHandlers,
	};
}
