import {
	createRootRoute,
	HeadContent,
	ScriptOnce,
	Scripts,
} from "@tanstack/react-router";
import { SongModeChrome } from "#/components/song-mode/app-chrome";
import { SongModeDevtools } from "#/components/song-mode/song-mode-devtools";
import { UI_SETTINGS_STORAGE_KEY } from "#/lib/song-mode/ui-settings";
import { THEME_STORAGE_KEY } from "#/lib/theme";
import { SongModeProvider } from "#/providers/song-mode-provider";
import { SongModeUiSettingsSync } from "#/providers/song-mode-ui-settings-sync";
import { ThemeProvider } from "#/providers/theme-provider";

import appCss from "#/styles.css?url";

const themeBootstrapScript = `(() => {
	try {
		const storedTheme = window.localStorage.getItem("${THEME_STORAGE_KEY}");
		const resolvedTheme =
			storedTheme === "light" || storedTheme === "dark"
				? storedTheme
				: window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light";
		document.documentElement.classList.remove("light", "dark");
		document.documentElement.classList.add(resolvedTheme);

		const storedUiSettings = window.localStorage.getItem("${UI_SETTINGS_STORAGE_KEY}");
		if (!storedUiSettings) {
			return;
		}

		const uiSettings = JSON.parse(storedUiSettings);
		if (!uiSettings || typeof uiSettings !== "object") {
			return;
		}

		const applySetting = (name, value) => {
			if (typeof value === "string" && value.trim().length > 0) {
				document.documentElement.style.setProperty(name, value);
			}
		};

		applySetting("--accent-light-primary-base", uiSettings.accentLightPrimary);
		applySetting("--accent-light-strong-base", uiSettings.accentLightStrong);
		applySetting("--accent-dark-primary-base", uiSettings.accentDarkPrimary);
		applySetting("--accent-dark-strong-base", uiSettings.accentDarkStrong);
		document.documentElement.style.setProperty(
			"--song-workspace-waveform-height",
			uiSettings.waveformHeight === "medium"
				? "128px"
				: uiSettings.waveformHeight === "small"
					? "92px"
					: "164px",
		);

		if (uiSettings.keyboardFocusHighlights === false) {
			document.documentElement.setAttribute("data-reduce-keyboard-focus", "");
		} else {
			document.documentElement.removeAttribute("data-reduce-keyboard-focus");
		}
	} catch {}
})()`;

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Song Mode",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
				<ScriptOnce>{themeBootstrapScript}</ScriptOnce>
			</head>
			<body>
				<ThemeProvider>
					<SongModeProvider>
						<SongModeUiSettingsSync />
						<SongModeChrome>{children}</SongModeChrome>
						<SongModeDevtools />
					</SongModeProvider>
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
