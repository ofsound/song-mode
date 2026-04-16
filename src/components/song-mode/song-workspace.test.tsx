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
import type {
	AudioFileRecord,
	Song,
	SongRouteSearch,
	WorkspaceState,
} from "#/lib/song-mode/types";
import { SongWorkspace } from "./song-workspace";

const navigateMock = vi.fn();
const updateWorkspaceStateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a {...props}>{children}</a>
	),
	useNavigate: () => navigateMock,
}));

vi.mock("./inspector-pane", () => ({
	InspectorPane: () => <div data-testid="inspector-pane" />,
}));

vi.mock("./rich-text-editor", () => ({
	RichTextEditor: () => <div data-testid="rich-text-editor" />,
}));

vi.mock("./waveform-card", () => ({
	WaveformCard: ({
		audioFile,
		isSelected,
	}: {
		audioFile: AudioFileRecord;
		isSelected: boolean;
	}) => (
		<div data-testid="waveform-card">
			{audioFile.title}:{String(isSelected)}
		</div>
	),
}));

const baseSong: Song = {
	id: "song-1",
	title: "Reload Test",
	artist: "Tester",
	project: "Album",
	generalNotes: EMPTY_RICH_TEXT,
	audioFileOrder: [],
	createdAt: "2026-04-16T00:00:00.000Z",
	updatedAt: "2026-04-16T00:00:00.000Z",
};

let currentAudioFiles: AudioFileRecord[] = [];
let currentWorkspace: WorkspaceState = {
	playheadMsByFileId: {},
	inspectorRatio: 0.56,
	lastVisitedAt: null,
};
let currentBlobsByAudioId: Record<string, Blob> = {};

const getSongById = vi.fn((songId: string) =>
	songId === baseSong.id
		? {
				...baseSong,
				audioFileOrder: currentAudioFiles.map((audioFile) => audioFile.id),
			}
		: undefined,
);
const getSongAudioFiles = vi.fn((songId: string) =>
	songId === baseSong.id ? currentAudioFiles : [],
);
const getAnnotationsForFile = vi.fn(() => []);
const getWorkspaceState = vi.fn(() => currentWorkspace);
const addAudioFile = vi.fn();
const createAnnotation = vi.fn();
const deleteAnnotation = vi.fn();
const jumpBetweenAnnotations = vi.fn();
const registerAudioElement = vi.fn();
const rememberSongOpened = vi.fn().mockResolvedValue(undefined);
const reorderAudioFiles = vi.fn();
const reportPlaybackState = vi.fn();
const seekActiveBy = vi.fn();
const seekFile = vi.fn();
const togglePlayback = vi.fn();
const updateAnnotation = vi.fn();
const updateAudioFile = vi.fn();
const updateSong = vi.fn();

vi.mock("#/providers/song-mode-provider", () => ({
	useSongMode: () => ({
		ready: true,
		getSongById,
		getSongAudioFiles,
		getAnnotationsForFile,
		getWorkspaceState,
		blobsByAudioId: currentBlobsByAudioId,
		playback: {
			activeFileId: undefined,
			isPlaying: false,
			currentTimeByFileId: {},
		},
		rememberSongOpened,
		updateSong,
		addAudioFile,
		updateAudioFile,
		reorderAudioFiles,
		createAnnotation,
		updateAnnotation,
		deleteAnnotation,
		updateWorkspaceState: updateWorkspaceStateMock,
		registerAudioElement,
		reportPlaybackState,
		togglePlayback,
		seekFile,
		seekActiveBy,
		jumpBetweenAnnotations,
	}),
}));

describe("SongWorkspace", () => {
	beforeEach(() => {
		currentAudioFiles = [];
		currentWorkspace = {
			playheadMsByFileId: {},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		};
		currentBlobsByAudioId = {};
		navigateMock.mockReset();
		updateWorkspaceStateMock.mockClear();
		getSongById.mockClear();
		getSongAudioFiles.mockClear();
		getAnnotationsForFile.mockClear();
		getWorkspaceState.mockClear();
		rememberSongOpened.mockClear();
		Element.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllTimers();
	});

	it("shows uploaded audio after hydration and selects the first file", async () => {
		const search: SongRouteSearch = {
			autoplay: false,
		};

		const { rerender } = render(
			<SongWorkspace songId={baseSong.id} search={search} />,
		);

		expect(
			screen.getByText(/Add audio to start the stacked waveform review/i),
		).toBeTruthy();

		currentAudioFiles = [
			{
				id: "file-1",
				songId: baseSong.id,
				title: "Mix v1",
				notes: EMPTY_RICH_TEXT,
				masteringNote: EMPTY_RICH_TEXT,
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
		];
		currentBlobsByAudioId = {
			"file-1": new Blob(["tone"], { type: "audio/wav" }),
		};

		rerender(<SongWorkspace songId={baseSong.id} search={search} />);

		await waitFor(() => {
			expect(screen.getByTestId("waveform-card").textContent).toContain(
				"Mix v1:true",
			);
		});

		await waitFor(() => {
			expect(updateWorkspaceStateMock).toHaveBeenCalledWith(baseSong.id, {
				selectedFileId: "file-1",
				activeAnnotationId: undefined,
			});
		});
	});

	it("opens the upload form inside a modal when add audio is clicked", () => {
		currentAudioFiles = [
			{
				id: "file-1",
				songId: baseSong.id,
				title: "Mix v1",
				notes: EMPTY_RICH_TEXT,
				masteringNote: EMPTY_RICH_TEXT,
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
		];

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		expect(screen.queryByRole("dialog")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /add audio/i }));

		expect(
			screen.getByRole("dialog", {
				name: /add audio/i,
			}),
		).toBeTruthy();
		expect(screen.getByLabelText(/audio file/i)).toBeTruthy();
		expect(screen.getByPlaceholderText(/context for this file/i)).toBeTruthy();
	});
});
