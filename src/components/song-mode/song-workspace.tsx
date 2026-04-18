import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SongLinkTarget, SongRouteSearch } from "#/lib/song-mode/types";
import { useSongMode } from "#/providers/song-mode-provider";
import { useSongRouteHeaderSlot } from "./app-chrome";
import { InspectorPane } from "./inspector-pane";
import { RichTextEditor, type RichTextToolbarAction } from "./rich-text-editor";
import { SongWorkspaceHeaderControls } from "./song-workspace-header-controls";
import { useSongWorkspaceShortcuts } from "./song-workspace-shortcuts";
import { SongWorkspaceUploadDialog } from "./song-workspace-upload-dialog";
import { SongWorkspaceWaveformList } from "./song-workspace-waveform-list";
import { useSongWorkspaceRouting } from "./use-song-workspace-routing";
import { useSongWorkspaceUpload } from "./use-song-workspace-upload";

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
		settings,
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
	const {
		activeAnnotation,
		activeAnnotationId,
		openTarget,
		patchRouteSelection,
		selectedAnnotations,
		selectedFile,
		selectedFileId,
	} = useSongWorkspaceRouting({
		audioFiles,
		getAnnotationsForFile,
		navigate,
		playback,
		ready,
		rememberSongOpened,
		search,
		seekFile,
		song,
		songId,
	});
	const {
		handleUpload,
		isUploadOpen,
		setIsUploadOpen,
		uploadError,
		uploadFile,
		uploadNotes,
		uploadSessionDate,
		uploadTitle,
		uploading,
		setUploadFile,
		setUploadNotes,
		setUploadSessionDate,
		setUploadTitle,
	} = useSongWorkspaceUpload({
		addAudioFile,
		patchRouteSelection,
		songId,
	});

	const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
	const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
		<SongWorkspaceHeaderControls
			song={song}
			showArtist={settings.ui.showArtist}
			showProject={settings.ui.showProject}
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
				className={`flex min-h-0 w-full flex-1 flex-col gap-6 overflow-y-auto px-3 py-8 [transition:filter_200ms_ease,opacity_200ms_ease] xl:overflow-hidden ${
					isUploadOpen ? "pointer-events-none blur-[3px] opacity-45" : ""
				}`}
				aria-hidden={isUploadOpen}
			>
				<section className="grid gap-5 xl:min-h-0 xl:flex-1 xl:overflow-hidden xl:[grid-template-columns:minmax(0,50%)_420px_minmax(280px,1fr)] xl:[grid-template-rows:minmax(0,1fr)] xl:items-stretch">
					<div className="flex min-w-0 flex-col gap-4 xl:min-h-0 xl:overflow-x-hidden xl:overflow-y-auto xl:pr-[calc(0.25rem+var(--song-workspace-waveform-tab-width))]">
						<SongWorkspaceWaveformList
							activeAnnotationId={activeAnnotationId}
							audioFiles={audioFiles}
							blobsByAudioId={blobsByAudioId}
							getAnnotationsForFile={getAnnotationsForFile}
							handleCreateAnnotation={(fileId, annotationInput) =>
								handleCreateAnnotation(fileId, {
									...annotationInput,
									songId,
									audioFileId: fileId,
								})
							}
							itemRefs={itemRefs}
							playback={playback}
							registerAudioElement={registerAudioElement}
							reorderAudioFiles={reorderAudioFiles}
							reportPlaybackState={reportPlaybackState}
							seekFile={seekFile}
							selectedFileId={selectedFileId}
							songId={songId}
							togglePlayback={togglePlayback}
							updateAnnotation={updateAnnotation}
							deleteAnnotation={deleteAnnotation}
							updateAudioFile={updateAudioFile}
							workspacePlayheadMsByFileId={workspace.playheadMsByFileId}
							onSelectFile={(fileId) =>
								patchRouteSelection({
									fileId,
									clearPlaybackParams: true,
								})
							}
							onSelectAnnotation={(fileId, annotationId) =>
								patchRouteSelection({
									fileId,
									annotationId,
									clearPlaybackParams: true,
								})
							}
						/>
					</div>

					<div className="flex min-w-0 flex-col xl:min-h-0 xl:overflow-hidden">
						<div className="min-h-0 flex-1 overflow-y-auto pr-1">
							<InspectorPane
								song={song}
								selectedFile={selectedFile}
								annotations={selectedAnnotations}
								activeAnnotation={activeAnnotation}
								onOpenTarget={(target: SongLinkTarget) => openTarget(target)}
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
