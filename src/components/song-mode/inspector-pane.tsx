import { Trash2 } from "lucide-react";
import { useState } from "react";
import { resolveAudioFileSessionDateInputValue } from "#/lib/song-mode/dates";
import { buildSongTargetPath } from "#/lib/song-mode/links";
import type {
	Annotation,
	AudioFileRecord,
	Song,
	SongLinkTarget,
} from "#/lib/song-mode/types";
import { InspectorMarkerCard } from "./inspector-marker-card";
import { RichTextEditor } from "./rich-text-editor";

function formatMarkerCount(count: number) {
	if (count === 1) return "1 marker";
	return `${count} markers`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

interface InspectorPaneProps {
	song: Song;
	selectedFile?: AudioFileRecord;
	annotations: Annotation[];
	activeAnnotation?: Annotation;
	onOpenTarget: (target: SongLinkTarget) => void;
	onUpdateFile: (patch: Partial<AudioFileRecord>) => Promise<void>;
	onUpdateAnnotation: (
		annotationId: string,
		patch: Partial<Annotation>,
	) => Promise<void>;
	onDeleteAnnotation: (annotationId: string) => Promise<void>;
	onDeleteFile: () => Promise<void> | void;
	deletingFile?: boolean;
	confirmFileDelete?: boolean;
	onSelectAnnotation: (annotationId: string) => void;
}

export function InspectorPane({
	song,
	selectedFile,
	annotations,
	activeAnnotation,
	onOpenTarget,
	onUpdateFile,
	onUpdateAnnotation,
	onDeleteAnnotation,
	onDeleteFile,
	deletingFile = false,
	confirmFileDelete = true,
	onSelectAnnotation,
}: InspectorPaneProps) {
	const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

	async function copyLink(target: SongLinkTarget, label: string) {
		const relativePath = buildSongTargetPath(target);
		const absoluteUrl =
			typeof window !== "undefined"
				? `${window.location.origin}${relativePath}`
				: relativePath;
		const plainTextPayload = `${label}\n${absoluteUrl}`;
		const htmlPayload = `<a href="${escapeHtml(absoluteUrl)}">${escapeHtml(label)}</a>`;

		const clipboardItemCtor = (
			globalThis as {
				ClipboardItem?: new (items: Record<string, Blob>) => ClipboardItem;
			}
		).ClipboardItem;

		if (navigator.clipboard?.write && clipboardItemCtor) {
			await navigator.clipboard.write([
				new clipboardItemCtor({
					"text/html": new Blob([htmlPayload], { type: "text/html" }),
					"text/plain": new Blob([plainTextPayload], { type: "text/plain" }),
				}),
			]);
		} else {
			await navigator.clipboard.writeText(plainTextPayload);
		}
		setCopiedMessage(`${label} link copied`);
		window.setTimeout(() => setCopiedMessage(null), 1400);
	}

	return (
		<div className="flex h-full min-h-0 flex-col gap-4">
			<section className="inspector-echo-section">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h3 className="text-lg font-semibold text-[var(--color-text)]">
							<span className="inspector-echo-filename">
								{selectedFile?.title ?? song.title}
							</span>
							{annotations.length > 0 && (
								<span className="text-base">
									{" — "}
									{formatMarkerCount(annotations.length)}
								</span>
							)}
						</h3>
					</div>
				</div>

				<div className="mt-3 flex flex-col gap-2">
					{annotations.length === 0 ? (
						<p className="border border-dashed border-[var(--color-border-subtle)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
							Create point markers or regions from the waveform to build the
							linked note list here.
						</p>
					) : (
						annotations.map((annotation) => (
							<InspectorMarkerCard
								key={annotation.id}
								annotation={annotation}
								isActive={activeAnnotation?.id === annotation.id}
								selectedFile={selectedFile}
								songId={song.id}
								onOpenTarget={onOpenTarget}
								onSelectAnnotation={onSelectAnnotation}
								onUpdateAnnotation={onUpdateAnnotation}
								onDeleteAnnotation={onDeleteAnnotation}
								onCopyLink={copyLink}
							/>
						))
					)}
				</div>
				{copiedMessage ? (
					<div className="mb-2 flex justify-end">
						<span className="surface-chip px-3 py-1 text-xs">
							{copiedMessage}
						</span>
					</div>
				) : null}

				{selectedFile ? (
					<div className="mt-4 pt-4">
						<div className="grid gap-4">
							<div className="grid gap-2">
								<span className="field-label">Notes</span>
								<RichTextEditor
									value={selectedFile.notes}
									onChange={(nextValue) =>
										void onUpdateFile({
											notes: nextValue,
										})
									}
									onInternalLink={onOpenTarget}
									compact
									showToolbar={false}
								/>
							</div>
							<label className="grid gap-2">
								<span className="field-label">Date</span>
								<input
									type="date"
									value={resolveAudioFileSessionDateInputValue(selectedFile)}
									onChange={(event) =>
										void onUpdateFile({
											sessionDate: event.target.value,
										})
									}
									className="field-input"
								/>
							</label>
							<div className="flex justify-end">
								<button
									type="button"
									onClick={() => {
										if (
											confirmFileDelete &&
											!window.confirm("Delete this file?")
										) {
											return;
										}

										void onDeleteFile();
									}}
									disabled={deletingFile}
									className="icon-button icon-button--sm shrink-0 text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-55"
									title="Delete file"
									aria-label={`Delete ${selectedFile.title}`}
								>
									<Trash2 size={12} />
								</button>
							</div>
						</div>
					</div>
				) : (
					<p className="text-sm leading-7 text-[var(--color-text-muted)]">
						Pick an audio lane to edit notes, inspect time-based annotations,
						and copy deep links back into the song journal.
					</p>
				)}
			</section>
		</div>
	);
}
