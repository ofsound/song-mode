// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	EMPTY_RICH_TEXT,
	plainTextToRichText,
} from "#/lib/song-mode/rich-text";
import { createEmptySettings } from "#/lib/song-mode/types";
import { SongModeProvider, useSongMode } from "./song-mode-provider";

const { loadSnapshotMock } = vi.hoisted(() => ({
	loadSnapshotMock: vi.fn(),
}));

vi.mock("#/lib/song-mode/db", () => ({
	loadSnapshot: loadSnapshotMock,
	saveAnnotation: vi.fn(),
	saveAudioBlob: vi.fn(),
	saveAudioFile: vi.fn(),
	saveSettings: vi.fn(),
	saveSong: vi.fn(),
	deleteAnnotation: vi.fn(),
}));

function Probe() {
	const { ready, audioFiles } = useSongMode();

	return (
		<div data-testid="provider-state">
			{ready ? JSON.stringify(audioFiles) : "loading"}
		</div>
	);
}

describe("SongModeProvider", () => {
	beforeEach(() => {
		loadSnapshotMock.mockReset();
	});

	afterEach(() => {
		cleanup();
	});

	it("hydrates older audio records without volumeDb as 0 dB", async () => {
		loadSnapshotMock.mockResolvedValue({
			songs: [],
			audioFiles: [
				{
					id: "file-1",
					songId: "song-1",
					title: "Legacy mix",
					notes: EMPTY_RICH_TEXT,
					durationMs: 180000,
					waveform: {
						peaks: [0.2, 0.6, 0.4],
						peakCount: 3,
						durationMs: 180000,
						sampleRate: 44100,
					},
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			annotations: [],
			blobsByAudioId: {},
			settings: createEmptySettings(),
		});

		render(
			<SongModeProvider>
				<Probe />
			</SongModeProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("provider-state").textContent).toContain(
				'"volumeDb":0',
			);
		});
	});

	it("merges legacy mastering notes into the remaining notes field on hydration", async () => {
		loadSnapshotMock.mockResolvedValue({
			songs: [],
			audioFiles: [
				{
					id: "file-1",
					songId: "song-1",
					title: "Legacy mix",
					notes: plainTextToRichText("Mix note"),
					masteringNote: plainTextToRichText("Mastering reminder"),
					durationMs: 180000,
					waveform: {
						peaks: [0.2, 0.6, 0.4],
						peakCount: 3,
						durationMs: 180000,
						sampleRate: 44100,
					},
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			annotations: [],
			blobsByAudioId: {},
			settings: createEmptySettings(),
		});

		render(
			<SongModeProvider>
				<Probe />
			</SongModeProvider>,
		);

		await waitFor(() => {
			const stateText = screen.getByTestId("provider-state").textContent ?? "";
			expect(stateText).toContain("Mix note");
			expect(stateText).toContain("Mastering reminder");
			expect(stateText).not.toContain("masteringNote");
		});
	});
});
