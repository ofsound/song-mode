import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, FolderOpenDot, Plus, Sparkles, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import {
	plainTextToRichText,
	richTextPreview,
} from "#/lib/song-mode/rich-text";
import { formatDuration } from "#/lib/song-mode/waveform";
import { useSongMode } from "#/providers/song-mode-provider";

export function LibraryView() {
	const navigate = useNavigate();
	const { ready, error, songs, audioFiles, annotations, settings, createSong } =
		useSongMode();
	const [isFormOpen, setIsFormOpen] = useState(songs.length === 0);
	const [title, setTitle] = useState("");
	const [artist, setArtist] = useState("");
	const [project, setProject] = useState("");
	const [journalSeed, setJournalSeed] = useState("");
	const [masteringSeed, setMasteringSeed] = useState("");
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

	const totalMinutes = audioFiles.reduce(
		(sum, audioFile) => sum + audioFile.durationMs,
		0,
	);

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
				masteringDetails: plainTextToRichText(masteringSeed),
			});

			setTitle("");
			setArtist("");
			setProject("");
			setJournalSeed("");
			setMasteringSeed("");
			setIsFormOpen(false);
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

	return (
		<main className="mx-auto flex w-[min(1480px,calc(100%-1.5rem))] flex-col gap-8 py-8">
			<section className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
				<div className="panel-shell relative overflow-hidden rounded-[2rem] px-6 py-7 sm:px-8">
					<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)]" />
					<p className="eyebrow mb-4">Library-first workflow</p>
					<h1 className="font-display text-5xl leading-[0.95] text-[var(--text-strong)] sm:text-7xl">
						Review songs by what you hear, not by folders.
					</h1>
					<p className="mt-5 max-w-3xl text-base leading-8 text-[var(--text-dim)] sm:text-lg">
						Import a song, stack every version or reference visibly, bookmark
						exact moments, and keep a journal beside the listening session.
					</p>

					<div className="mt-8 grid gap-3 sm:grid-cols-3">
						<MetricCard
							label="Songs"
							value={String(songs.length).padStart(2, "0")}
							accent="Library"
						/>
						<MetricCard
							label="Audio files"
							value={String(audioFiles.length).padStart(2, "0")}
							accent="Waveforms"
						/>
						<MetricCard
							label="Listening time"
							value={formatDuration(totalMinutes)}
							accent="Timeline"
						/>
					</div>
				</div>

				<div className="panel-shell rounded-[2rem] p-6 sm:p-7">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="eyebrow mb-2">New song</p>
							<h2 className="text-2xl font-semibold text-[var(--text-strong)]">
								Start the next review session
							</h2>
						</div>
						<button
							type="button"
							onClick={() => setIsFormOpen((current) => !current)}
							className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--panel-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-strong)]"
						>
							<Plus size={15} />
							{isFormOpen ? "Close" : "Create"}
						</button>
					</div>

					<p className="mt-3 text-sm leading-7 text-[var(--text-dim)]">
						Create the song record first, then upload every mix, reference, or
						master pass into a stacked waveform workspace.
					</p>

					{isFormOpen && (
						<form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
							<Field label="Song title">
								<input
									value={title}
									onChange={(event) => setTitle(event.target.value)}
									placeholder="Song title"
									className="field-input"
								/>
							</Field>
							<div className="grid gap-4 md:grid-cols-2">
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
							<Field label="Mastering details">
								<textarea
									value={masteringSeed}
									onChange={(event) => setMasteringSeed(event.target.value)}
									rows={3}
									placeholder="Targets, delivery notes, version requirements, or technical concerns."
									className="field-input resize-y"
								/>
							</Field>
							<button
								type="submit"
								disabled={submitting || !title.trim()}
								className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-3 text-sm font-semibold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-55"
							>
								<FolderOpenDot size={16} />
								{submitting ? "Creating song..." : "Create song workspace"}
							</button>
						</form>
					)}
				</div>
			</section>

			{error && (
				<div className="rounded-[1.4rem] border border-[rgba(255,122,94,0.35)] bg-[rgba(88,22,18,0.35)] px-5 py-4 text-sm text-[var(--danger-soft)]">
					{error}
				</div>
			)}

			{!ready ? (
				<section className="panel-shell rounded-[2rem] px-6 py-8 text-sm text-[var(--text-dim)]">
					Loading your local Song Mode library...
				</section>
			) : songs.length === 0 ? (
				<section className="panel-shell rounded-[2rem] px-7 py-10">
					<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div className="max-w-3xl">
							<p className="eyebrow mb-3">Guided empty state</p>
							<h2 className="text-3xl font-semibold text-[var(--text-strong)]">
								Start by creating a song, then upload audio files into it.
							</h2>
							<p className="mt-4 text-base leading-8 text-[var(--text-dim)]">
								Each audio file becomes a full waveform lane. You can seek,
								create point markers or regions, keep file-level notes, and
								maintain a persistent song journal on the right.
							</p>
						</div>
						<div className="rounded-[1.4rem] border border-[var(--border-strong)] bg-[var(--panel-elevated)] px-5 py-5">
							<div className="flex items-start gap-3 text-sm leading-7 text-[var(--text-dim)]">
								<Sparkles size={16} className="mt-1 text-[var(--accent)]" />
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
										<h2 className="text-2xl font-semibold text-[var(--text-strong)]">
											{song.title}
										</h2>
										<p className="mt-2 text-sm text-[var(--text-subtle)]">
											{song.artist || "No artist set"}
										</p>
									</div>
									<span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border-muted)] bg-[var(--panel-elevated)] text-[var(--accent)] transition group-hover:border-[var(--border-strong)]">
										<ArrowRight size={17} />
									</span>
								</div>

								<p className="mt-5 text-sm leading-7 text-[var(--text-dim)]">
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
			<span className="text-[11px] font-semibold tracking-[0.18em] text-[var(--text-subtle)] uppercase">
				{label}
			</span>
			{children}
		</div>
	);
}

function MetricCard({
	label,
	value,
	accent,
}: {
	label: string;
	value: string;
	accent: string;
}) {
	return (
		<div className="rounded-[1.5rem] border border-[var(--border-strong)] bg-[var(--panel)] px-4 py-4">
			<p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--text-subtle)] uppercase">
				{label}
			</p>
			<p className="mt-3 font-display text-4xl text-[var(--text-strong)]">
				{value}
			</p>
			<p className="mt-2 text-sm text-[var(--text-dim)]">{accent}</p>
		</div>
	);
}

function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-muted)] bg-[var(--panel-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-dim)]">
			{icon}
			{label}
		</span>
	);
}
