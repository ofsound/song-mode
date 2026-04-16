import { Copy, Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { buildSongTargetPath } from "#/lib/song-mode/links";
import { richTextPreview } from "#/lib/song-mode/rich-text";
import {
	ANNOTATION_COLORS,
	type Annotation,
	type AudioFileRecord,
	type RichTextDoc,
	type Song,
	type SongLinkTarget,
} from "#/lib/song-mode/types";
import { formatDuration } from "#/lib/song-mode/waveform";
import { RichTextEditor } from "./rich-text-editor";

/** Set true to show per-annotation color swatches in the inspector again. */
const SHOW_ANNOTATION_COLOR_PICKER = false;

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
	onSelectAnnotation,
}: InspectorPaneProps) {
	const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

	async function copyLink(target: SongLinkTarget, label: string) {
		const relativePath = buildSongTargetPath(target);
		const absoluteUrl =
			typeof window !== "undefined"
				? `${window.location.origin}${relativePath}`
				: relativePath;

		await navigator.clipboard.writeText(absoluteUrl);
		setCopiedMessage(`${label} link copied`);
		window.setTimeout(() => setCopiedMessage(null), 1400);
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
			<section className="inspector-echo-section">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="eyebrow mb-2">Timestamped notes</p>
						<h3 className="text-lg font-semibold text-[var(--color-text)]">
							{annotations.length} markers in{" "}
							<span className="inspector-echo-filename">
								{selectedFile?.title ?? song.title}
							</span>
						</h3>
					</div>
				</div>

				<div className="mt-4 space-y-3">
					{annotations.length === 0 ? (
						<p className="border border-dashed border-[var(--color-border-subtle)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
							Create point markers or regions from the waveform to build the
							linked note list here.
						</p>
					) : (
						annotations.map((annotation) => {
							function activateAnnotation() {
								onSelectAnnotation(annotation.id);
								onOpenTarget({
									songId: song.id,
									fileId: annotation.audioFileId,
									annotationId: annotation.id,
									timeMs: annotation.startMs,
									autoplay: true,
								});
							}

							return (
								/* biome-ignore lint/a11y/useSemanticElements: copy control is a nested button, so the card cannot be a single <button> wrapper */
								<div
									key={annotation.id}
									role="button"
									tabIndex={0}
									onClick={activateAnnotation}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											activateAnnotation();
										}
									}}
									className={`cursor-pointer border p-3 text-left outline-none transition-[border-color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] ${
										activeAnnotation?.id === annotation.id
											? "border-[var(--color-accent-strong)] bg-[var(--color-accent-surface)]"
											: "border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-strong)]"
									}`}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<span className="block text-sm font-semibold text-[var(--color-text)]">
												{annotation.title || "Untitled marker"}
											</span>
											<span className="mt-1 inline-flex items-center gap-2 text-xs text-[var(--color-text-subtle)]">
												<Link2 size={12} />
												{annotation.type === "range" && annotation.endMs
													? `${formatDuration(annotation.startMs)} to ${formatDuration(annotation.endMs)}`
													: formatDuration(annotation.startMs)}
											</span>
										</div>

										<div className="flex shrink-0 items-center gap-2">
											<button
												type="button"
												onClick={(event) => {
													event.stopPropagation();
													void copyLink(
														{
															songId: song.id,
															fileId: annotation.audioFileId,
															annotationId: annotation.id,
															timeMs: annotation.startMs,
															autoplay: true,
														},
														annotation.title || "Marker",
													);
												}}
												className="icon-button"
												title="Copy link"
											>
												<Copy size={14} />
											</button>
										</div>
									</div>
									<p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
										{richTextPreview(annotation.body, "No note body yet.")}
									</p>
								</div>
							);
						})
					)}
				</div>
			</section>

			<section className="border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4">
				{copiedMessage ? (
					<div className="mb-3 flex justify-end">
						<span className="surface-chip px-3 py-1 text-xs">
							{copiedMessage}
						</span>
					</div>
				) : null}

				{!selectedFile ? (
					<p className="text-sm leading-7 text-[var(--color-text-muted)]">
						Pick an audio lane to edit full-file notes, inspect time-based
						annotations, and copy deep links back into the song journal.
					</p>
				) : (
					<div className="grid gap-4">
						<div className="grid gap-2">
							<span className="field-label">Full-file notes</span>
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

						<div className="grid gap-2">
							<span className="field-label">Mastering note</span>
							<RichTextEditor
								value={selectedFile.masteringNote}
								onChange={(nextValue) =>
									void onUpdateFile({
										masteringNote: nextValue,
									})
								}
								onInternalLink={onOpenTarget}
								compact
								showToolbar={false}
							/>
						</div>
					</div>
				)}
			</section>

			{activeAnnotation && (
				<section className="border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="eyebrow mb-2">Annotation details</p>
							<h3 className="text-lg font-semibold text-[var(--color-text)]">
								Edit marker
							</h3>
						</div>

						<button
							type="button"
							onClick={() => void onDeleteAnnotation(activeAnnotation.id)}
							className="icon-button text-[var(--color-danger)]"
							title="Delete annotation"
						>
							<Trash2 size={15} />
						</button>
					</div>

					<div className="mt-4 grid gap-4">
						<label className="grid gap-2">
							<span className="field-label">Title</span>
							<input
								value={activeAnnotation.title}
								onChange={(event) =>
									void onUpdateAnnotation(activeAnnotation.id, {
										title: event.target.value,
									})
								}
								className="field-input"
							/>
						</label>

						<div className="grid gap-4 md:grid-cols-2">
							<SecondsField
								label="Start"
								value={activeAnnotation.startMs}
								onChange={(value) =>
									void onUpdateAnnotation(activeAnnotation.id, {
										startMs: value,
									})
								}
							/>
							{activeAnnotation.type === "range" ? (
								<SecondsField
									label="End"
									value={activeAnnotation.endMs ?? activeAnnotation.startMs}
									onChange={(value) =>
										void onUpdateAnnotation(activeAnnotation.id, {
											endMs: value,
										})
									}
								/>
							) : (
								<div className="grid gap-2">
									<span className="field-label">Type</span>
									<div className="field-input flex items-center text-sm text-[var(--color-text-muted)]">
										Point marker
									</div>
								</div>
							)}
						</div>

						{SHOW_ANNOTATION_COLOR_PICKER ? (
							<div className="grid gap-2">
								<span className="field-label">Color</span>
								<div className="flex flex-wrap gap-2">
									{ANNOTATION_COLORS.map((color) => (
										<button
											key={color}
											type="button"
											onClick={() =>
												void onUpdateAnnotation(activeAnnotation.id, {
													color,
												})
											}
											className={`h-9 w-9 border ${
												activeAnnotation.color === color
													? "border-[var(--color-text)]"
													: "border-[var(--color-border-subtle)]"
											}`}
											style={{ backgroundColor: color }}
											title={color}
										/>
									))}
								</div>
							</div>
						) : null}

						<div className="grid gap-2">
							<span className="field-label">Annotation note</span>
							<RichTextEditor
								value={activeAnnotation.body as RichTextDoc}
								onChange={(nextValue) =>
									void onUpdateAnnotation(activeAnnotation.id, {
										body: nextValue,
									})
								}
								onInternalLink={onOpenTarget}
								compact
								showToolbar={false}
							/>
						</div>
					</div>
				</section>
			)}
		</div>
	);
}

function SecondsField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<label className="grid gap-2">
			<span className="field-label">{label}</span>
			<input
				type="number"
				min={0}
				step={0.1}
				value={(value / 1000).toFixed(1)}
				onChange={(event) => {
					const nextValue = Number(event.target.value);
					if (!Number.isNaN(nextValue)) {
						onChange(Math.max(0, Math.round(nextValue * 1000)));
					}
				}}
				className="field-input"
			/>
		</label>
	);
}
