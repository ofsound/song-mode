import type { AudioFileRecord } from "#/lib/song-mode/types";

/** Local calendar date as `YYYY-MM-DD` (for `<input type="date" />`). */
export function isoDateInLocalCalendar(from: Date = new Date()): string {
	const y = from.getFullYear();
	const m = String(from.getMonth() + 1).padStart(2, "0");
	const d = String(from.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function parseIsoDateParts(
	isoDate: string,
): { y: number; m: number; d: number } | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
	if (!match) {
		return null;
	}

	return {
		y: Number(match[1]),
		m: Number(match[2]),
		d: Number(match[3]),
	};
}

function formatIsoDateForDisplay(isoDate: string): string {
	const parts = parseIsoDateParts(isoDate);
	if (!parts) {
		return isoDate;
	}

	return new Date(parts.y, parts.m - 1, parts.d).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/** Resolved `YYYY-MM-DD` from the stored session date. */
function resolveAudioFileSessionDateIso(audioFile: AudioFileRecord): string {
	const explicit = audioFile.sessionDate.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
		return explicit;
	}

	return isoDateInLocalCalendar();
}

/** Value for `<input type="date" />` (never empty). */
export function resolveAudioFileSessionDateInputValue(
	audioFile: AudioFileRecord,
): string {
	return resolveAudioFileSessionDateIso(audioFile);
}

/** User-facing label for the file’s stored session date. */
export function resolveAudioFileSessionDateLabel(
	audioFile: AudioFileRecord,
): string {
	const iso = resolveAudioFileSessionDateIso(audioFile);
	return formatIsoDateForDisplay(iso);
}
