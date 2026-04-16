import { useNavigate } from "@tanstack/react-router";
import { Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isEditableElement } from "#/lib/song-mode/dom";
import { targetToRouteSearch } from "#/lib/song-mode/links";
import { useSongMode } from "#/providers/song-mode-provider";

export function GlobalSearch() {
	const navigate = useNavigate();
	const { ready, search } = useSongMode();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const blurTimerRef = useRef<number | null>(null);

	const results = useMemo(() => search(query), [query, search]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				inputRef.current?.focus();
				setOpen(true);
			}

			if (event.key === "/" && !isEditableElement(event.target)) {
				event.preventDefault();
				inputRef.current?.focus();
				setOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	useEffect(() => {
		return () => {
			if (blurTimerRef.current) {
				window.clearTimeout(blurTimerRef.current);
			}
		};
	}, []);

	return (
		<div className="relative w-full max-w-[32rem]">
			<label className="group flex items-center gap-3 rounded-full border border-[var(--border-strong)] bg-[var(--panel)] px-4 py-3 shadow-[0_10px_32px_rgba(3,8,19,0.2)]">
				<Search size={16} className="text-[var(--text-dim)]" />
				<input
					ref={inputRef}
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onBlur={() => {
						blurTimerRef.current = window.setTimeout(() => {
							setOpen(false);
						}, 140);
					}}
					placeholder="Search songs, journals, file notes, and markers"
					className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--text-dim)]"
				/>
				<span className="hidden rounded-full border border-[var(--border-muted)] px-2 py-1 text-[10px] font-semibold tracking-[0.16em] text-[var(--text-subtle)] uppercase md:inline-flex">
					Cmd/Ctrl+K
				</span>
			</label>

			{open && (
				<div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-40 rounded-[1.5rem] border border-[var(--border-strong)] bg-[color-mix(in_oklab,var(--panel)_92%,black_8%)] p-3 shadow-[0_22px_80px_rgba(2,6,23,0.4)] backdrop-blur-xl">
					{!ready ? (
						<div className="rounded-[1rem] px-4 py-5 text-sm text-[var(--text-dim)]">
							Loading local search index...
						</div>
					) : query.trim().length === 0 ? (
						<div className="flex items-start gap-3 rounded-[1rem] border border-dashed border-[var(--border-muted)] px-4 py-5 text-sm text-[var(--text-dim)]">
							<Sparkles size={16} className="mt-0.5 text-[var(--accent)]" />
							<div>
								Jump across songs, waveform notes, bookmark regions, and the
								song journal from one place.
							</div>
						</div>
					) : results.length === 0 ? (
						<div className="rounded-[1rem] px-4 py-5 text-sm text-[var(--text-dim)]">
							No local matches yet.
						</div>
					) : (
						<div className="space-y-2">
							{results.map((result) => (
								<button
									key={result.id}
									type="button"
									className="flex w-full items-start gap-3 rounded-[1rem] border border-transparent px-3 py-3 text-left hover:border-[var(--border-strong)] hover:bg-[var(--panel-elevated)]"
									onClick={() => {
										setOpen(false);
										setQuery("");
										navigate({
											to: "/songs/$songId",
											params: {
												songId: result.target.songId,
											},
											search: targetToRouteSearch(result.target),
										});
									}}
								>
									<span className="mt-1 rounded-full border border-[var(--border-muted)] bg-[var(--panel-elevated)] px-2 py-1 text-[10px] font-semibold tracking-[0.16em] text-[var(--text-subtle)] uppercase">
										{result.type}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block text-sm font-semibold text-[var(--text-strong)]">
											{result.title}
										</span>
										<span className="block text-xs text-[var(--text-subtle)]">
											{result.subtitle}
										</span>
										<span className="mt-1 block text-sm leading-6 text-[var(--text-dim)]">
											{result.snippet}
										</span>
									</span>
								</button>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
