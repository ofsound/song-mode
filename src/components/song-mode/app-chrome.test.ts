import { describe, expect, it } from "vitest";
import { getSongModeHeaderState } from "./app-chrome";

describe("getSongModeHeaderState", () => {
	it("hides the library button on the home route", () => {
		expect(
			getSongModeHeaderState({
				ready: true,
			}),
		).toEqual({
			showLibraryLink: false,
		});
	});

	it("shows the library button on a song route", () => {
		expect(
			getSongModeHeaderState({
				songId: "song-1",
				ready: true,
				songTitle: "Midnight Choir",
			}),
		).toEqual({
			showLibraryLink: true,
		});
	});

	it("shows the library button while loading a song route", () => {
		expect(
			getSongModeHeaderState({
				songId: "song-1",
				ready: false,
			}),
		).toEqual({
			showLibraryLink: true,
		});
	});
});
