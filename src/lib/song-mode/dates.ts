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

export function formatIsoDateForDisplay(isoDate: string): string {
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

/** Resolved `YYYY-MM-DD` from stored session date or `createdAt` (UTC date part). */
export function resolveAudioFileSessionDateIso(
	audioFile: AudioFileRecord,
): string | null {
	const explicit = audioFile.sessionDate?.trim();
	if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
		return explicit;
	}

	const created = audioFile.createdAt;
	const datePart = created.length >= 10 ? created.slice(0, 10) : "";
	if (datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
		return datePart;
	}

	return null;
}

/** Value for `<input type="date" />` (never empty). */
export function resolveAudioFileSessionDateInputValue(
	audioFile: AudioFileRecord,
): string {
	return resolveAudioFileSessionDateIso(audioFile) ?? isoDateInLocalCalendar();
}

/** User-facing label for the file’s session date (explicit or from `createdAt`). */
export function resolveAudioFileSessionDateLabel(
	audioFile: AudioFileRecord,
): string {
	const iso = resolveAudioFileSessionDateIso(audioFile);
	return iso ? formatIsoDateForDisplay(iso) : "";
}
