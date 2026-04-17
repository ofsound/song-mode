// @vitest-environment jsdom

import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/song-mode/rich-text";
import type { Annotation, AudioFileRecord, Song } from "#/lib/song-mode/types";
import { LibraryHeaderActionSlotContext } from "./app-chrome";
import { LibraryView } from "./library-view";

const navigateMock = vi.fn();
const createSongMock = vi.fn();
const deleteSongMock = vi.fn();
let songs: Song[] = [];
let audioFiles: AudioFileRecord[] = [];
let annotations: Annotation[] = [];

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

vi.mock("#/providers/song-mode-provider", () => ({
	useSongMode: () => ({
		ready: true,
		error: null,
		songs,
		audioFiles,
		annotations,
		settings: {
			recents: [],
			workspaceBySongId: {},
		},
		createSong: createSongMock,
		deleteSong: deleteSongMock,
	}),
}));

function makeSong(id: string): Song {
	return {
		id,
		title: "New Song",
		artist: "New Artist",
		project: "New Project",
		generalNotes: EMPTY_RICH_TEXT,
		audioFileOrder: [],
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
	};
}

describe("LibraryView", () => {
	beforeEach(() => {
		navigateMock.mockReset();
		createSongMock.mockReset();
		deleteSongMock.mockReset();
		createSongMock.mockResolvedValue(makeSong("song-2"));
		songs = [];
		audioFiles = [];
		annotations = [];
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("renders create song as a header action and opens the modal on click", () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);

		render(
			<LibraryHeaderActionSlotContext.Provider
				value={{ enabled: true, slot: headerSlot }}
			>
				<LibraryView />
			</LibraryHeaderActionSlotContext.Provider>,
		);

		expect(screen.queryByRole("dialog", { name: /create song/i })).toBeNull();
		expect(screen.queryByLabelText(/song title/i)).toBeNull();
		expect(
			within(headerSlot).getByRole("button", { name: /create song/i }),
		).toBeTruthy();

		fireEvent.click(
			within(headerSlot).getByRole("button", { name: /create song/i }),
		);

		expect(
			screen.getByRole("dialog", {
				name: /create song/i,
			}),
		).toBeTruthy();
		expect(screen.getByLabelText(/song title/i)).toBeTruthy();
		expect(screen.getByLabelText(/^artist$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^project$/i)).toBeTruthy();
	});

	it("submits the modal form and navigates to the created song", async () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);

		render(
			<LibraryHeaderActionSlotContext.Provider
				value={{ enabled: true, slot: headerSlot }}
			>
				<LibraryView />
			</LibraryHeaderActionSlotContext.Provider>,
		);

		fireEvent.click(
			within(headerSlot).getByRole("button", { name: /create song/i }),
		);

		fireEvent.change(screen.getByLabelText(/song title/i), {
			target: { value: "Midnight Choir" },
		});
		fireEvent.change(screen.getByLabelText(/^artist$/i), {
			target: { value: "Ada" },
		});
		fireEvent.change(screen.getByLabelText(/^project$/i), {
			target: { value: "LP1" },
		});
		const createSongDialog = screen.getByRole("dialog", {
			name: /create song/i,
		});
		fireEvent.click(
			within(createSongDialog).getByRole("button", { name: /^create song$/i }),
		);

		await waitFor(() => {
			expect(createSongMock).toHaveBeenCalledWith({
				title: "Midnight Choir",
				artist: "Ada",
				project: "LP1",
				generalNotes: EMPTY_RICH_TEXT,
			});
		});
		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				to: "/songs/$songId",
				params: {
					songId: "song-2",
				},
			});
		});
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: /create song/i })).toBeNull();
		});
	});

	it("confirms before deleting a song from the library card row", async () => {
		const headerSlot = document.createElement("div");
		document.body.appendChild(headerSlot);
		songs = [makeSong("song-1")];
		audioFiles = [
			{
				id: "audio-1",
				songId: "song-1",
				title: "Mix A",
				notes: EMPTY_RICH_TEXT,
				volumeDb: 0,
				durationMs: 180000,
				waveform: {
					peaks: [0.1, 0.4, 0.2],
					peakCount: 3,
					durationMs: 180000,
					sampleRate: 44100,
				},
				createdAt: "2026-04-16T00:00:00.000Z",
				updatedAt: "2026-04-16T00:00:00.000Z",
			},
		];
		annotations = [
			{
				id: "annotation-1",
				songId: "song-1",
				audioFileId: "audio-1",
				type: "point",
				startMs: 1000,
				title: "Downbeat",
				body: EMPTY_RICH_TEXT,
				createdAt: "2026-04-16T00:00:00.000Z",
				updatedAt: "2026-04-16T00:00:00.000Z",
			},
		];
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

		render(
			<LibraryHeaderActionSlotContext.Provider
				value={{ enabled: true, slot: headerSlot }}
			>
				<LibraryView />
			</LibraryHeaderActionSlotContext.Provider>,
		);

		fireEvent.click(screen.getByRole("button", { name: /delete new song/i }));
		expect(confirmSpy).toHaveBeenCalledWith("Delete this song?");
		expect(deleteSongMock).not.toHaveBeenCalled();

		confirmSpy.mockReturnValue(true);
		fireEvent.click(screen.getByRole("button", { name: /delete new song/i }));

		await waitFor(() => {
			expect(deleteSongMock).toHaveBeenCalledWith("song-1");
		});
	});
});
