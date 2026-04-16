export const THEME_STORAGE_KEY = "theme";

export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export function isTheme(value: string | null | undefined): value is Theme {
	return value === "light" || value === "dark";
}

export function getSystemTheme(windowObject: Window): Theme {
	return windowObject.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

export function resolveTheme(windowObject: Window): Theme {
	const storedTheme = windowObject.localStorage.getItem(THEME_STORAGE_KEY);
	return isTheme(storedTheme) ? storedTheme : getSystemTheme(windowObject);
}

export function applyTheme(theme: Theme, root: HTMLElement) {
	root.classList.remove(...THEMES);
	root.classList.add(theme);
}
