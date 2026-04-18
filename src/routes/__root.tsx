import {
	createRootRoute,
	HeadContent,
	ScriptOnce,
	Scripts,
} from "@tanstack/react-router";
import { SongModeChrome } from "#/components/song-mode/app-chrome";
import { SongModeDevtools } from "#/components/song-mode/song-mode-devtools";
import { THEME_STORAGE_KEY } from "#/lib/theme";
import { SongModeProvider } from "#/providers/song-mode-provider";
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
						<SongModeChrome>{children}</SongModeChrome>
						<SongModeDevtools />
					</SongModeProvider>
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
