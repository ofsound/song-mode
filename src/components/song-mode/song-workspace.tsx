import { Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronLeft,
	ListMusic,
	PauseCircle,
	Save,
	Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isEditableElement } from "#/lib/song-mode/dom";
import { targetToRouteSearch } from "#/lib/song-mode/links";
import { plainTextToRichText } from "#/lib/song-mode/rich-text";
import type { SongLinkTarget, SongRouteSearch } from "#/lib/song-mode/types";
import { useSongMode } from "#/providers/song-mode-provider";
import { InspectorPane } from "./inspector-pane";
import { RichTextEditor } from "./rich-text-editor";
import { WaveformCard } from "./waveform-card";

export function SongWorkspace({
	songId,
	search,
}: {
	songId: string;
	search: SongRouteSearch;
}) {
	const navigate = useNavigate();
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
	const audioFiles = useMemo(
		() => getSongAudioFiles(songId),
		[getSongAudioFiles, songId],
	);
	const workspace = getWorkspaceState(songId);
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

	const [isUploadOpen, setIsUploadOpen] = useState(audioFiles.length === 0);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const [uploadTitle, setUploadTitle] = useState("");
	const [uploadNotes, setUploadNotes] = useState("");
	const [uploadMastering, setUploadMastering] = useState("");
	const [draggingFileId, setDraggingFileId] = useState<string | null>(null);

	const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
	const appliedSearchRef = useRef<string>("");

	useEffect(() => {
		if (!ready || !song) {
			return;
		}

		void rememberSongOpened(songId);
	}, [ready, rememberSongOpened, song, songId]);

	useEffect(() => {
		if (!ready || !song || !audioFiles.length) {
			return;
		}

		const nextSelectedFileId =
			search.fileId ?? workspace.selectedFileId ?? audioFiles[0]?.id;
		const nextActiveAnnotationId =
			search.annotationId ??
			(workspace.activeAnnotationId &&
			getAnnotationsForFile(nextSelectedFileId ?? "").some(
				(annotation) => annotation.id === workspace.activeAnnotationId,
			)
				? workspace.activeAnnotationId
				: undefined);

		if (
			nextSelectedFileId !== workspace.selectedFileId ||
			nextActiveAnnotationId !== workspace.activeAnnotationId
		) {
			void updateWorkspaceState(songId, {
				selectedFileId: nextSelectedFileId,
				activeAnnotationId: nextActiveAnnotationId,
			});
		}
	}, [
		audioFiles,
		getAnnotationsForFile,
		ready,
		search.annotationId,
		search.fileId,
		song,
		songId,
		updateWorkspaceState,
		workspace.activeAnnotationId,
		workspace.selectedFileId,
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

	const currentTimeMs =
		(selectedFileId && playback.currentTimeByFileId[selectedFileId]) ||
		(selectedFileId && workspace.playheadMsByFileId[selectedFileId]) ||
		0;
	const persistedSecond = Math.round(currentTimeMs / 1000);

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
		const handleKeyDown = (event: KeyboardEvent) => {
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

			if (event.key === "ArrowLeft") {
				event.preventDefault();
				void seekActiveBy(-5000);
			}

			if (event.key === "ArrowRight") {
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
		jumpBetweenAnnotations,
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
		return annotation;
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
				notes: plainTextToRichText(uploadNotes),
				masteringNote: plainTextToRichText(uploadMastering),
			});
			await updateWorkspaceState(songId, {
				selectedFileId: audioFile.id,
				activeAnnotationId: undefined,
			});

			setUploadFile(null);
			setUploadTitle("");
			setUploadNotes("");
			setUploadMastering("");
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

	return (
		<main className="flex w-full flex-col gap-6 px-3 py-8">
			<section className="panel-shell px-6 py-6">
				<div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
					<div className="min-w-0">
						<Link
							to="/"
							className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text-subtle)] no-underline"
						>
							<ChevronLeft size={14} />
							Song library
						</Link>
						<div className="mt-4 grid max-w-3xl gap-4">
							<label className="grid gap-2">
								<span className="field-label">Song title</span>
								<input
									value={song.title}
									onChange={(event) =>
										void updateSong(song.id, {
											title: event.target.value,
										})
									}
									className="field-input font-display text-3xl leading-tight text-[var(--color-text)] sm:text-4xl"
								/>
							</label>
							<div className="grid gap-4 sm:grid-cols-2">
								<label className="grid gap-2">
									<span className="field-label">Artist</span>
									<input
										value={song.artist}
										onChange={(event) =>
											void updateSong(song.id, {
												artist: event.target.value,
											})
										}
										className="field-input"
									/>
								</label>
								<label className="grid gap-2">
									<span className="field-label">Project</span>
									<input
										value={song.project}
										onChange={(event) =>
											void updateSong(song.id, {
												project: event.target.value,
											})
										}
										className="field-input"
									/>
								</label>
							</div>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<button
							type="button"
							onClick={() => setIsUploadOpen((current) => !current)}
							className="action-secondary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
						>
							<Upload size={14} />
							{isUploadOpen ? "Hide upload" : "Add audio"}
						</button>
						<button
							type="button"
							onClick={() =>
								selectedFileId && void togglePlayback(selectedFileId)
							}
							className="action-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
						>
							<PauseCircle size={15} />
							Spacebar ready
						</button>
					</div>
				</div>

				{isUploadOpen && (
					<form
						className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]"
						onSubmit={handleUpload}
					>
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
							<span className="field-label">Mastering note</span>
							<textarea
								value={uploadMastering}
								onChange={(event) => setUploadMastering(event.target.value)}
								rows={3}
								placeholder="Technical notes or delivery constraints"
								className="field-input resize-y"
							/>
						</label>
						<div className="xl:col-span-4 flex flex-wrap items-center justify-between gap-3">
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
							<div className="callout-danger xl:col-span-4 px-4 py-3 text-sm">
								{uploadError}
							</div>
						)}
					</form>
				)}
			</section>

			<section className="grid gap-5 xl:grid-cols-[minmax(0,1.38fr)_420px_minmax(280px,400px)]">
				<div className="panel-shell p-4 sm:p-5">
					<div className="mb-4 flex items-center justify-between gap-3">
						<p className="eyebrow">Waveform stack</p>
						<span className="surface-chip inline-flex items-center gap-2 px-3 py-2 text-xs font-medium">
							<ListMusic size={14} />
							Shift+↑ / Shift+↓ jumps markers
						</span>
					</div>

					<div className="space-y-4">
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
										onSelectFile={(fileId) =>
											void updateWorkspaceState(songId, {
												selectedFileId: fileId,
												activeAnnotationId: undefined,
											})
										}
										onSelectAnnotation={(annotationId) =>
											void updateWorkspaceState(songId, {
												selectedFileId: audioFile.id,
												activeAnnotationId: annotationId,
											})
										}
										onCreateAnnotation={(annotationInput) =>
											handleCreateAnnotation(audioFile.id, {
												...annotationInput,
												songId,
												audioFileId: audioFile.id,
											})
										}
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
				</div>

				<div className="panel-shell p-4 sm:p-5">
					<div className="flex max-h-[calc(100vh-15rem)] min-h-[44rem] flex-col overflow-hidden">
						<div className="min-h-0 flex-1 overflow-y-auto">
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
								onSelectAnnotation={(annotationId) =>
									void updateWorkspaceState(songId, {
										selectedFileId,
										activeAnnotationId: annotationId,
									})
								}
							/>
						</div>
					</div>
				</div>

				<div className="panel-shell p-4 sm:p-5 xl:sticky xl:top-8 xl:self-start">
					<div className="max-h-[calc(100vh-15rem)] min-h-[44rem] overflow-y-auto">
						<section className="flex flex-col gap-4 border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4">
							<p className="eyebrow">Song journal</p>

							<div className="grid gap-4">
								<div className="grid gap-2">
									<span className="field-label">Journal</span>
									<RichTextEditor
										value={song.generalNotes}
										onChange={(nextValue) =>
											void updateSong(song.id, {
												generalNotes: nextValue,
											})
										}
										onInternalLink={openTarget}
										focusId="journal"
									/>
								</div>
							</div>
						</section>
					</div>
				</div>
			</section>
		</main>
	);
}
