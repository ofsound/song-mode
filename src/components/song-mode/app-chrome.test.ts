import { describe, expect, it } from "vitest";
import { getSongModeHeaderState } from "./app-chrome";

describe("getSongModeHeaderState", () => {
	it("shows the library title without the library button on the home route", () => {
		expect(
			getSongModeHeaderState({
				ready: true,
			}),
		).toEqual({
			title: "Library",
			showLibraryLink: false,
		});
	});

	it("shows the current song title and the library button on a song route", () => {
		expect(
			getSongModeHeaderState({
				songId: "song-1",
				ready: true,
				songTitle: "Midnight Choir",
			}),
		).toEqual({
			title: "Midnight Choir",
			showLibraryLink: true,
		});
	});

	it("reflects song title updates on song routes", () => {
		expect(
			getSongModeHeaderState({
				songId: "song-1",
				ready: true,
				songTitle: "Midnight Choir",
			}).title,
		).toBe("Midnight Choir");

		expect(
			getSongModeHeaderState({
				songId: "song-1",
				ready: true,
				songTitle: "Midnight Choir (Alt Mix)",
			}).title,
		).toBe("Midnight Choir (Alt Mix)");
	});
});
