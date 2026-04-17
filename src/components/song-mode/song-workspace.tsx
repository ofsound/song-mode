import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Save, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isoDateInLocalCalendar } from "#/lib/song-mode/dates";
import { isEditableElement } from "#/lib/song-mode/dom";
import { targetToRouteSearch } from "#/lib/song-mode/links";
import { findCrossedAnnotation } from "#/lib/song-mode/playback";
import { plainTextToRichText } from "#/lib/song-mode/rich-text";
import type { SongLinkTarget, SongRouteSearch } from "#/lib/song-mode/types";
import { normalizeVolumeDb } from "#/lib/song-mode/waveform";
import { useSongMode } from "#/providers/song-mode-provider";
import { useSongRouteHeaderSlot } from "./app-chrome";
import { InspectorPane } from "./inspector-pane";
import { RichTextEditor, type RichTextToolbarAction } from "./rich-text-editor";
import { WaveformCard } from "./waveform-card";

export function SongWorkspace({
	songId,
	search,
}: {
	songId: string;
	search: SongRouteSearch;
}) {
	const navigate = useNavigate();
	const songRouteHeaderSlot = useSongRouteHeaderSlot();
	const {
		ready,
		getSongById,
		getSongAudioFiles,
		getAnnotationsForFile,
		getWorkspaceState,
		blobsByAudioId,
		playback,
		rememberSongOpened,
		updateSong,
		addAudioFile,
		updateAudioFile,
		deleteAudioFile,
		reorderAudioFiles,
		createAnnotation,
		updateAnnotation,
		deleteAnnotation,
		updateWorkspaceState,
		registerAudioElement,
		reportPlaybackState,
		togglePlayback,
		seekFile,
		seekActiveBy,
		jumpBetweenAnnotations,
	} = useSongMode();

	const song = getSongById(songId);
	const audioFiles = getSongAudioFiles(songId);
	const workspace = getWorkspaceState(songId);
	const workspaceRef = useRef(workspace);
	workspaceRef.current = workspace;
	const audioFileListKey = audioFiles
		.map((audioFile) => audioFile.id)
		.join("|");
	const selectedFileId =
		(workspace.selectedFileId &&
		audioFiles.some((audioFile) => audioFile.id === workspace.selectedFileId)
			? workspace.selectedFileId
			: audioFiles[0]?.id) ?? undefined;
	const selectedFile = audioFiles.find(
		(audioFile) => audioFile.id === selectedFileId,
	);
	const selectedAnnotations = selectedFile
		? getAnnotationsForFile(selectedFile.id)
		: [];
	const activeAnnotation =
		selectedAnnotations.find(
			(annotation) => annotation.id === workspace.activeAnnotationId,
		) ?? selectedAnnotations[0];

	const [isUploadOpen, setIsUploadOpen] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const [uploadTitle, setUploadTitle] = useState("");
	const [uploadNotes, setUploadNotes] = useState("");
	const [uploadSessionDate, setUploadSessionDate] = useState(() =>
		isoDateInLocalCalendar(),
	);
	const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
	const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

	const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
	const appliedSearchRef = useRef<string>("");
	const lastPlaybackPositionRef = useRef<{
		fileId?: string;
		timeMs?: number;
	}>({});

	const patchRouteSelection = useCallback(
		(options: {
			fileId?: string;
			annotationId?: string;
			clearPlaybackParams?: boolean;
		}) => {
			const { fileId, annotationId, clearPlaybackParams } = options;
			navigate({
				to: "/songs/$songId",
				params: { songId },
				replace: true,
				search: (prev: SongRouteSearch) => {
					const next: SongRouteSearch = { ...prev };

					if (fileId !== undefined) {
						next.fileId = fileId;
					} else {
						delete next.fileId;
					}

					if (annotationId !== undefined) {
						next.annotationId = annotationId;
					} else {
						delete next.annotationId;
					}

					if (clearPlaybackParams) {
						delete next.timeMs;
						next.autoplay = false;
					}

					return next;
				},
			});
		},
		[navigate, songId],
	);

	useEffect(() => {
		if (!ready || !song) {
			return;
		}

		void rememberSongOpened(songId);
	}, [ready, rememberSongOpened, song, songId]);

	useEffect(() => {
		if (isUploadOpen) {
			setUploadSessionDate(isoDateInLocalCalendar());
		}
	}, [isUploadOpen]);

	// Sync route search → workspace when the URL (or loaded files) change — not
	// when workspace alone changes. Otherwise a stale ?fileId=… keeps winning
	// over an in-UI waveform selection on every workspace update.
	useEffect(() => {
		if (!ready || !audioFileListKey) {
			return;
		}

		const w = workspaceRef.current;
		const fallbackFirstFileId = audioFileListKey.split("|")[0] ?? "";
		const nextSelectedFileId =
			search.fileId ?? w.selectedFileId ?? fallbackFirstFileId;
		const nextActiveAnnotationId =
			search.annotationId ??
			(w.activeAnnotationId &&
			getAnnotationsForFile(nextSelectedFileId ?? "").some(
				(annotation) => annotation.id === w.activeAnnotationId,
			)
				? w.activeAnnotationId
				: undefined);

		if (
			nextSelectedFileId !== w.selectedFileId ||
			nextActiveAnnotationId !== w.activeAnnotationId
		) {
			void updateWorkspaceState(songId, {
				selectedFileId: nextSelectedFileId,
				activeAnnotationId: nextActiveAnnotationId,
			});
		}
	}, [
		audioFileListKey,
		getAnnotationsForFile,
		ready,
		search.annotationId,
		search.fileId,
		songId,
		updateWorkspaceState,
	]);

	useEffect(() => {
		if (!ready || !song) {
			return;
		}

		const signature = JSON.stringify(search);
		if (appliedSearchRef.current === signature) {
			return;
		}

		appliedSearchRef.current = signature;

		if (!search.fileId || typeof search.timeMs !== "number") {
			return;
		}

		void seekFile(search.fileId, search.timeMs, search.autoplay ?? true);
	}, [ready, search, seekFile, song]);

	useEffect(() => {
		if (!selectedFileId) {
			return;
		}

		itemRefs.current[selectedFileId]?.scrollIntoView({
			behavior: "smooth",
			block: "center",
		});
	}, [selectedFileId]);

	useEffect(() => {
		const activeFileId = playback.activeFileId;
		if (!activeFileId) {
			lastPlaybackPositionRef.current = {};
			return;
		}

		const nextTimeMs = playback.currentTimeByFileId[activeFileId];
		if (typeof nextTimeMs !== "number") {
			lastPlaybackPositionRef.current = { fileId: activeFileId };
			return;
		}

		const previous = lastPlaybackPositionRef.current;
		if (previous.fileId !== activeFileId || typeof previous.timeMs !== "number") {
			lastPlaybackPositionRef.current = {
				fileId: activeFileId,
				timeMs: nextTimeMs,
			};
			return;
		}

		const crossed = findCrossedAnnotation(
			getAnnotationsForFile(activeFileId),
			previous.timeMs,
			nextTimeMs,
		);
		lastPlaybackPositionRef.current = {
			fileId: activeFileId,
			timeMs: nextTimeMs,
		};

		if (!crossed || workspace.activeAnnotationId === crossed.id) {
			return;
		}

		void updateWorkspaceState(songId, {
			activeAnnotationId: crossed.id,
		});
	}, [
		getAnnotationsForFile,
		playback.activeFileId,
		playback.currentTimeByFileId,
		songId,
		updateWorkspaceState,
		workspace.activeAnnotationId,
	]);

	const currentTimeMs =
		(selectedFileId
			? playback.currentTimeByFileId[selectedFileId]
			: undefined) ??
		(selectedFileId
			? workspace.playheadMsByFileId[selectedFileId]
			: undefined) ??
		0;
	const persistedSecond = Math.round(currentTimeMs / 1000);
	const journalTimestampFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}),
		[],
	);
	const journalToolbarActions = useMemo<RichTextToolbarAction[]>(
		() => [
			{
				label: "Add Timestamp",
				onClick: (editor) => {
					editor
						.chain()
						.focus(undefined, { scrollIntoView: false })
						.insertContent(journalTimestampFormatter.format(new Date()))
						.run();
				},
			},
		],
		[journalTimestampFormatter],
	);

	useEffect(() => {
		if (!selectedFileId) {
			return;
		}

		const handle = window.setTimeout(() => {
			void updateWorkspaceState(songId, (current) => ({
				...current,
				selectedFileId,
				activeAnnotationId: activeAnnotation?.id,
				playheadMsByFileId: {
					...current.playheadMsByFileId,
					[selectedFileId]: persistedSecond * 1000,
				},
			}));
		}, 320);

		return () => {
			window.clearTimeout(handle);
		};
	}, [
		activeAnnotation?.id,
		persistedSecond,
		selectedFileId,
		songId,
		updateWorkspaceState,
	]);

	useEffect(() => {
		if (!isUploadOpen) {
			return;
		}

		const { overflow } = document.body.style;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = overflow;
		};
	}, [isUploadOpen]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (isUploadOpen) {
				if (event.key === "Escape") {
					event.preventDefault();
					setIsUploadOpen(false);
				}
				return;
			}

			if (isEditableElement(event.target)) {
				return;
			}

			if (!selectedFileId) {
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
						if (annotation) {
							void updateWorkspaceState(songId, {
								activeAnnotationId: annotation.id,
							});
							patchRouteSelection({
								fileId: selectedFileId,
								annotationId: annotation.id,
								clearPlaybackParams: true,
							});
						}
					},
				);
			}

			if (event.shiftKey && event.key === "ArrowDown") {
				event.preventDefault();
				void jumpBetweenAnnotations(songId, selectedFileId, "next").then(
					(annotation) => {
						if (annotation) {
							void updateWorkspaceState(songId, {
								activeAnnotationId: annotation.id,
							});
							patchRouteSelection({
								fileId: selectedFileId,
								annotationId: annotation.id,
								clearPlaybackParams: true,
							});
						}
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
		patchRouteSelection,
		seekActiveBy,
		selectedFileId,
		songId,
		togglePlayback,
		updateWorkspaceState,
	]);

	async function openTarget(target: SongLinkTarget) {
		if (target.songId !== songId) {
			navigate({
				to: "/songs/$songId",
				params: {
					songId: target.songId,
				},
				search: targetToRouteSearch(target),
			});
			return;
		}

		const nextFileId = target.fileId ?? selectedFileId;
		if (nextFileId) {
			await updateWorkspaceState(songId, {
				selectedFileId: nextFileId,
				activeAnnotationId: target.annotationId,
			});
		}

		if (nextFileId && typeof target.timeMs === "number") {
			await seekFile(nextFileId, target.timeMs, target.autoplay ?? true);
		}

		navigate({
			to: "/songs/$songId",
			params: {
				songId,
			},
			search: targetToRouteSearch(target),
		});
	}

	async function handleCreateAnnotation(
		fileId: string,
		input: Parameters<typeof createAnnotation>[0],
	) {
		const annotation = await createAnnotation(input);
		await updateWorkspaceState(songId, {
			selectedFileId: fileId,
			activeAnnotationId: annotation.id,
		});
		patchRouteSelection({
			fileId,
			annotationId: annotation.id,
			clearPlaybackParams: true,
		});
		return annotation;
	}

	async function handleDeleteSelectedFile() {
		if (!selectedFileId) {
			return;
		}

		if (!window.confirm("Delete this file?")) {
			return;
		}

		const selectedIndex = audioFiles.findIndex(
			(audioFile) => audioFile.id === selectedFileId,
		);
		const fallbackFileId =
			audioFiles[selectedIndex + 1]?.id ?? audioFiles[selectedIndex - 1]?.id;

		setDeletingFileId(selectedFileId);
		try {
			await deleteAudioFile(selectedFileId);
			await updateWorkspaceState(songId, {
				selectedFileId: fallbackFileId,
				activeAnnotationId: undefined,
			});
			patchRouteSelection({
				fileId: fallbackFileId,
				clearPlaybackParams: true,
			});
		} finally {
			setDeletingFileId((current) =>
				current === selectedFileId ? null : current,
			);
		}
	}

	async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!uploadFile) {
			return;
		}

		setUploading(true);
		setUploadError(null);
		try {
			const audioFile = await addAudioFile(songId, {
				file: uploadFile,
				title: uploadTitle,
				sessionDate: uploadSessionDate,
				notes: plainTextToRichText(uploadNotes),
			});
			await updateWorkspaceState(songId, {
				selectedFileId: audioFile.id,
				activeAnnotationId: undefined,
			});
			patchRouteSelection({
				fileId: audioFile.id,
				clearPlaybackParams: true,
			});

			setUploadFile(null);
			setUploadTitle("");
			setUploadNotes("");
			setIsUploadOpen(false);
		} catch (uploadFailure) {
			setUploadError(
				uploadFailure instanceof Error
					? uploadFailure.message
					: "Song Mode could not import that audio file.",
			);
		} finally {
			setUploading(false);
		}
	}

	if (!ready) {
		return (
			<main className="w-full px-3 py-8">
				<section className="panel-shell px-6 py-8 text-sm text-[var(--color-text-muted)]">
					Loading song workspace...
				</section>
			</main>
		);
	}

	if (!song) {
		return (
			<main className="w-full px-3 py-8">
				<section className="panel-shell px-6 py-8">
					<p className="eyebrow mb-3">Missing song</p>
					<h1 className="text-3xl font-semibold text-[var(--color-text)]">
						This song record was not found in local storage.
					</h1>
					<Link
						to="/"
						className="action-secondary mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold no-underline"
					>
						<ChevronLeft size={14} />
						Back to library
					</Link>
				</section>
			</main>
		);
	}

	const songHeaderControls = (
		<div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-start">
			<div className="min-w-0 max-w-[450px] xl:min-w-[18rem] xl:flex-[1.35]">
				<input
					value={song.title}
					onChange={(event) =>
						void updateSong(song.id, {
							title: event.target.value,
						})
					}
					className="field-input h-12 px-3 py-0 text-lg font-semibold leading-none text-[var(--color-text)]"
					placeholder="Song title"
					aria-label="Song title"
				/>
			</div>

			<div className="min-w-0 xl:w-[10rem] xl:shrink-0">
				<input
					value={song.artist}
					onChange={(event) =>
						void updateSong(song.id, {
							artist: event.target.value,
						})
					}
					className="field-input h-12 px-3 py-0 text-sm leading-none"
					placeholder="Artist"
					aria-label="Artist"
				/>
			</div>

			<div className="min-w-0 xl:w-[10rem] xl:shrink-0">
				<input
					value={song.project}
					onChange={(event) =>
						void updateSong(song.id, {
							project: event.target.value,
						})
					}
					className="field-input h-12 px-3 py-0 text-sm leading-none"
					placeholder="Project"
					aria-label="Project"
				/>
			</div>

			<div className="flex shrink-0 flex-wrap items-center gap-3">
				<button
					type="button"
					onClick={() => setIsUploadOpen(true)}
					className="action-primary inline-flex h-12 shrink-0 items-center justify-center gap-2 px-5 text-sm font-semibold leading-none"
				>
					<Upload size={16} />
					Add file
				</button>
			</div>
		</div>
	);

	const renderedSongHeaderControls = songRouteHeaderSlot?.slot ? (
		createPortal(songHeaderControls, songRouteHeaderSlot.slot)
	) : songRouteHeaderSlot?.enabled ? null : (
		<section className="panel-shell px-6 py-6">{songHeaderControls}</section>
	);

	return (
		<>
			{renderedSongHeaderControls}
			<main
				className={`flex min-h-0 w-full flex-1 flex-col gap-6 overflow-y-auto px-3 py-8 transition-[filter,opacity] duration-200 xl:overflow-hidden ${
					isUploadOpen ? "pointer-events-none blur-[3px] opacity-45" : ""
				}`}
				aria-hidden={isUploadOpen}
			>
				<section className="song-workspace-main-grid grid gap-5 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
					<div className="song-workspace-waveform-column min-w-0 space-y-4 xl:min-h-0">
						{audioFiles.length === 0 ? (
							<div className="border border-dashed border-[var(--color-border-subtle)] px-6 py-10 text-sm leading-7 text-[var(--color-text-muted)]">
								Add audio to start the stacked waveform review. Each file gets
								its own notes, time markers, range annotations, and immediate
								seek-and-play links.
							</div>
						) : (
							audioFiles.map((audioFile) => (
								<div
									key={audioFile.id}
									ref={(node) => {
										itemRefs.current[audioFile.id] = node;
									}}
								>
									<WaveformCard
										audioFile={audioFile}
										annotations={getAnnotationsForFile(audioFile.id)}
										blob={blobsByAudioId[audioFile.id]}
										currentTimeMs={
											playback.currentTimeByFileId[audioFile.id] ??
											workspace.playheadMsByFileId[audioFile.id] ??
											0
										}
										isPlaying={
											playback.activeFileId === audioFile.id &&
											playback.isPlaying
										}
										isSelected={selectedFileId === audioFile.id}
										activeAnnotationId={workspace.activeAnnotationId}
										onSelectFile={(fileId) => {
											void updateWorkspaceState(songId, {
												selectedFileId: fileId,
												activeAnnotationId: undefined,
											});
											patchRouteSelection({
												fileId,
												clearPlaybackParams: true,
											});
										}}
										onSelectAnnotation={(annotationId) => {
											void updateWorkspaceState(songId, {
												selectedFileId: audioFile.id,
												activeAnnotationId: annotationId,
											});
											patchRouteSelection({
												fileId: audioFile.id,
												annotationId,
												clearPlaybackParams: true,
											});
										}}
										onCreateAnnotation={(annotationInput) =>
											handleCreateAnnotation(audioFile.id, {
												...annotationInput,
												songId,
												audioFileId: audioFile.id,
											})
										}
										onUpdateAnnotation={updateAnnotation}
										onSeek={(timeMs, autoplay) =>
											seekFile(audioFile.id, timeMs, autoplay)
										}
										onTogglePlayback={() => togglePlayback(audioFile.id)}
										onRegisterAudioElement={(element) =>
											registerAudioElement(audioFile.id, element)
										}
										onReportPlayback={(patch) =>
											reportPlaybackState(audioFile.id, patch)
										}
										onStepVolume={(deltaDb) =>
											updateAudioFile(audioFile.id, {
												volumeDb: normalizeVolumeDb(
													audioFile.volumeDb + deltaDb,
												),
											})
										}
										onDragStart={() => setDraggingFileId(audioFile.id)}
										onDragEnd={() => setDraggingFileId(null)}
										onDrop={() => {
											if (!draggingFileId || draggingFileId === audioFile.id) {
												return;
											}

											const orderedIds = [...audioFiles].map(
												(entry) => entry.id,
											);
											const fromIndex = orderedIds.indexOf(draggingFileId);
											const toIndex = orderedIds.indexOf(audioFile.id);
											if (fromIndex === -1 || toIndex === -1) {
												return;
											}

											orderedIds.splice(fromIndex, 1);
											orderedIds.splice(toIndex, 0, draggingFileId);
											setDraggingFileId(null);
											void reorderAudioFiles(songId, orderedIds);
										}}
									/>
								</div>
							))
						)}
					</div>

					<div className="flex min-w-0 flex-col xl:min-h-0 xl:overflow-hidden">
						<div className="min-h-0 flex-1 overflow-y-auto pr-1">
							<InspectorPane
								song={song}
								selectedFile={selectedFile}
								annotations={selectedAnnotations}
								activeAnnotation={activeAnnotation}
								onOpenTarget={openTarget}
								onUpdateFile={(patch) =>
									selectedFile
										? updateAudioFile(selectedFile.id, patch)
										: Promise.resolve()
								}
								onUpdateAnnotation={updateAnnotation}
								onDeleteAnnotation={deleteAnnotation}
								onDeleteFile={handleDeleteSelectedFile}
								deletingFile={
									Boolean(selectedFileId) && deletingFileId === selectedFileId
								}
								confirmFileDelete={false}
								onSelectAnnotation={(annotationId) => {
									if (!selectedFileId) {
										return;
									}

									void updateWorkspaceState(songId, {
										selectedFileId,
										activeAnnotationId: annotationId,
									});
									patchRouteSelection({
										fileId: selectedFileId,
										annotationId,
										clearPlaybackParams: true,
									});
								}}
							/>
						</div>
					</div>

					<div className="flex min-w-0 flex-col xl:min-h-0 xl:overflow-hidden">
						<div className="flex min-h-0 flex-1 flex-col">
							<RichTextEditor
								value={song.generalNotes}
								onChange={(nextValue) =>
									void updateSong(song.id, {
										generalNotes: nextValue,
									})
								}
								onInternalLink={openTarget}
								focusId="journal"
								toolbarActions={journalToolbarActions}
							/>
						</div>
					</div>
				</section>
			</main>

			{isUploadOpen && (
				<div className="song-modal">
					<button
						type="button"
						aria-label="Dismiss upload dialog"
						onClick={() => setIsUploadOpen(false)}
						className="song-modal__backdrop"
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby="upload-audio-title"
						className="song-modal__panel rise-in w-full max-w-[min(96rem,calc(100vw-2rem))]"
					>
						<div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4 sm:px-6">
							<div className="min-w-0">
								<p className="eyebrow mb-2">Audio import</p>
								<h2
									id="upload-audio-title"
									className="text-2xl font-semibold text-[var(--color-text)]"
								>
									Add file
								</h2>
							</div>
							<button
								type="button"
								aria-label="Close upload dialog"
								onClick={() => setIsUploadOpen(false)}
								className="icon-button shrink-0"
							>
								<X size={16} />
							</button>
						</div>

						<form className="grid gap-4 p-5 sm:p-6" onSubmit={handleUpload}>
							<label className="grid gap-2">
								<span className="field-label">Audio file</span>
								<input
									type="file"
									accept="audio/*"
									onChange={(event) => {
										const nextFile = event.target.files?.[0] ?? null;
										setUploadFile(nextFile);
										if (nextFile && !uploadTitle) {
											setUploadTitle(nextFile.name.replace(/\.[^.]+$/, ""));
										}
									}}
									className="field-input py-3"
								/>
							</label>
							<label className="grid gap-2">
								<span className="field-label">Display title</span>
								<input
									value={uploadTitle}
									onChange={(event) => setUploadTitle(event.target.value)}
									placeholder="Mix v3, ref print, master candidate..."
									className="field-input"
								/>
							</label>
							<label className="grid gap-2">
								<span className="field-label">Notes</span>
								<textarea
									value={uploadNotes}
									onChange={(event) => setUploadNotes(event.target.value)}
									rows={3}
									placeholder="Context for this file"
									className="field-input resize-y"
								/>
							</label>
							<label className="grid gap-2">
								<span className="field-label">Date</span>
								<input
									type="date"
									value={uploadSessionDate}
									onChange={(event) => setUploadSessionDate(event.target.value)}
									className="field-input"
								/>
							</label>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="text-sm text-[var(--color-text-muted)]">
									Large files decode in-browser, and peak data is cached locally
									in IndexedDB for future visits.
								</div>
								<button
									type="submit"
									disabled={uploading || !uploadFile}
									className="action-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
								>
									<Save size={15} />
									{uploading ? "Importing audio..." : "Import into song"}
								</button>
							</div>
							{uploadError && (
								<div className="callout-danger px-4 py-3 text-sm">
									{uploadError}
								</div>
							)}
						</form>
					</div>
				</div>
			)}
		</>
	);
}
