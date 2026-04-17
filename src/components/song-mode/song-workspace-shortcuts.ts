import { useEffect } from "react";
import { isEditableElement } from "#/lib/song-mode/dom";
import type { Annotation, WorkspaceState } from "#/lib/song-mode/types";

interface UseSongWorkspaceShortcutsOptions {
	isUploadOpen: boolean;
	onCloseUpload: () => void;
	selectedFileId?: string;
	songId: string;
	togglePlayback: (fileId: string) => Promise<void>;
	seekActiveBy: (deltaMs: number) => Promise<void>;
	jumpBetweenAnnotations: (
		songId: string,
		audioFileId: string,
		direction: "previous" | "next",
	) => Promise<Annotation | null>;
	updateWorkspaceState: (
		songId: string,
		patch:
			| Partial<WorkspaceState>
			| ((current: WorkspaceState) => WorkspaceState),
	) => Promise<void>;
	patchRouteSelection: (options: {
		fileId?: string;
		annotationId?: string;
		clearPlaybackParams?: boolean;
	}) => void;
}

export function useSongWorkspaceShortcuts({
	isUploadOpen,
	onCloseUpload,
	selectedFileId,
	songId,
	togglePlayback,
	seekActiveBy,
	jumpBetweenAnnotations,
	updateWorkspaceState,
	patchRouteSelection,
}: UseSongWorkspaceShortcutsOptions) {
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (isUploadOpen) {
				if (event.key === "Escape") {
					event.preventDefault();
					onCloseUpload();
				}
				return;
			}

			if (isEditableElement(event.target) || !selectedFileId) {
				return;
			}

			if (event.key === " ") {
				event.preventDefault();
				void togglePlayback(selectedFileId);
			}

			if (
				event.key === "ArrowLeft" ||
				event.key === "," ||
				event.code === "Comma"
			) {
				event.preventDefault();
				void seekActiveBy(-5000);
			}

			if (
				event.key === "ArrowRight" ||
				event.key === "." ||
				event.code === "Period"
			) {
				event.preventDefault();
				void seekActiveBy(5000);
			}

			if (event.shiftKey && event.key === "ArrowUp") {
				event.preventDefault();
				void jumpBetweenAnnotations(songId, selectedFileId, "previous").then(
					(annotation) => {
						if (!annotation) {
							return;
						}

						void updateWorkspaceState(songId, {
							activeAnnotationId: annotation.id,
						});
						patchRouteSelection({
							fileId: selectedFileId,
							annotationId: annotation.id,
							clearPlaybackParams: true,
						});
					},
				);
			}

			if (event.shiftKey && event.key === "ArrowDown") {
				event.preventDefault();
				void jumpBetweenAnnotations(songId, selectedFileId, "next").then(
					(annotation) => {
						if (!annotation) {
							return;
						}

						void updateWorkspaceState(songId, {
							activeAnnotationId: annotation.id,
						});
						patchRouteSelection({
							fileId: selectedFileId,
							annotationId: annotation.id,
							clearPlaybackParams: true,
						});
					},
				);
			}

			if (event.shiftKey && event.key.toLowerCase() === "j") {
				event.preventDefault();
				const journalNode = document.querySelector(
					'[data-song-mode-editor="journal"] .ProseMirror',
				);

				if (journalNode instanceof HTMLElement) {
					journalNode.focus();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		isUploadOpen,
		jumpBetweenAnnotations,
		onCloseUpload,
		patchRouteSelection,
		seekActiveBy,
		selectedFileId,
		songId,
		togglePlayback,
		updateWorkspaceState,
	]);
}
