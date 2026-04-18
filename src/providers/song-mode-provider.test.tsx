// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/song-mode/rich-text";
import { createEmptySettings } from "#/lib/song-mode/types";
import { SongModeProvider, useSongMode } from "./song-mode-provider";

const {
	deleteAnnotationMock,
	deleteAudioBlobMock,
	deleteAudioFileMock,
	deleteSongMock,
	loadSnapshotMock,
	saveAnnotationMock,
	saveAudioBlobMock,
	saveAudioFileMock,
	saveSettingsMock,
	saveSongMock,
} = vi.hoisted(() => ({
	deleteAnnotationMock: vi.fn(),
	deleteAudioBlobMock: vi.fn(),
	deleteAudioFileMock: vi.fn(),
	deleteSongMock: vi.fn(),
	loadSnapshotMock: vi.fn(),
	saveAnnotationMock: vi.fn(),
	saveAudioBlobMock: vi.fn(),
	saveAudioFileMock: vi.fn(),
	saveSettingsMock: vi.fn(),
	saveSongMock: vi.fn(),
}));

vi.mock("#/lib/song-mode/db", () => ({
	loadSnapshot: loadSnapshotMock,
	deleteAnnotation: deleteAnnotationMock,
	deleteAudioBlob: deleteAudioBlobMock,
	deleteAudioFile: deleteAudioFileMock,
	deleteSong: deleteSongMock,
	saveAnnotation: saveAnnotationMock,
	saveAudioBlob: saveAudioBlobMock,
	saveAudioFile: saveAudioFileMock,
	saveSettings: saveSettingsMock,
	saveSong: saveSongMock,
}));

function Probe() {
	const { ready, audioFiles } = useSongMode();

	return (
		<div data-testid="provider-state">
			{ready ? JSON.stringify(audioFiles) : "loading"}
		</div>
	);
}

function MutationProbe() {
	const {
		ready,
		getSongById,
		getWorkspaceState,
		updateSong,
		updateWorkspaceState,
	} = useSongMode();
	const song = getSongById("song-1");
	const workspace = getWorkspaceState("song-1");

	return (
		<div>
			<div data-testid="mutation-state">
				{ready
					? JSON.stringify({
							title: song?.title,
							playheadMs: workspace.playheadMsByFileId["file-2"] ?? null,
						})
					: "loading"}
			</div>
			<button
				type="button"
				onClick={() => void updateSong("song-1", { title: "Updated title" })}
			>
				Update song
			</button>
			<button
				type="button"
				onClick={() =>
					void updateWorkspaceState("song-1", (current) => ({
						...current,
						playheadMsByFileId: {
							...current.playheadMsByFileId,
							"file-2": 123000,
						},
					}))
				}
			>
				Update workspace
			</button>
		</div>
	);
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((nextResolve) => {
		resolve = nextResolve;
	});

	return { promise, resolve };
}

describe("SongModeProvider", () => {
	beforeEach(() => {
		loadSnapshotMock.mockReset();
		deleteAnnotationMock.mockReset();
		deleteAudioBlobMock.mockReset();
		deleteAudioFileMock.mockReset();
		deleteSongMock.mockReset();
		saveAnnotationMock.mockReset();
		saveAudioBlobMock.mockReset();
		saveAudioFileMock.mockReset();
		saveSettingsMock.mockReset();
		saveSongMock.mockReset();
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

	it("keeps overlapping mutations merged while persistence finishes in order", async () => {
		const saveSongDeferred = createDeferred();
		loadSnapshotMock.mockResolvedValue({
			songs: [
				{
					id: "song-1",
					title: "Initial title",
					artist: "Tester",
					project: "Album",
					generalNotes: EMPTY_RICH_TEXT,
					audioFileOrder: [],
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
			audioFiles: [],
			annotations: [],
			blobsByAudioId: {},
			settings: {
				recents: [],
				workspaceBySongId: {
					"song-1": {
						playheadMsByFileId: {},
						inspectorRatio: 0.56,
						lastVisitedAt: null,
					},
				},
			},
		});
		saveSongMock.mockImplementation(() => saveSongDeferred.promise);
		saveSettingsMock.mockResolvedValue(undefined);

		render(
			<SongModeProvider>
				<MutationProbe />
			</SongModeProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("mutation-state").textContent).toContain(
				"Initial title",
			);
		});

		fireEvent.click(screen.getByRole("button", { name: "Update song" }));

		await waitFor(() => {
			expect(screen.getByTestId("mutation-state").textContent).toContain(
				"Updated title",
			);
		});

		fireEvent.click(screen.getByRole("button", { name: "Update workspace" }));

		await waitFor(() => {
			expect(screen.getByTestId("mutation-state").textContent).toContain(
				'"playheadMs":123000',
			);
		});

		expect(saveSettingsMock).not.toHaveBeenCalled();

		saveSongDeferred.resolve();

		await waitFor(() => {
			expect(saveSongMock).toHaveBeenCalledTimes(1);
			expect(saveSettingsMock).toHaveBeenCalledTimes(1);
		});

		expect(screen.getByTestId("mutation-state").textContent).toContain(
			'"title":"Updated title"',
		);
		expect(screen.getByTestId("mutation-state").textContent).toContain(
			'"playheadMs":123000',
		);
	});
});
