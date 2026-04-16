import { Link, useNavigate } from "@tanstack/react-router";
import { AudioWaveform, Library, Music4 } from "lucide-react";
import { useSongMode } from "#/providers/song-mode-provider";
import { GlobalSearch } from "./global-search";

export function SongModeChrome({ children }: { children: React.ReactNode }) {
	const navigate = useNavigate();
	const { songs, settings } = useSongMode();
	const recentSongs = settings.recents
		.map((songId) => songs.find((song) => song.id === songId))
		.filter((song): song is NonNullable<typeof song> => Boolean(song))
		.slice(0, 4);

	return (
		<div className="min-h-screen bg-[var(--bg)] text-[var(--text-strong)]">
			<header className="sticky top-0 z-30 border-b border-[var(--border-muted)] bg-[color-mix(in_oklab,var(--bg)_76%,black_24%)]/90 backdrop-blur-xl">
				<div className="mx-auto flex w-[min(1480px,calc(100%-1.5rem))] flex-col gap-4 py-4">
					<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
						<div className="flex min-w-0 items-center gap-4">
							<Link
								to="/"
								className="inline-flex items-center gap-3 no-underline"
							>
								<span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[linear-gradient(145deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04))] text-[var(--accent)] shadow-[0_10px_30px_rgba(11,16,32,0.25)]">
									<AudioWaveform size={22} />
								</span>
								<span className="min-w-0">
									<span className="block text-[11px] font-semibold tracking-[0.2em] text-[var(--text-subtle)] uppercase">
										Song review workstation
									</span>
									<span className="block font-display text-2xl leading-none text-[var(--text-strong)]">
										Song Mode
									</span>
								</span>
							</Link>

							<button
								type="button"
								onClick={() => navigate({ to: "/" })}
								className="hidden items-center gap-2 rounded-full border border-[var(--border-muted)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--text-dim)] md:inline-flex"
							>
								<Library size={15} />
								Library
							</button>
						</div>

						<GlobalSearch />
					</div>

					{recentSongs.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-[11px] font-semibold tracking-[0.18em] text-[var(--text-subtle)] uppercase">
								Recent songs
							</span>
							{recentSongs.map((song) => (
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
									className="inline-flex items-center gap-2 rounded-full border border-[var(--border-muted)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:text-[var(--text-strong)]"
								>
									<Music4 size={14} />
									{song.title}
								</button>
							))}
						</div>
					)}
				</div>
			</header>

			{children}
		</div>
	);
}
