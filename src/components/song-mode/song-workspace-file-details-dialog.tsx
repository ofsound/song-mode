import { Trash2, X } from "lucide-react";
import { resolveAudioFileSessionDateInputValue } from "#/lib/song-mode/dates";
import type { AudioFileRecord } from "#/lib/song-mode/types";

interface SongWorkspaceFileDetailsDialogProps {
	audioFile: AudioFileRecord;
	deletingFile: boolean;
	onClose: () => void;
	onDeleteFile: () => Promise<void> | void;
	onUpdateFile: (patch: Partial<AudioFileRecord>) => Promise<void>;
}

export function SongWorkspaceFileDetailsDialog({
	audioFile,
	deletingFile,
	onClose,
	onDeleteFile,
	onUpdateFile,
}: SongWorkspaceFileDetailsDialogProps) {
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
				aria-label="Dismiss file details dialog"
				onClick={onClose}
				className="song-modal__backdrop"
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="file-details-title"
				className="song-modal__panel rise-in w-full max-w-[min(42rem,calc(100vw-2rem))]"
			>
				<div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4 sm:px-6">
					<div className="min-w-0">
						<h2
							id="file-details-title"
							className="text-2xl font-semibold text-[var(--color-text)]"
						>
							File details
						</h2>
					</div>
					<button
						type="button"
						aria-label="Close file details dialog"
						onClick={onClose}
						className="icon-button shrink-0"
					>
						<X size={16} />
					</button>
				</div>

				<div className="grid gap-4 p-5 sm:p-6">
					<label className="grid gap-2">
						<span className="field-label">File title</span>
						<input
							value={audioFile.title}
							onChange={(event) =>
								void onUpdateFile({
									title: event.target.value,
								})
							}
							className="field-input"
							placeholder="Mix v3, ref print, master candidate..."
							aria-label="File title"
						/>
					</label>

					<label className="grid gap-2">
						<span className="field-label">File date</span>
						<input
							type="date"
							value={resolveAudioFileSessionDateInputValue(audioFile)}
							onChange={(event) =>
								void onUpdateFile({
									sessionDate: event.target.value,
								})
							}
							className="field-input"
							aria-label="File date"
						/>
					</label>
				</div>

				<div className="flex items-center justify-end border-t border-[var(--color-border-subtle)] px-5 py-4 sm:px-6">
					<button
						type="button"
						onClick={() => void onDeleteFile()}
						disabled={deletingFile}
						className="inline-flex h-11 items-center gap-2 border border-[var(--color-danger-border)] bg-[var(--color-danger-surface)] px-4 text-sm font-semibold text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-55"
					>
						<Trash2 size={15} />
						Delete file
					</button>
				</div>
			</div>
		</div>
	);
}
