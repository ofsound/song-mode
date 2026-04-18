import { Copy, Trash2 } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
	Annotation,
	AudioFileRecord,
	RichTextDoc,
	SongLinkTarget,
} from "#/lib/song-mode/types";
import { MarkerTimeField } from "./marker-time-field";
import { RichTextEditor } from "./rich-text-editor";

interface InspectorMarkerCardProps {
	annotation: Annotation;
	isActive: boolean;
	selectedFile?: Pick<AudioFileRecord, "durationMs" | "title">;
	songId: string;
	onOpenTarget: (target: SongLinkTarget) => void;
	onSelectAnnotation: (annotationId: string) => void;
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	onDeleteAnnotation: (annotationId: string) => Promise<void>;
	onCopyLink: (target: SongLinkTarget, label: string) => Promise<void>;
}

export function InspectorMarkerCard({
	annotation,
	isActive,
	selectedFile,
	songId,
	onOpenTarget,
	onSelectAnnotation,
	onUpdateAnnotation,
	onDeleteAnnotation,
	onCopyLink,
}: InspectorMarkerCardProps) {
	const maxStartMs =
		annotation.type === "range"
			? (annotation.endMs ??
				selectedFile?.durationMs ??
				Number.MAX_SAFE_INTEGER)
			: (selectedFile?.durationMs ?? Number.MAX_SAFE_INTEGER);
	const maxEndMs = selectedFile?.durationMs ?? Number.MAX_SAFE_INTEGER;

	function activateAnnotation() {
		onSelectAnnotation(annotation.id);
		onOpenTarget(buildAnnotationTarget(songId, annotation));
	}

	function handleMarkerCardClick(event: ReactMouseEvent<HTMLDivElement>) {
		const node = event.target as HTMLElement | null;
		if (node?.closest(".marker-row") || node?.closest(".marker-editor")) {
			return;
		}

		activateAnnotation();
		event.currentTarget.blur();
	}

	return (
		/* biome-ignore lint/a11y/useSemanticElements: marker cards contain nested inputs and editors, so a semantic button wrapper is not valid */
		<div
			data-testid={`marker-card-${annotation.id}`}
			role="button"
			tabIndex={0}
			aria-pressed={isActive}
			className={`marker-card border text-left transition-[border-color,background-color,box-shadow] duration-150 ${
				isActive
					? "marker-card--selected border-[var(--color-border-strong)] bg-[var(--color-surface-selected)]"
					: "border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]"
			}`}
			onClick={handleMarkerCardClick}
			onKeyDown={(event) => {
				if (event.target !== event.currentTarget) {
					return;
				}

				if (event.key !== "Enter" && event.key !== " ") {
					return;
				}

				event.preventDefault();
				activateAnnotation();
			}}
		>
			<div className="marker-play-cell" aria-hidden="true" />
			<div className="marker-row">
				<MarkerTimeField
					ariaLabel="Start time"
					valueMs={annotation.startMs}
					minMs={0}
					maxMs={maxStartMs}
					onCommit={(value) =>
						void onUpdateAnnotation(annotation.id, {
							startMs: value,
						})
					}
				/>
				{annotation.type === "range" ? (
					<>
						<span
							aria-hidden="true"
							className="shrink-0 text-xs text-[var(--color-text-subtle)]"
						>
							→
						</span>
						<MarkerTimeField
							ariaLabel="End time"
							valueMs={annotation.endMs ?? annotation.startMs}
							minMs={annotation.startMs}
							maxMs={maxEndMs}
							onCommit={(value) =>
								void onUpdateAnnotation(annotation.id, {
									endMs: value,
								})
							}
						/>
					</>
				) : null}
				<input
					value={annotation.title}
					onChange={(event) =>
						void onUpdateAnnotation(annotation.id, {
							title: event.target.value,
						})
					}
					className="field-input field-input--compact w-auto min-w-0 flex-1"
					placeholder="Untitled marker"
					aria-label="Title"
				/>
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						const fileLabel = selectedFile?.title.trim() || "Untitled file";
						const markerLabel =
							annotation.title.trim() ||
							(annotation.type === "range"
								? "Untitled range"
								: "Untitled marker");
						void onCopyLink(
							buildAnnotationTarget(songId, annotation),
							`${fileLabel} - ${markerLabel}`,
						);
					}}
					className="icon-button icon-button--sm shrink-0"
					title="Copy link"
				>
					<Copy size={12} />
				</button>
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						if (!window.confirm("Delete this marker?")) {
							return;
						}

						void onDeleteAnnotation(annotation.id);
					}}
					className="icon-button icon-button--sm shrink-0 text-[var(--color-danger)]"
					title="Delete annotation"
				>
					<Trash2 size={12} />
				</button>
			</div>
			<div className="marker-editor">
				<RichTextEditor
					value={annotation.body as RichTextDoc}
					onChange={(nextValue) =>
						void onUpdateAnnotation(annotation.id, {
							body: nextValue,
						})
					}
					onInternalLink={onOpenTarget}
					compact
					dense
					showToolbar={false}
				/>
			</div>
		</div>
	);
}

function buildAnnotationTarget(
	songId: string,
	annotation: Annotation,
): SongLinkTarget {
	return {
		songId,
		fileId: annotation.audioFileId,
		annotationId: annotation.id,
		timeMs: annotation.startMs,
		autoplay: true,
	};
}
