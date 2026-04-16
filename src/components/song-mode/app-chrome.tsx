import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { AudioWaveform, Library } from "lucide-react";
import { useSongMode } from "#/providers/song-mode-provider";
import { GlobalSearch } from "./global-search";
import { ThemeToggle } from "./theme-toggle";

interface SongModeHeaderState {
	title: string;
	showLibraryLink: boolean;
}

export function getSongModeHeaderState({
	songId,
	ready,
	songTitle,
}: {
	songId?: string;
	ready: boolean;
	songTitle?: string;
}): SongModeHeaderState {
	if (!songId) {
		return {
			title: "Library",
			showLibraryLink: false,
		};
	}

	if (!ready) {
		return {
			title: "Loading song...",
			showLibraryLink: true,
		};
	}

	if (songTitle !== undefined) {
		return {
			title: songTitle.trim() || "Untitled song",
			showLibraryLink: true,
		};
	}

	return {
		title: "Missing song",
		showLibraryLink: true,
	};
}

export function SongModeChrome({ children }: { children: React.ReactNode }) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { ready, getSongById } = useSongMode();
	const songMatch = matchRoute({ to: "/songs/$songId" });
	const songId = songMatch ? songMatch.songId : undefined;
	const songTitle = songId ? getSongById(songId)?.title : undefined;
	const headerState = getSongModeHeaderState({
		songId,
		ready,
		songTitle,
	});

	return (
		<div className="min-h-screen bg-[var(--color-app)] text-[var(--color-text)]">
			<header className="header-shell sticky top-0 z-30">
				<div className="flex w-full flex-col gap-4 px-3 py-4">
					<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
						<div className="flex min-w-0 items-center gap-4">
							<Link
								to="/"
								aria-label="Go to library"
								className="inline-flex items-center no-underline"
							>
								<span className="brand-mark inline-flex h-12 w-12 items-center justify-center border text-[var(--color-accent)]">
									<AudioWaveform size={22} />
								</span>
							</Link>

							<span className="min-w-0 truncate font-display text-2xl leading-none text-[var(--color-text)]">
								{headerState.title}
							</span>

							{headerState.showLibraryLink ? (
								<button
									type="button"
									onClick={() => navigate({ to: "/" })}
									className="action-secondary hidden items-center gap-2 px-4 py-2 text-sm font-semibold md:inline-flex"
								>
									<Library size={15} />
									Library
								</button>
							) : null}
						</div>

						<div className="flex w-full items-center gap-3 xl:w-auto">
							<GlobalSearch />
							<ThemeToggle />
						</div>
					</div>
				</div>
			</header>

			{children}
		</div>
	);
}
