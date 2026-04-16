import { Link, useNavigate } from "@tanstack/react-router";
import { AudioWaveform, Library } from "lucide-react";
import { GlobalSearch } from "./global-search";

export function SongModeChrome({ children }: { children: React.ReactNode }) {
	const navigate = useNavigate();

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
								<span className="min-w-0 font-display text-2xl leading-none text-[var(--text-strong)]">
									Song Mode
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
				</div>
			</header>

			{children}
		</div>
	);
}
