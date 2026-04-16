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
		currentTimeMs,
		onStepVolume,
		onSelectFile,
	}: {
		audioFile: AudioFileRecord;
		isSelected: boolean;
		currentTimeMs: number;
		onStepVolume: (deltaDb: number) => Promise<void>;
		onSelectFile: (fileId: string) => void;
	}) => (
		<div data-testid="waveform-card" data-file-id={audioFile.id}>
			<span>
				{audioFile.title}:{String(isSelected)}
			</span>
			<span>{currentTimeMs} ms</span>
			<span>{audioFile.volumeDb} dB</span>
			<button
				type="button"
				aria-label={`Select ${audioFile.id}`}
				onClick={() => onSelectFile(audioFile.id)}
			>
				Select file
			</button>
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
let currentPlayback = {
	activeFileId: undefined as string | undefined,
	isPlaying: false,
	currentTimeByFileId: {} as Record<string, number>,
};

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
		playback: currentPlayback,
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
		currentPlayback = {
			activeFileId: undefined,
			isPlaying: false,
			currentTimeByFileId: {},
		};
		navigateMock.mockReset();
		updateWorkspaceStateMock.mockReset();
		updateWorkspaceStateMock.mockResolvedValue(undefined);
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

	it("does not reset selection to a stale ?fileId= when picking another waveform", async () => {
		const search: SongRouteSearch = {
			fileId: "file-1",
			autoplay: false,
		};
		currentAudioFiles = [
			createAudioFile({ id: "file-1", title: "Mix A" }),
			createAudioFile({ id: "file-2", title: "Mix B" }),
		];
		currentBlobsByAudioId = {
			"file-1": new Blob(["a"]),
			"file-2": new Blob(["b"]),
		};

		let rerenderWorkspace: null | (() => void) = null;
		updateWorkspaceStateMock.mockImplementation((_songId, patch) => {
			currentWorkspace =
				typeof patch === "function"
					? patch(currentWorkspace as WorkspaceState)
					: { ...currentWorkspace, ...patch };
			rerenderWorkspace?.();
			return Promise.resolve();
		});

		const { rerender } = render(
			<SongWorkspace songId={baseSong.id} search={search} />,
		);
		rerenderWorkspace = () =>
			rerender(<SongWorkspace songId={baseSong.id} search={search} />);
		rerenderWorkspace();

		await waitFor(() => {
			expect(updateWorkspaceStateMock).toHaveBeenCalledWith(
				baseSong.id,
				expect.objectContaining({ selectedFileId: "file-1" }),
			);
		});

		updateWorkspaceStateMock.mockClear();
		navigateMock.mockClear();

		fireEvent.click(screen.getByRole("button", { name: "Select file-2" }));

		await waitFor(() => {
			expect(screen.getByText("Mix B:true")).toBeTruthy();
			expect(screen.getByText("Mix A:false")).toBeTruthy();
		});

		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalled();
		});
		const navigateArg = navigateMock.mock.calls.find(
			(call) =>
				call[0] &&
				typeof call[0] === "object" &&
				"search" in call[0] &&
				typeof (call[0] as { search?: unknown }).search === "function",
		)?.[0] as {
			replace?: boolean;
			search: (prev: SongRouteSearch) => SongRouteSearch;
		};
		expect(navigateArg?.replace).toBe(true);
		const nextSearch = navigateArg.search(search);
		expect(nextSearch.fileId).toBe("file-2");
		expect(nextSearch.annotationId).toBeUndefined();
		expect(nextSearch.timeMs).toBeUndefined();
		expect(nextSearch.autoplay).toBe(false);

		const objectPatches = updateWorkspaceStateMock.mock.calls
			.map((call) => call[1])
			.filter(
				(patch): patch is { selectedFileId?: string } =>
					typeof patch === "object" &&
					patch !== null &&
					"selectedFileId" in patch,
			);
		expect(
			objectPatches.some((patch) => patch.selectedFileId === "file-1"),
		).toBe(false);
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

	it("keeps a zero live playhead instead of falling back to workspace playhead", () => {
		currentAudioFiles = [createAudioFile()];
		currentWorkspace = {
			playheadMsByFileId: {
				"file-1": 45000,
			},
			inspectorRatio: 0.56,
			lastVisitedAt: null,
		};
		currentPlayback = {
			activeFileId: "file-1",
			isPlaying: false,
			currentTimeByFileId: {
				"file-1": 0,
			},
		};

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		expect(screen.getByText("0 ms")).toBeTruthy();
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

	it("renders the journal editor without an outer journal shell", () => {
		currentAudioFiles = [createAudioFile()];

		render(<SongWorkspace songId={baseSong.id} search={{ autoplay: false }} />);

		const journalEditor = document.querySelector(
			'[data-song-mode-editor="journal"]',
		);
		const journalColumn = journalEditor?.parentElement?.parentElement;

		expect(screen.queryByText(/song journal/i)).toBeNull();
		expect(journalEditor).toBeTruthy();
		expect(journalEditor?.closest(".panel-shell")).toBeNull();
		expect(journalColumn?.className).toContain("xl:min-h-0");
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

		expect(within(headerSlot).getByText(/^song title$/i)).toBeTruthy();
		expect(
			within(headerSlot).getByRole("button", { name: /add audio/i }),
		).toBeTruthy();
		expect(
			within(container.querySelector("main") as HTMLElement).queryByRole(
				"button",
				{ name: /add audio/i },
			),
		).toBeNull();

		unmount();
		headerSlot.remove();
	});
});
