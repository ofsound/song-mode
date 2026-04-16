import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, FolderOpenDot, Sparkles, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import {
	plainTextToRichText,
	richTextPreview,
} from "#/lib/song-mode/rich-text";
import { useSongMode } from "#/providers/song-mode-provider";

export function LibraryView() {
	const navigate = useNavigate();
	const { ready, error, songs, audioFiles, annotations, settings, createSong } =
		useSongMode();
	const [title, setTitle] = useState("");
	const [artist, setArtist] = useState("");
	const [project, setProject] = useState("");
	const [journalSeed, setJournalSeed] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const recentSongIds = settings.recents;
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

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!title.trim()) {
			return;
		}

		setSubmitting(true);
		try {
			const song = await createSong({
				title,
				artist,
				project,
				generalNotes: plainTextToRichText(journalSeed),
			});

			setTitle("");
			setArtist("");
			setProject("");
			setJournalSeed("");
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

	const newSongForm = (
		<aside className="panel-shell rounded-[2rem] p-6 sm:p-7 xl:sticky xl:top-8 xl:self-start">
			<p className="eyebrow">New song</p>
			<form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
				<Field label="Song title">
					<input
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="Song title"
						className="field-input"
					/>
				</Field>
				<div className="grid gap-4">
					<Field label="Artist">
						<input
							value={artist}
							onChange={(event) => setArtist(event.target.value)}
							placeholder="Artist or primary act"
							className="field-input"
						/>
					</Field>
					<Field label="Project">
						<input
							value={project}
							onChange={(event) => setProject(event.target.value)}
							placeholder="Album, campaign, or client"
							className="field-input"
						/>
					</Field>
				</div>
				<Field label="Journal seed">
					<textarea
						value={journalSeed}
						onChange={(event) => setJournalSeed(event.target.value)}
						rows={4}
						placeholder="Drop the first thoughts, goals, or revision context here."
						className="field-input resize-y"
					/>
				</Field>
				<button
					type="submit"
					disabled={submitting || !title.trim()}
					className="action-primary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
				>
					<FolderOpenDot size={16} />
					{submitting ? "Creating song..." : "Create song workspace"}
				</button>
			</form>
		</aside>
	);

	return (
		<main className="mx-auto flex w-[min(1480px,calc(100%-1.5rem))] flex-col gap-8 py-8">
			<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_min(22rem,34vw)] xl:items-start">
				<div className="flex min-w-0 flex-col gap-8">
					{error && (
						<div className="callout-danger rounded-[1.4rem] px-5 py-4 text-sm">
							{error}
						</div>
					)}

					{!ready ? (
						<section className="panel-shell rounded-[2rem] px-6 py-8 text-sm text-[var(--color-text-muted)]">
							Loading your local Song Mode library...
						</section>
					) : songs.length === 0 ? (
						<section className="panel-shell rounded-[2rem] px-7 py-10">
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
								<div className="rounded-[1.4rem] border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] px-5 py-5">
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
									<button
										key={song.id}
										type="button"
										onClick={() =>
											navigate({
												to: "/songs/$songId",
												params: {
													songId: song.id,
												},
											})
										}
										className="panel-shell group rounded-[1.75rem] p-6 text-left"
									>
										<div className="flex items-start justify-between gap-4">
											<div>
												<p className="eyebrow mb-3">
													{song.project || "Song workspace"}
												</p>
												<h2 className="text-2xl font-semibold text-[var(--color-text)]">
													{song.title}
												</h2>
												<p className="mt-2 text-sm text-[var(--color-text-subtle)]">
													{song.artist || "No artist set"}
												</p>
											</div>
											<span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] text-[var(--color-accent)] transition group-hover:border-[var(--color-border-strong)]">
												<ArrowRight size={17} />
											</span>
										</div>

										<p className="mt-5 text-sm leading-7 text-[var(--color-text-muted)]">
											{richTextPreview(
												song.generalNotes,
												"Journal is ready for the first pass.",
											)}
										</p>

										<div className="mt-6 flex flex-wrap gap-2">
											<StatChip
												icon={<Waves size={14} />}
												label={`${songAudioFiles.length} files`}
											/>
											<StatChip
												icon={<Sparkles size={14} />}
												label={`${songAnnotations.length} markers`}
											/>
										</div>
									</button>
								);
							})}
						</section>
					)}
				</div>

				{newSongForm}
			</div>
		</main>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid gap-2">
			<span className="text-[11px] font-semibold tracking-[0.18em] text-[var(--color-text-subtle)] uppercase">
				{label}
			</span>
			{children}
		</div>
	);
}

function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<span className="surface-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
			{icon}
			{label}
		</span>
	);
}
