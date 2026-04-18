// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultUiSettings } from "#/lib/song-mode/types";
import { SongModeChrome } from "./app-chrome";

const navigateMock = vi.fn();
const updateUiSettingsMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a {...props}>{children}</a>
	),
	useMatchRoute: () => () => false,
	useNavigate: () => navigateMock,
}));

vi.mock("#/providers/song-mode-provider", () => ({
	useSongMode: () => ({
		ready: true,
		getSongById: () => undefined,
		settings: {
			ui: createDefaultUiSettings(),
		},
		updateUiSettings: updateUiSettingsMock,
	}),
}));

vi.mock("./global-search", () => ({
	GlobalSearch: () => <div data-testid="global-search" />,
}));

vi.mock("./theme-toggle", () => ({
	ThemeToggle: () => (
		<button type="button" aria-label="Switch to dark mode">
			theme
		</button>
	),
}));

describe("SongModeChrome", () => {
	it("renders the settings button before the theme toggle and opens the modal", () => {
		render(
			<SongModeChrome>
				<main>Library</main>
			</SongModeChrome>,
		);

		const settingsButton = screen.getByRole("button", {
			name: /open settings/i,
		});
		const themeButton = screen.getByRole("button", {
			name: /switch to dark mode/i,
		});

		expect(Array.from(settingsButton.parentElement?.children ?? [])).toEqual(
			expect.arrayContaining([settingsButton, themeButton]),
		);
		expect(settingsButton.nextElementSibling).toBe(themeButton);

		fireEvent.click(settingsButton);

		expect(screen.getByRole("dialog", { name: /settings/i })).toBeTruthy();
	});
});
