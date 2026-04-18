import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isoDateInLocalCalendar } from "#/lib/song-mode/dates";
import { targetToRouteSearch } from "#/lib/song-mode/links";
import { findCrossedAnnotation } from "#/lib/song-mode/playback";
import { plainTextToRichText } from "#/lib/song-mode/rich-text";
import type { SongLinkTarget, SongRouteSearch } from "#/lib/song-mode/types";
import { normalizeVolumeDb } from "#/lib/song-mode/waveform";
import { useSongMode } from "#/providers/song-mode-provider";
import { useSongRouteHeaderSlot } from "./app-chrome";
import { InspectorPane } from "./inspector-pane";
import { RichTextEditor, type RichTextToolbarAction } from "./rich-text-editor";
import { SongWorkspaceHeaderControls } from "./song-workspace-header-controls";
import { useSongWorkspaceShortcuts } from "./song-workspace-shortcuts";
import { SongWorkspaceUploadDialog } from "./song-workspace-upload-dialog";
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
	const selectedFileId =
		(search.fileId &&
		audioFiles.some((audioFile) => audioFile.id === search.fileId)
			? search.fileId
			: audioFiles[0]?.id) ?? undefined;
	const selectedFile = audioFiles.find(
		(audioFile) => audioFile.id === selectedFileId,
	);
	const selectedAnnotations = selectedFile
		? getAnnotationsForFile(selectedFile.id)
		: [];
	const activeAnnotationId =
		search.annotationId &&
		selectedAnnotations.some(
			(annotation) => annotation.id === search.annotationId,
		)
			? search.annotationId
			: undefined;
	const activeAnnotation =
		selectedAnnotations.find(
			(annotation) => annotation.id === activeAnnotationId,
		) ?? undefined;

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
	const rememberedSongIdRef = useRef<string | null>(null);

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

		if (rememberedSongIdRef.current === songId) {
			return;
		}

		rememberedSongIdRef.current = songId;
		void rememberSongOpened(songId);
	}, [ready, rememberSongOpened, song, songId]);

	useEffect(() => {
		if (isUploadOpen) {
			setUploadSessionDate(isoDateInLocalCalendar());
		}
	}, [isUploadOpen]);

	useEffect(() => {
		if (!ready) {
			return;
		}

		if (search.fileId && search.fileId !== selectedFileId) {
			patchRouteSelection({
				fileId: selectedFileId,
			});
			return;
		}

		if (search.annotationId && search.annotationId !== activeAnnotationId) {
			patchRouteSelection({
				fileId: selectedFileId,
				annotationId: activeAnnotationId,
			});
		}
	}, [
		activeAnnotationId,
		patchRouteSelection,
		ready,
		search.annotationId,
		search.fileId,
		selectedFileId,
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
		if (
			previous.fileId !== activeFileId ||
			typeof previous.timeMs !== "number"
		) {
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

		if (
			!crossed ||
			activeFileId !== selectedFileId ||
			search.annotationId === crossed.id
		) {
			return;
		}

		patchRouteSelection({
			fileId: activeFileId,
			annotationId: crossed.id,
			clearPlaybackParams: true,
		});
	}, [
		getAnnotationsForFile,
		patchRouteSelection,
		playback.activeFileId,
		playback.currentTimeByFileId,
		search.annotationId,
		selectedFileId,
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
				playheadMsByFileId: {
					...current.playheadMsByFileId,
					[selectedFileId]: persistedSecond * 1000,
				},
			}));
		}, 320);

		return () => {
			window.clearTimeout(handle);
		};
	}, [persistedSecond, selectedFileId, songId, updateWorkspaceState]);

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

	useSongWorkspaceShortcuts({
		isUploadOpen,
		jumpBetweenAnnotations,
		onCloseUpload: () => setIsUploadOpen(false),
		patchRouteSelection,
		seekActiveBy,
		selectedFileId,
		songId,
		togglePlayback,
	});

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
			<main className="song-mode-main">
				<section className="panel-shell px-6 py-8 text-sm text-[var(--color-text-muted)]">
					Loading song workspace...
				</section>
			</main>
		);
	}

	if (!song) {
		return (
			<main className="song-mode-main">
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
		<SongWorkspaceHeaderControls
			song={song}
			onOpenUpload={() => setIsUploadOpen(true)}
			onUpdateSong={(patch) => updateSong(song.id, patch)}
		/>
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
				className={`song-workspace-main ${
					isUploadOpen ? "pointer-events-none blur-[3px] opacity-45" : ""
				}`}
				aria-hidden={isUploadOpen}
			>
				<section className="song-workspace-main-grid grid gap-5 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
					<div className="song-workspace-waveform-column flex min-w-0 flex-col gap-4 xl:min-h-0">
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
										activeAnnotationId={activeAnnotationId}
										onSelectFile={(fileId) => {
											patchRouteSelection({
												fileId,
												clearPlaybackParams: true,
											});
										}}
										onSelectAnnotation={(annotationId) => {
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
				<SongWorkspaceUploadDialog
					uploadFile={uploadFile}
					uploadTitle={uploadTitle}
					uploadNotes={uploadNotes}
					uploadSessionDate={uploadSessionDate}
					uploading={uploading}
					uploadError={uploadError}
					onClose={() => setIsUploadOpen(false)}
					onSubmit={handleUpload}
					onFileChange={(nextFile) => {
						setUploadFile(nextFile);
						if (nextFile && !uploadTitle) {
							setUploadTitle(nextFile.name.replace(/\.[^.]+$/, ""));
						}
					}}
					onUploadTitleChange={setUploadTitle}
					onUploadNotesChange={setUploadNotes}
					onUploadSessionDateChange={setUploadSessionDate}
				/>
			)}
		</>
	);
}
