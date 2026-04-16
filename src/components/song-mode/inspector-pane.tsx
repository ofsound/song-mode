import { Copy, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { buildSongTargetPath } from "#/lib/song-mode/links";
import type {
	Annotation,
	AudioFileRecord,
	RichTextDoc,
	Song,
	SongLinkTarget,
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
		<div className="flex h-full min-h-0 flex-col gap-4">
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

				<div className="mt-3 flex flex-col gap-1.5">
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
								/* biome-ignore lint/a11y/useSemanticElements: nested interactive controls require a non-button wrapper */
								<div
									key={annotation.id}
									role="button"
									tabIndex={0}
									data-testid={`marker-card-${annotation.id}`}
									onClick={(event) => {
										if (isNestedInteractiveTarget(event.target)) {
											return;
										}

										activateAnnotation();
									}}
									onKeyDown={(event) => {
										if (isNestedInteractiveTarget(event.target)) {
											return;
										}

										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											activateAnnotation();
										}
									}}
									className={`marker-card cursor-pointer border text-left outline-none transition-[border-color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] ${
										activeAnnotation?.id === annotation.id
											? "border-[var(--color-accent-strong)] bg-[var(--color-accent-surface)]"
											: "border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-strong)]"
									}`}
								>
									<div className="marker-play-cell">
										<button
											type="button"
											onClick={(event) => {
												event.stopPropagation();
												activateAnnotation();
											}}
											className="icon-button icon-button--sm marker-play-button"
											title="Play marker"
											aria-label="Play marker"
										>
											<Play size={12} />
										</button>
									</div>
									<div className="marker-row">
										<MmSsField
											ariaLabel="Start time"
											valueMs={annotation.startMs}
											onCommit={(value) =>
												void onUpdateAnnotation(annotation.id, {
													startMs: value,
												})
											}
										/>
										{annotation.type === "range" ? (
											<>
												<span aria-hidden="true" className="marker-time-sep">
													→
												</span>
												<MmSsField
													ariaLabel="End time"
													valueMs={annotation.endMs ?? annotation.startMs}
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
											className="field-input field-input--compact marker-title-input"
											placeholder="Untitled marker"
											aria-label="Title"
										/>
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
						Pick an audio lane to edit notes, inspect time-based annotations,
						and copy deep links back into the song journal.
					</p>
				) : (
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
					</div>
				)}
			</section>
		</div>
	);
}

function isNestedInteractiveTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	return Boolean(
		target.closest(
			'button, input, textarea, select, [contenteditable="true"], [role="textbox"]',
		),
	);
}

function MmSsField({
	ariaLabel,
	valueMs,
	onCommit,
}: {
	ariaLabel: string;
	valueMs: number;
	onCommit: (value: number) => void;
}) {
	const formatted = formatDuration(valueMs);
	const [draft, setDraft] = useState(formatted);
	const [focused, setFocused] = useState(false);

	useEffect(() => {
		if (!focused) {
			setDraft(formatted);
		}
	}, [focused, formatted]);

	function commit() {
		const parsed = parseMmSs(draft);
		if (parsed == null) {
			setDraft(formatted);
			return;
		}

		if (parsed !== valueMs) {
			onCommit(parsed);
		} else {
			setDraft(formatted);
		}
	}

	return (
		<input
			type="text"
			inputMode="numeric"
			aria-label={ariaLabel}
			value={draft}
			onFocus={() => setFocused(true)}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => {
				setFocused(false);
				commit();
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					(event.target as HTMLInputElement).blur();
				} else if (event.key === "Escape") {
					event.preventDefault();
					setDraft(formatted);
					(event.target as HTMLInputElement).blur();
				}
			}}
			className="field-input field-input--compact marker-time-input"
		/>
	);
}

function parseMmSs(input: string): number | null {
	const trimmed = input.trim();
	if (trimmed === "") {
		return null;
	}

	const colonMatch = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
	if (colonMatch) {
		const minutes = Number(colonMatch[1]);
		const seconds = Number(colonMatch[2]);
		return Math.max(0, minutes * 60_000 + seconds * 1_000);
	}

	const plainSeconds = /^\d+(\.\d+)?$/.exec(trimmed);
	if (plainSeconds) {
		return Math.max(0, Math.round(Number(trimmed) * 1000));
	}

	return null;
}
