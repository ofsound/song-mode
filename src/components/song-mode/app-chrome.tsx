import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { useSongMode } from "#/providers/song-mode-provider";
import { GlobalSearch } from "./global-search";
import { ThemeToggle } from "./theme-toggle";

interface SongModeHeaderState {
	showLibraryLink: boolean;
}

interface SongRouteHeaderSlotValue {
	enabled: boolean;
	slot: HTMLDivElement | null;
}

export const SongRouteHeaderSlotContext =
	createContext<SongRouteHeaderSlotValue | null>(null);

export function useSongRouteHeaderSlot() {
	return useContext(SongRouteHeaderSlotContext);
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
			showLibraryLink: false,
		};
	}

	if (!ready) {
		return {
			showLibraryLink: true,
		};
	}

	if (songTitle !== undefined) {
		return {
			showLibraryLink: true,
		};
	}

	return {
		showLibraryLink: true,
	};
}

export function SongModeChrome({ children }: { children: React.ReactNode }) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { ready, getSongById } = useSongMode();
	const songMatch = matchRoute({ to: "/songs/$songId" });
	const songId = songMatch ? songMatch.songId : undefined;
	const isSongRoute = Boolean(songId);
	const songTitle = songId ? getSongById(songId)?.title : undefined;
	const showSongHeaderSlot = isSongRoute && ready && songTitle !== undefined;
	const [songHeaderSlot, setSongHeaderSlot] = useState<HTMLDivElement | null>(
		null,
	);
	const headerState = getSongModeHeaderState({
		songId,
		ready,
		songTitle,
	});
	const shellClassName = isSongRoute
		? "flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-[var(--color-app)] text-[var(--color-text)]"
		: "min-h-screen bg-[var(--color-app)] text-[var(--color-text)]";
	const headerClassName = isSongRoute
		? "header-shell z-30 shrink-0"
		: "header-shell sticky top-0 z-30";

	return (
		<SongRouteHeaderSlotContext.Provider
			value={{ enabled: isSongRoute, slot: songHeaderSlot }}
		>
			<div className={shellClassName}>
				<header className={headerClassName}>
					<div className="flex w-full flex-col gap-4 px-3 py-4">
						<div className="flex flex-col gap-4 xl:flex-row xl:items-end">
							<div
								className={
									isSongRoute
										? "flex min-w-0 items-center gap-4 xl:shrink-0"
										: "flex min-w-0 flex-1 items-center gap-4"
								}
							>
								{isSongRoute ? (
									<Link
										to="/"
										aria-label="Go to library"
										className="inline-flex items-center no-underline"
									>
										<span className="brand-mark inline-flex h-12 w-12 items-center justify-center border text-[var(--color-accent)]">
											<Library size={22} />
										</span>
									</Link>
								) : null}

								{headerState.showLibraryLink && !isSongRoute ? (
									<button
										type="button"
										onClick={() => navigate({ to: "/" })}
										className="action-secondary hidden items-center gap-2 px-4 py-2 text-sm font-semibold md:inline-flex"
									>
										<Library size={15} />
										Library
									</button>
								) : null}

								{!isSongRoute ? <GlobalSearch /> : null}
							</div>

							{showSongHeaderSlot ? (
								<div
									ref={setSongHeaderSlot}
									className="min-w-0 flex-1 xl:px-2"
								/>
							) : null}

							<div className="flex w-full min-w-0 items-center justify-end gap-3 xl:ml-auto xl:w-auto xl:shrink-0">
								<ThemeToggle />
							</div>
						</div>
					</div>
				</header>

				{isSongRoute ? (
					<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
						{children}
					</div>
				) : (
					children
				)}
			</div>
		</SongRouteHeaderSlotContext.Provider>
	);
}
