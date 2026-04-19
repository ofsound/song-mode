import { Trash2, X } from "lucide-react";
import type { Song } from "#/lib/song-mode/types";

interface SongSettingsDialogProps {
	song: Song;
	deletingSong: boolean;
	showArtist: boolean;
	showProject: boolean;
	onClose: () => void;
	onDeleteSong: () => Promise<void> | void;
	onUpdateSong: (patch: Partial<Song>) => Promise<void>;
}

export function SongSettingsDialog({
	song,
	deletingSong,
	showArtist,
	showProject,
	onClose,
	onDeleteSong,
	onUpdateSong,
}: SongSettingsDialogProps) {
	return (
		<div
			className="song-modal"
			onKeyDownCapture={(event) => {
				if (event.key !== "Escape") {
					return;
				}

				event.preventDefault();
				onClose();
			}}
		>
			<button
				type="button"
				aria-label="Dismiss song settings dialog"
				onClick={onClose}
				className="song-modal__backdrop"
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="song-settings-title"
				className="song-modal__panel rise-in w-full max-w-[min(42rem,calc(100vw-2rem))]"
			>
				<div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4 sm:px-6">
					<div className="min-w-0">
						<h2
							id="song-settings-title"
							className="text-2xl font-semibold text-[var(--color-text)]"
						>
							Song settings
						</h2>
					</div>
					<button
						type="button"
						aria-label="Close song settings dialog"
						onClick={onClose}
						className="icon-button shrink-0"
					>
						<X size={16} />
					</button>
				</div>

				<div className="grid gap-4 p-5 sm:p-6">
					<label className="grid gap-2">
						<span className="field-label">Song title</span>
						<input
							value={song.title}
							onChange={(event) =>
								void onUpdateSong({
									title: event.target.value,
								})
							}
							className="field-input"
							placeholder="Song title"
							aria-label="Song title"
						/>
					</label>

					{showArtist ? (
						<label className="grid gap-2">
							<span className="field-label">Artist</span>
							<input
								value={song.artist}
								onChange={(event) =>
									void onUpdateSong({
										artist: event.target.value,
									})
								}
								className="field-input"
								placeholder="Artist"
								aria-label="Artist"
							/>
						</label>
					) : null}

					{showProject ? (
						<label className="grid gap-2">
							<span className="field-label">Project</span>
							<input
								value={song.project}
								onChange={(event) =>
									void onUpdateSong({
										project: event.target.value,
									})
								}
								className="field-input"
								placeholder="Project"
								aria-label="Project"
							/>
						</label>
					) : null}
				</div>

				<div className="flex items-center justify-end border-t border-[var(--color-border-subtle)] px-5 py-4 sm:px-6">
					<button
						type="button"
						onClick={() => void onDeleteSong()}
						disabled={deletingSong}
						className="inline-flex h-11 items-center gap-2 border border-[var(--color-danger-border)] bg-[var(--color-danger-surface)] px-4 text-sm font-semibold text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-55"
					>
						<Trash2 size={15} />
						Delete song
					</button>
				</div>
			</div>
		</div>
	);
}
