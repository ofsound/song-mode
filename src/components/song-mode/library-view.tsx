import { useNavigate } from "@tanstack/react-router";
import {
	Bookmark,
	File,
	FolderOpenDot,
	Plus,
	Settings2,
	Sparkles,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { EMPTY_RICH_TEXT, richTextPreview } from "#/lib/song-mode/rich-text";
import { useSongMode } from "#/providers/song-mode-provider";
import { useLibraryHeaderActionSlot } from "./app-chrome";
import { SongSettingsDialog } from "./song-settings-dialog";
import { useCloseOnEscape } from "./use-close-on-escape";

export function LibraryView() {
	const navigate = useNavigate();
	const libraryHeaderActionSlot = useLibraryHeaderActionSlot();
	const {
		ready,
		error,
		songs,
		audioFiles,
		annotations,
		settings,
		createSong,
		updateSong,
		deleteSong,
	} = useSongMode();
	const [title, setTitle] = useState("");
	const [artist, setArtist] = useState("");
	const [project, setProject] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
	const [editingSongId, setEditingSongId] = useState<string | null>(null);
	const [isCreateSongOpen, setIsCreateSongOpen] = useState(false);

	const recentSongIds = settings.recents;
	const { showArtist, showProject } = settings.ui;
	const orderedSongs = useMemo(() => {
		const recencyMap = new Map(recentSongIds.map((id, index) => [id, index]));

		return [...songs].sort((left, right) => {
			const leftRecent = recencyMap.get(left.id);
			const rightRecent = recencyMap.get(right.id);

			if (typeof leftRecent === "number" && typeof rightRecent === "number") {
				return leftRecent - rightRecent;
			}

			if (typeof leftRecent === "number") {
				return -1;
			}

			if (typeof rightRecent === "number") {
				return 1;
			}

			return right.updatedAt.localeCompare(left.updatedAt);
		});
	}, [recentSongIds, songs]);
	const editingSong = useMemo(
		() => songs.find((song) => song.id === editingSongId) ?? null,
		[editingSongId, songs],
	);
	const isModalOpen = isCreateSongOpen || Boolean(editingSong);

	useCloseOnEscape(isModalOpen, () => {
		if (editingSong) {
			setEditingSongId(null);
			return;
		}

		setIsCreateSongOpen(false);
	});

	useEffect(() => {
		if (editingSongId && !editingSong) {
			setEditingSongId(null);
		}
	}, [editingSong, editingSongId]);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!title.trim()) {
			return;
		}

		setSubmitting(true);
		try {
			const song = await createSong({
				title,
				artist: showArtist ? artist : "",
				project: showProject ? project : "",
				generalNotes: EMPTY_RICH_TEXT,
			});

			setTitle("");
			setArtist("");
			setProject("");
			setIsCreateSongOpen(false);
			navigate({
				to: "/songs/$songId",
				params: {
					songId: song.id,
				},
			});
		} finally {
			setSubmitting(false);
		}
	}

	async function handleDeleteSong(songId: string) {
		if (!window.confirm("Delete this song?")) {
			return;
		}

		setDeletingSongId(songId);
		try {
			await deleteSong(songId);
			setEditingSongId((current) => (current === songId ? null : current));
		} finally {
			setDeletingSongId((current) => (current === songId ? null : current));
		}
	}

	const createSongTrigger = (
		<button
			type="button"
			onClick={() => setIsCreateSongOpen(true)}
			className="action-primary inline-flex h-12 shrink-0 items-center justify-center gap-2 px-4 text-sm font-semibold leading-none"
		>
			<Plus size={18} />
			Create song
		</button>
	);
	const renderedCreateSongTrigger = libraryHeaderActionSlot?.slot
		? createPortal(createSongTrigger, libraryHeaderActionSlot.slot)
		: libraryHeaderActionSlot?.enabled
			? null
			: createSongTrigger;

	return (
		<>
			{renderedCreateSongTrigger}
			<main
				className={`flex w-full flex-col gap-8 px-3 py-8 [transition:filter_200ms_ease,opacity_200ms_ease] ${
					isModalOpen ? "pointer-events-none blur-[3px] opacity-45" : ""
				}`}
				aria-hidden={isModalOpen}
			>
				<div className="flex min-w-0 flex-col gap-8">
					{error && (
						<div className="callout-danger px-5 py-4 text-sm">{error}</div>
					)}

					{!ready ? (
						<section className="panel-shell px-6 py-8 text-sm text-[var(--color-text-muted)]">
							Loading your local Song Mode library...
						</section>
					) : songs.length === 0 ? (
						<section className="panel-shell px-7 py-10">
							<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
								<div className="max-w-3xl">
									<p className="eyebrow mb-3">Guided empty state</p>
									<h2 className="text-3xl font-semibold text-[var(--color-text)]">
										Start by creating a song, then upload audio files into it.
									</h2>
									<p className="mt-4 text-base leading-8 text-[var(--color-text-muted)]">
										Each audio file becomes a full waveform lane. You can seek,
										create point markers or regions, keep file-level notes, and
										maintain a persistent song journal on the right.
									</p>
								</div>
								<div className="border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] px-5 py-5">
									<div className="flex items-start gap-3 text-sm leading-7 text-[var(--color-text-muted)]">
										<Sparkles
											size={16}
											className="mt-1 text-[var(--color-accent)]"
										/>
										<div>
											Use the global search bar once you have content. It jumps
											across songs, notes, and time-based annotations.
										</div>
									</div>
								</div>
							</div>
						</section>
					) : (
						<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{orderedSongs.map((song) => {
								const songAudioFiles = audioFiles.filter(
									(audioFile) => audioFile.songId === song.id,
								);
								const songAnnotations = annotations.filter(
									(annotation) => annotation.songId === song.id,
								);
								return (
									<div
										key={song.id}
										className="panel-shell panel-shell--plain panel-shell-action h-full w-full p-6 text-left"
									>
										<div className="flex items-start gap-2">
											<button
												type="button"
												onClick={() =>
													navigate({
														to: "/songs/$songId",
														params: {
															songId: song.id,
														},
													})
												}
												className="block min-w-0 flex-1 text-left"
											>
												<div>
													<h2 className="text-2xl font-semibold text-[var(--color-text)]">
														{song.title}
													</h2>
													{showArtist ? (
														<p className="mt-2 text-sm text-[var(--color-text-subtle)]">
															{song.artist || "No artist set"}
														</p>
													) : null}
												</div>

												<p className="mt-5 text-sm leading-7 text-[var(--color-text-muted)]">
													{richTextPreview(
														song.generalNotes,
														"Journal is ready for the first pass.",
													)}
												</p>
											</button>
											<button
												type="button"
												onClick={() => setEditingSongId(song.id)}
												className="icon-button icon-button--sm -mt-0.5 shrink-0"
												title="Edit song settings"
												aria-label={`Edit settings for ${song.title}`}
											>
												<Settings2 size={12} />
											</button>
										</div>

										<div className="mt-6 flex items-center gap-2">
											<StatChip
												icon={<File size={14} />}
												label={`${songAudioFiles.length} files`}
											/>
											<StatChip
												icon={<Bookmark size={14} />}
												label={`${songAnnotations.length} markers`}
											/>
										</div>
									</div>
								);
							})}
						</section>
					)}
				</div>
			</main>

			{isCreateSongOpen && (
				<div
					className="song-modal"
					onKeyDownCapture={(event) => {
						if (event.key !== "Escape") {
							return;
						}

						event.preventDefault();
						setIsCreateSongOpen(false);
					}}
				>
					<button
						type="button"
						aria-label="Dismiss create song dialog"
						onClick={() => setIsCreateSongOpen(false)}
						className="song-modal__backdrop"
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby="create-song-title"
						className="song-modal__panel rise-in w-full max-w-[min(96rem,calc(100vw-2rem))]"
					>
						<div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4 sm:px-6">
							<div className="min-w-0">
								<h2
									id="create-song-title"
									className="text-2xl font-semibold text-[var(--color-text)]"
								>
									Create song
								</h2>
							</div>
							<button
								type="button"
								aria-label="Close create song dialog"
								onClick={() => setIsCreateSongOpen(false)}
								className="icon-button shrink-0"
							>
								<X size={16} />
							</button>
						</div>

						<form className="grid gap-4 p-5 sm:p-6" onSubmit={handleSubmit}>
							<label className="grid gap-2">
								<span className="field-label">Song title</span>
								<input
									value={title}
									onChange={(event) => setTitle(event.target.value)}
									placeholder="Song title"
									className="field-input"
								/>
							</label>
							{showArtist ? (
								<label className="grid gap-2">
									<span className="field-label">Artist</span>
									<input
										value={artist}
										onChange={(event) => setArtist(event.target.value)}
										placeholder="Artist"
										className="field-input"
									/>
								</label>
							) : null}
							{showProject ? (
								<label className="grid gap-2">
									<span className="field-label">Project</span>
									<input
										value={project}
										onChange={(event) => setProject(event.target.value)}
										placeholder="Project"
										className="field-input"
									/>
								</label>
							) : null}
							<div className="flex justify-end">
								<button
									type="submit"
									disabled={submitting || !title.trim()}
									className="action-primary inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
								>
									<FolderOpenDot size={16} />
									{submitting ? "Creating song..." : "Create song"}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{editingSong ? (
				<SongSettingsDialog
					song={editingSong}
					deletingSong={deletingSongId === editingSong.id}
					showArtist={showArtist}
					showProject={showProject}
					onClose={() => setEditingSongId(null)}
					onDeleteSong={() => handleDeleteSong(editingSong.id)}
					onUpdateSong={(patch) => updateSong(editingSong.id, patch)}
				/>
			) : null}
		</>
	);
}

function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<span className="surface-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium">
			{icon}
			{label}
		</span>
	);
}
