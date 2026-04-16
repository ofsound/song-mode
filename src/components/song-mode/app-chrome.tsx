import { Link, useNavigate } from "@tanstack/react-router";
import { AudioWaveform, Library } from "lucide-react";
import { GlobalSearch } from "./global-search";
import { ThemeToggle } from "./theme-toggle";

export function SongModeChrome({ children }: { children: React.ReactNode }) {
	const navigate = useNavigate();

	return (
		<div className="min-h-screen bg-[var(--color-app)] text-[var(--color-text)]">
			<header className="header-shell sticky top-0 z-30">
				<div className="flex w-full flex-col gap-4 px-3 py-4">
					<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
						<div className="flex min-w-0 items-center gap-4">
							<Link
								to="/"
								className="inline-flex items-center gap-3 no-underline"
							>
								<span className="brand-mark inline-flex h-12 w-12 items-center justify-center border text-[var(--color-accent)]">
									<AudioWaveform size={22} />
								</span>
								<span className="min-w-0 font-display text-2xl leading-none text-[var(--color-text)]">
									Song Mode
								</span>
							</Link>

							<button
								type="button"
								onClick={() => navigate({ to: "/" })}
								className="action-secondary hidden items-center gap-2 px-4 py-2 text-sm font-semibold md:inline-flex"
							>
								<Library size={15} />
								Library
							</button>
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
