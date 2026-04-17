import { Copy, Trash2 } from "lucide-react";
import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { resolveAudioFileSessionDateInputValue } from "#/lib/song-mode/dates";
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

const DRAG_STEP_PX = 8;
const DRAG_THRESHOLD_PX = 4;
const SCRUB_STEP_MS = 1000;
const SCRUB_FINE_STEP_MS = 250;

function formatMarkerCount(count: number) {
	if (count === 1) return "1 marker";
	return `${count} markers`;
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

		await navigator.clipboard.writeText(absoluteUrl);
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

							function handleMarkerCardClick(
								event: ReactMouseEvent<HTMLDivElement>,
							) {
								const node = event.target as HTMLElement | null;
								if (
									node?.closest(".marker-row") ||
									node?.closest(".marker-editor")
								) {
									return;
								}

								activateAnnotation();
							}

							return (
								<div
									key={annotation.id}
									data-testid={`marker-card-${annotation.id}`}
									className={`marker-card border text-left transition-[border-color,background-color,box-shadow] duration-150 ${
										activeAnnotation?.id === annotation.id
											? "marker-card--selected border-[var(--color-border-strong)] bg-[var(--color-surface-selected)]"
											: "border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]"
									}`}
									onClick={handleMarkerCardClick}
								>
									<div className="marker-play-cell" aria-hidden="true" />
									<div className="marker-row">
										<MmSsField
											ariaLabel="Start time"
											valueMs={annotation.startMs}
											minMs={0}
											maxMs={
												annotation.type === "range"
													? (annotation.endMs ??
														selectedFile?.durationMs ??
														Number.MAX_SAFE_INTEGER)
													: (selectedFile?.durationMs ??
														Number.MAX_SAFE_INTEGER)
											}
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
													minMs={annotation.startMs}
													maxMs={
														selectedFile?.durationMs ?? Number.MAX_SAFE_INTEGER
													}
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

function MmSsField({
	ariaLabel,
	valueMs,
	minMs,
	maxMs,
	onCommit,
}: {
	ariaLabel: string;
	valueMs: number;
	minMs: number;
	maxMs: number;
	onCommit: (value: number) => void;
}) {
	const clampedValueMs = clampToRange(valueMs, minMs, maxMs);
	const formatted = formatMarkerTime(clampedValueMs);
	const [draft, setDraft] = useState(formatted);
	const [focused, setFocused] = useState(false);
	const dragStateRef = useRef<{
		pointerId: number;
		startY: number;
		lastY: number;
		carryPx: number;
		valueMs: number;
		scrubbing: boolean;
	} | null>(null);
	const scrubActiveRef = useRef(false);

	useEffect(() => {
		if (!focused || scrubActiveRef.current) {
			setDraft(formatted);
		}
	}, [focused, formatted]);

	function commit() {
		const parsed = parseMarkerTime(draft);
		if (parsed == null) {
			setDraft(formatted);
			return;
		}

		const clamped = clampToRange(parsed, minMs, maxMs);
		if (clamped !== clampedValueMs) {
			onCommit(clamped);
			setDraft(formatMarkerTime(clamped));
		} else {
			setDraft(formatted);
		}
	}

	function endScrub(
		event: ReactPointerEvent<HTMLInputElement>,
		preserveFocus = true,
	) {
		const state = dragStateRef.current;
		if (!state || state.pointerId !== event.pointerId) {
			return;
		}

		if (state.scrubbing) {
			event.preventDefault();
		}

		scrubActiveRef.current = false;
		dragStateRef.current = null;
		document.body.style.removeProperty("user-select");
		if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		if (preserveFocus) {
			event.currentTarget.focus();
		}
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLInputElement>) {
		if (event.button !== 0) {
			return;
		}

		const parsedDraft = parseMarkerTime(draft);
		const nextValue =
			parsedDraft == null
				? clampedValueMs
				: clampToRange(parsedDraft, minMs, maxMs);
		dragStateRef.current = {
			pointerId: event.pointerId,
			startY: event.clientY,
			lastY: event.clientY,
			carryPx: 0,
			valueMs: nextValue,
			scrubbing: false,
		};
		setDraft(formatMarkerTime(nextValue));
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLInputElement>) {
		const state = dragStateRef.current;
		if (!state || state.pointerId !== event.pointerId) {
			return;
		}

		const distanceFromStart = Math.abs(event.clientY - state.startY);
		if (!state.scrubbing) {
			if (distanceFromStart < DRAG_THRESHOLD_PX) {
				return;
			}

			state.scrubbing = true;
			scrubActiveRef.current = true;
			document.body.style.userSelect = "none";
		}

		event.preventDefault();

		const deltaY = state.lastY - event.clientY;
		state.lastY = event.clientY;
		state.carryPx += deltaY;

		const stepCount = Math.trunc(state.carryPx / DRAG_STEP_PX);
		if (stepCount === 0) {
			return;
		}

		state.carryPx -= stepCount * DRAG_STEP_PX;
		const stepSize = event.shiftKey ? SCRUB_FINE_STEP_MS : SCRUB_STEP_MS;
		const nextValue = clampToRange(
			state.valueMs + stepCount * stepSize,
			minMs,
			maxMs,
		);
		if (nextValue === state.valueMs) {
			return;
		}

		state.valueMs = nextValue;
		setDraft(formatMarkerTime(nextValue));
		onCommit(nextValue);
	}

	return (
		<input
			type="text"
			inputMode="numeric"
			aria-label={ariaLabel}
			value={draft}
			onFocus={() => setFocused(true)}
			onChange={(event) => setDraft(event.target.value)}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={(event) => endScrub(event)}
			onPointerCancel={(event) => endScrub(event, false)}
			onBlur={() => {
				if (scrubActiveRef.current) {
					return;
				}
				setFocused(false);
				commit();
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					setFocused(false);
					commit();
					(event.target as HTMLInputElement).blur();
				} else if (event.key === "Escape") {
					event.preventDefault();
					setDraft(formatted);
					setFocused(false);
					(event.target as HTMLInputElement).blur();
				}
			}}
			className="field-input field-input--compact marker-time-input"
		/>
	);
}

function clampToRange(value: number, minMs: number, maxMs: number): number {
	const safeMin = Math.max(0, Math.round(minMs));
	const safeMax = Math.max(safeMin, Math.round(maxMs));
	return Math.max(safeMin, Math.min(safeMax, Math.round(value)));
}

function formatMarkerTime(valueMs: number): string {
	const totalHundredths = Math.max(0, Math.round(valueMs / 10));
	const totalSeconds = Math.floor(totalHundredths / 100);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const hundredths = totalHundredths % 100;

	if (hundredths === 0) {
		return formatDuration(totalHundredths * 10);
	}

	return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function parseMarkerTime(input: string): number | null {
	const trimmed = input.trim();
	if (trimmed === "") {
		return null;
	}

	const colonMatch = /^(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(trimmed);
	if (colonMatch) {
		const minutes = Number(colonMatch[1]);
		const seconds = Number(colonMatch[2]);
		const fraction = colonMatch[3]
			? Math.round(Number(`0.${colonMatch[3]}`) * 1000)
			: 0;
		return Math.max(0, minutes * 60_000 + seconds * 1_000 + fraction);
	}

	const plainSeconds = /^\d+(\.\d+)?$/.exec(trimmed);
	if (plainSeconds) {
		return Math.max(0, Math.round(Number(trimmed) * 1000));
	}

	return null;
}
