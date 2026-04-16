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
			<section className="rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--panel)] p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="eyebrow mb-2">Inspector</p>
						<h2 className="text-xl font-semibold text-[var(--text-strong)]">
							{selectedFile ? selectedFile.title : "Select a waveform"}
						</h2>
					</div>
					{copiedMessage && (
						<span className="rounded-full border border-[var(--border-muted)] bg-[var(--panel-elevated)] px-3 py-1 text-xs text-[var(--text-dim)]">
							{copiedMessage}
						</span>
					)}
				</div>

				{!selectedFile ? (
					<p className="mt-4 text-sm leading-7 text-[var(--text-dim)]">
						Pick an audio lane to edit full-file notes, inspect time-based
						annotations, and copy deep links back into the song journal.
					</p>
				) : (
					<div className="mt-5 grid gap-4">
						<label className="grid gap-2">
							<span className="field-label">File title</span>
							<input
								value={selectedFile.title}
								onChange={(event) =>
									void onUpdateFile({
										title: event.target.value,
									})
								}
								className="field-input"
							/>
						</label>

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
							/>
						</div>
					</div>
				)}
			</section>

			<section className="rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--panel)] p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="eyebrow mb-2">Timestamped notes</p>
						<h3 className="text-lg font-semibold text-[var(--text-strong)]">
							{annotations.length} markers in{" "}
							{selectedFile?.title ?? song.title}
						</h3>
					</div>
				</div>

				<div className="mt-4 space-y-3">
					{annotations.length === 0 ? (
						<p className="rounded-[1.2rem] border border-dashed border-[var(--border-muted)] px-4 py-5 text-sm text-[var(--text-dim)]">
							Create point markers or regions from the waveform to build the
							linked note list here.
						</p>
					) : (
						annotations.map((annotation) => (
							<div
								key={annotation.id}
								className={`rounded-[1.25rem] border p-3 ${
									activeAnnotation?.id === annotation.id
										? "border-[var(--accent-strong)] bg-[var(--accent-muted)]"
										: "border-[var(--border-muted)] bg-[var(--panel-elevated)]"
								}`}
							>
								<div className="flex items-start justify-between gap-3">
									<button
										type="button"
										onClick={() => {
											onSelectAnnotation(annotation.id);
											onOpenTarget({
												songId: song.id,
												fileId: annotation.audioFileId,
												annotationId: annotation.id,
												timeMs: annotation.startMs,
												autoplay: true,
											});
										}}
										className="min-w-0 text-left"
									>
										<span className="block text-sm font-semibold text-[var(--text-strong)]">
											{annotation.title || "Untitled marker"}
										</span>
										<span className="mt-1 inline-flex items-center gap-2 text-xs text-[var(--text-subtle)]">
											<Link2 size={12} />
											{annotation.type === "range" && annotation.endMs
												? `${formatDuration(annotation.startMs)} to ${formatDuration(annotation.endMs)}`
												: formatDuration(annotation.startMs)}
										</span>
									</button>

									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() =>
												void copyLink(
													{
														songId: song.id,
														fileId: annotation.audioFileId,
														annotationId: annotation.id,
														timeMs: annotation.startMs,
														autoplay: true,
													},
													annotation.title || "Marker",
												)
											}
											className="icon-button"
											title="Copy link"
										>
											<Copy size={14} />
										</button>
									</div>
								</div>
								<p className="mt-3 text-sm leading-6 text-[var(--text-dim)]">
									{richTextPreview(annotation.body, "No note body yet.")}
								</p>
							</div>
						))
					)}
				</div>
			</section>

			{activeAnnotation && (
				<section className="rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--panel)] p-4">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="eyebrow mb-2">Annotation details</p>
							<h3 className="text-lg font-semibold text-[var(--text-strong)]">
								Edit marker
							</h3>
						</div>

						<button
							type="button"
							onClick={() => void onDeleteAnnotation(activeAnnotation.id)}
							className="icon-button text-[var(--danger-soft)]"
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
									<div className="field-input flex items-center text-sm text-[var(--text-dim)]">
										Point marker
									</div>
								</div>
							)}
						</div>

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
										className={`h-9 w-9 rounded-full border ${
											activeAnnotation.color === color
												? "border-white"
												: "border-white/20"
										}`}
										style={{ backgroundColor: color }}
										title={color}
									/>
								))}
							</div>
						</div>

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
