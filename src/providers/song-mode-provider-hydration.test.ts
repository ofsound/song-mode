import { describe, expect, it } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/song-mode/rich-text";
import {
	createEmptySettings,
	type SongModeSnapshot,
} from "#/lib/song-mode/types";
import { normalizeLoadedSnapshot } from "./song-mode-provider-hydration";

describe("normalizeLoadedSnapshot", () => {
	it("rewrites legacy annotation colors to the new semantic marker tokens", async () => {
		const snapshot: SongModeSnapshot = {
			songs: [],
			audioFiles: [],
			annotations: [
				{
					id: "annotation-point",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 1000,
					title: "Point",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-annotation-4)",
					createdAt: "2026-04-18T00:00:00.000Z",
					updatedAt: "2026-04-18T00:00:00.000Z",
				},
				{
					id: "annotation-range",
					songId: "song-1",
					audioFileId: "file-1",
					type: "range",
					startMs: 2000,
					endMs: 3000,
					title: "Range",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-annotation-2)",
					createdAt: "2026-04-18T00:00:00.000Z",
					updatedAt: "2026-04-18T00:00:00.000Z",
				},
			],
			blobsByAudioId: {},
			settings: createEmptySettings(),
		};

		const { normalizedSnapshot } = await normalizeLoadedSnapshot(snapshot);

		expect(normalizedSnapshot.annotations).toEqual([
			expect.objectContaining({
				id: "annotation-point",
				color: "var(--color-marker-point)",
			}),
			expect.objectContaining({
				id: "annotation-range",
				color: "var(--color-marker-range)",
			}),
		]);
	});
});
