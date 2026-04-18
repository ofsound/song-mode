import { Upload } from "lucide-react";
import type { Song } from "#/lib/song-mode/types";

interface SongWorkspaceHeaderControlsProps {
	song: Song;
	onOpenUpload: () => void;
	onUpdateSong: (patch: Partial<Song>) => Promise<void>;
}

export function SongWorkspaceHeaderControls({
	song,
	onOpenUpload,
	onUpdateSong,
}: SongWorkspaceHeaderControlsProps) {
	return (
		<div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-start">
			<div className="min-w-0 max-w-[450px] xl:min-w-72 xl:flex-[1.35]">
				<input
					value={song.title}
					onChange={(event) =>
						void onUpdateSong({
							title: event.target.value,
						})
					}
					className="field-input h-12 px-3 py-0 text-lg font-bold leading-none text-[var(--color-text)]"
					placeholder="Song title"
					aria-label="Song title"
				/>
			</div>

			<div className="min-w-0 xl:w-40 xl:shrink-0">
				<input
					value={song.artist}
					onChange={(event) =>
						void onUpdateSong({
							artist: event.target.value,
						})
					}
					className="field-input h-12 px-3 py-0 text-sm font-bold leading-none"
					placeholder="Artist"
					aria-label="Artist"
				/>
			</div>

			<div className="min-w-0 xl:w-40 xl:shrink-0">
				<input
					value={song.project}
					onChange={(event) =>
						void onUpdateSong({
							project: event.target.value,
						})
					}
					className="field-input h-12 px-3 py-0 text-sm font-bold leading-none"
					placeholder="Project"
					aria-label="Project"
				/>
			</div>

			<div className="flex shrink-0 flex-wrap items-center gap-3">
				<button
					type="button"
					onClick={onOpenUpload}
					className="action-primary inline-flex h-12 shrink-0 items-center justify-center gap-2 px-5 text-sm font-semibold leading-none"
				>
					<Upload size={16} />
					Add file
				</button>
			</div>
		</div>
	);
}
