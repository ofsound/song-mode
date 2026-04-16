// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/song-mode/rich-text";
import type {
	AudioFileRecord,
	Song,
	SongRouteSearch,
	WorkspaceState,
} from "#/lib/song-mode/types";
import { SongRouteHeaderSlotContext } from "./app-chrome";
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
	RichTextEditor: ({ focusId }: { focusId?: string }) => (
		<div data-testid="rich-text-editor" data-song-mode-editor={focusId} />
	),
}));

vi.mock("./waveform-card", () => ({
	WaveformCard: ({
		audioFile,
		isSelected,
		onStepVolume,
	}: {
		audioFile: AudioFileRecord;
		isSelected: boolean;
		onStepVolume: (deltaDb: number) => Promise<void>;
	}) => (
		<div data-testid="waveform-card">
			<span>
				{audioFile.title}:{String(isSelected)}
			</span>
			<span>{audioFile.volumeDb} dB</span>
			<button
				type="button"
				onClick={() => void onStepVolume(-1)}
				disabled={audioFile.volumeDb <= -12}
			>
				-
			</button>
			<button
				type="button"
				onClick={() => void onStepVolume(1)}
				disabled={audioFile.volumeDb >= 12}
			>
				+
			</button>
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

function createAudioFile(
	overrides: Partial<AudioFileRecord> = {},
): AudioFileRecord {
	return {
		id: "file-1",
		songId: baseSong.id,
		title: "Mix v1",
		notes: EMPTY_RICH_TEXT,
		masteringNote: EMPTY_RICH_TEXT,
		volumeDb: 0,
		durationMs: 180000,
		waveform: {
			peaks: [0.2, 0.6, 0.4],
			peakCount: 3,
			durationMs: 180000,
			sampleRate: 44100,
		},
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

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
		updateAudioFile.mockReset();
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
		expect(screen.queryByText(/waveform stack/i)).toBeNull();
		expect(
			screen.queryByText(/Shift\+↑ \/ Shift\+↓ jumps markers/i),
		).toBeNull();

		currentAudioFiles = [createAudioFile()];
		currentBlobsByAudioId = {
			"file-1": new Blob(["tone"], { type: "audio/wav" }),
		};

		rerender(<SongWorkspace songId={baseSong.id} search={search} />);

		await waitFor(() => {
			expect(screen.getByTestId("waveform-card").textContent).toContain(
				"Mix v1:true",
			);
		});
		expect(screen.queryByText(/waveform stack/i)).toBeNull();
		expect(
			screen.queryByText(/Shift\+↑ \/ Shift\+↓ jumps markers/i),
		).toBeNull();

		await waitFor(() => {
			expect(updateWorkspaceStateMock).toHaveBeenCalledWith(baseSong.id, {
				selectedFileId: "file-1",
				activeAnnotationId: undefined,
			});
		});
	});

	it("steps file volume by 1 dB through the persisted audio update path", async () => {
		currentAudioFiles = [createAudioFile()];
		updateAudioFile.mockResolvedValue(undefined);

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		fireEvent.click(screen.getByRole("button", { name: "+" }));

		await waitFor(() => {
			expect(updateAudioFile).toHaveBeenCalledWith("file-1", {
				volumeDb: 1,
			});
		});
	});

	it("opens the upload form inside a modal when add audio is clicked", () => {
		currentAudioFiles = [createAudioFile()];

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

	it("renders only the journal label and editor without an outer journal shell", () => {
		currentAudioFiles = [createAudioFile()];

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		const journalFieldLabel = screen.getByText(/^journal$/i);
		const journalEditor = document.querySelector(
			'[data-song-mode-editor="journal"]',
		);
		const journalColumn = journalFieldLabel.parentElement?.parentElement;

		expect(screen.queryByText(/song journal/i)).toBeNull();
		expect(journalFieldLabel).toBeTruthy();
		expect(journalEditor).toBeTruthy();
		expect(journalEditor?.closest(".panel-shell")).toBeNull();
		expect(journalColumn?.className).toContain("h-[calc(100vh-4rem)]");
	});

	it("renders the song controls into the header slot when one is available", () => {
		currentAudioFiles = [createAudioFile()];

		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);

		const { container, unmount } = render(
			<SongRouteHeaderSlotContext.Provider
				value={{ enabled: true, slot: headerSlot }}
			>
				<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />
			</SongRouteHeaderSlotContext.Provider>,
		);

		expect(within(headerSlot).getByText(/song library/i)).toBeTruthy();
		expect(
			within(headerSlot).getByRole("button", { name: /add audio/i }),
		).toBeTruthy();
		expect(
			within(container.querySelector("main") as HTMLElement).queryByText(
				/song library/i,
			),
		).toBeNull();

		unmount();
		headerSlot.remove();
	});
});
