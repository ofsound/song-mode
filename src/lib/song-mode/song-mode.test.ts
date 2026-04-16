import { describe, expect, it } from "vitest";
import { buildSongTargetPath, parseSongTarget } from "./links";
import {
	EMPTY_RICH_TEXT,
	plainTextToRichText,
	richTextToPlainText,
} from "./rich-text";
import { searchSongMode } from "./search";
import type { Annotation, AudioFileRecord, Song } from "./types";
import {
	hasRenderableWaveform,
	normalizeVolumeDb,
	normalizeWaveformData,
	volumeDbToGain,
} from "./waveform";

describe("song mode rich text", () => {
	it("converts paragraphs into searchable plain text", () => {
		const doc = plainTextToRichText("First line\nSecond line\n\nBridge idea");

		expect(richTextToPlainText(doc)).toBe("First line Second line Bridge idea");
		expect(richTextToPlainText(EMPTY_RICH_TEXT)).toBe("");
	});
});

describe("song mode links", () => {
	it("builds and parses deep links for file annotations", () => {
		const href = buildSongTargetPath({
			songId: "song-1",
			fileId: "file-3",
			annotationId: "annotation-9",
			timeMs: 42500,
			autoplay: true,
		});

		expect(href).toBe(
			"/songs/song-1?fileId=file-3&annotationId=annotation-9&timeMs=42500&autoplay=1",
		);
		expect(parseSongTarget(href)).toEqual({
			songId: "song-1",
			fileId: "file-3",
			annotationId: "annotation-9",
			timeMs: 42500,
			autoplay: true,
		});
	});
});

describe("song mode search", () => {
	it("finds song, journal, file, and annotation matches", () => {
		const songs: Song[] = [
			{
				id: "song-1",
				title: "Midnight Choir",
				artist: "Northline",
				project: "LP1",
				generalNotes: plainTextToRichText("Need more lift in the chorus"),
				audioFileOrder: ["file-1"],
				createdAt: "2026-04-15T00:00:00.000Z",
				updatedAt: "2026-04-15T00:00:00.000Z",
			},
		];

		const audioFiles: AudioFileRecord[] = [
			{
				id: "file-1",
				songId: "song-1",
				title: "Mix v4",
				notes: plainTextToRichText("Snare still feels dark"),
				masteringNote: EMPTY_RICH_TEXT,
				volumeDb: 0,
				durationMs: 180000,
				waveform: {
					peaks: [0.2, 0.8, 0.4],
					peakCount: 3,
					durationMs: 180000,
					sampleRate: 44100,
				},
				createdAt: "2026-04-15T00:00:00.000Z",
				updatedAt: "2026-04-15T00:00:00.000Z",
			},
		];

		const annotations: Annotation[] = [
			{
				id: "annotation-1",
				songId: "song-1",
				audioFileId: "file-1",
				type: "point",
				startMs: 54200,
				title: "Snare transient",
				body: plainTextToRichText("Transient needs more crack here"),
				color: "var(--color-annotation-4)",
				createdAt: "2026-04-15T00:00:00.000Z",
				updatedAt: "2026-04-15T00:00:00.000Z",
			},
		];

		const chorusResults = searchSongMode(
			{ songs, audioFiles, annotations },
			"chorus",
		);
		const snareResults = searchSongMode(
			{ songs, audioFiles, annotations },
			"snare",
		);

		expect(chorusResults.some((result) => result.type === "song")).toBe(true);
		expect(chorusResults.some((result) => result.type === "journal")).toBe(
			true,
		);
		expect(snareResults.some((result) => result.type === "file")).toBe(true);
		expect(snareResults.some((result) => result.type === "annotation")).toBe(
			true,
		);
		expect(
			snareResults.find((result) => result.type === "annotation")?.target
				.timeMs,
		).toBe(54200);
	});
});

describe("song mode waveform normalization", () => {
	it("filters invalid peaks and falls back to a renderable flat waveform", () => {
		expect(
			normalizeWaveformData(
				{
					peaks: [0.25, Number.NaN, -1, 4],
					peakCount: 4,
					durationMs: 1250,
					sampleRate: 48000,
				},
				500,
			),
		).toEqual({
			peaks: [0.25, 0, 1],
			peakCount: 3,
			durationMs: 1250,
			sampleRate: 48000,
		});

		const fallback = normalizeWaveformData(
			{
				peaks: [],
				peakCount: 0,
				durationMs: 0,
				sampleRate: 0,
			},
			2200,
		);

		expect(fallback.durationMs).toBe(2200);
		expect(fallback.sampleRate).toBe(44100);
		expect(fallback.peaks.length).toBeGreaterThan(0);
		expect(fallback.peaks.every((value) => value === 0)).toBe(true);
	});

	it("detects whether a stored waveform can be rendered", () => {
		expect(hasRenderableWaveform({ peaks: [0, 0.4] })).toBe(true);
		expect(hasRenderableWaveform({ peaks: [Number.NaN] })).toBe(false);
		expect(hasRenderableWaveform({ peaks: [] })).toBe(false);
	});
});

describe("song mode volume normalization", () => {
	it("defaults invalid values to 0 dB", () => {
		expect(normalizeVolumeDb(undefined)).toBe(0);
		expect(normalizeVolumeDb(Number.NaN)).toBe(0);
	});

	it("rounds to the nearest whole decibel and clamps to the supported range", () => {
		expect(normalizeVolumeDb(2.6)).toBe(3);
		expect(normalizeVolumeDb(-1.6)).toBe(-2);
		expect(normalizeVolumeDb(99)).toBe(12);
		expect(normalizeVolumeDb(-99)).toBe(-12);
	});

	it("converts decibels into linear gain", () => {
		expect(volumeDbToGain(0)).toBe(1);
		expect(volumeDbToGain(6)).toBeCloseTo(1.995, 3);
		expect(volumeDbToGain(-6)).toBeCloseTo(0.501, 3);
	});
});
