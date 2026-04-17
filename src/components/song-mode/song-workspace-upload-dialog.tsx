import { Save, X } from "lucide-react";

interface SongWorkspaceUploadDialogProps {
	uploadFile: File | null;
	uploadTitle: string;
	uploadNotes: string;
	uploadSessionDate: string;
	uploading: boolean;
	uploadError: string | null;
	onClose: () => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
	onFileChange: (file: File | null) => void;
	onUploadTitleChange: (value: string) => void;
	onUploadNotesChange: (value: string) => void;
	onUploadSessionDateChange: (value: string) => void;
}

export function SongWorkspaceUploadDialog({
	uploadFile,
	uploadTitle,
	uploadNotes,
	uploadSessionDate,
	uploading,
	uploadError,
	onClose,
	onSubmit,
	onFileChange,
	onUploadTitleChange,
	onUploadNotesChange,
	onUploadSessionDateChange,
}: SongWorkspaceUploadDialogProps) {
	return (
		<div className="song-modal">
			<button
				type="button"
				aria-label="Dismiss upload dialog"
				onClick={onClose}
				className="song-modal__backdrop"
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="upload-audio-title"
				className="song-modal__panel rise-in w-full max-w-[min(96rem,calc(100vw-2rem))]"
			>
				<div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4 sm:px-6">
					<div className="min-w-0">
						<p className="eyebrow mb-2">Audio import</p>
						<h2
							id="upload-audio-title"
							className="text-2xl font-semibold text-[var(--color-text)]"
						>
							Add file
						</h2>
					</div>
					<button
						type="button"
						aria-label="Close upload dialog"
						onClick={onClose}
						className="icon-button shrink-0"
					>
						<X size={16} />
					</button>
				</div>

				<form
					className="grid gap-4 p-5 sm:p-6"
					onSubmit={(event) => void onSubmit(event)}
				>
					<label className="grid gap-2">
						<span className="field-label">Audio file</span>
						<input
							type="file"
							accept="audio/*"
							onChange={(event) => {
								onFileChange(event.target.files?.[0] ?? null);
							}}
							className="field-input py-3"
						/>
					</label>
					<label className="grid gap-2">
						<span className="field-label">Display title</span>
						<input
							value={uploadTitle}
							onChange={(event) => onUploadTitleChange(event.target.value)}
							placeholder="Mix v3, ref print, master candidate..."
							className="field-input"
						/>
					</label>
					<label className="grid gap-2">
						<span className="field-label">Notes</span>
						<textarea
							value={uploadNotes}
							onChange={(event) => onUploadNotesChange(event.target.value)}
							rows={3}
							placeholder="Context for this file"
							className="field-input resize-y"
						/>
					</label>
					<label className="grid gap-2">
						<span className="field-label">Date</span>
						<input
							type="date"
							value={uploadSessionDate}
							onChange={(event) =>
								onUploadSessionDateChange(event.target.value)
							}
							className="field-input"
						/>
					</label>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="text-sm text-[var(--color-text-muted)]">
							Large files decode in-browser, and peak data is cached locally in
							IndexedDB for future visits.
						</div>
						<button
							type="submit"
							disabled={uploading || !uploadFile}
							className="action-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
						>
							<Save size={15} />
							{uploading ? "Importing audio..." : "Import into song"}
						</button>
					</div>
					{uploadError && (
						<div className="callout-danger px-4 py-3 text-sm">
							{uploadError}
						</div>
					)}
				</form>
			</div>
		</div>
	);
}
