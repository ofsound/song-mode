import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	applyTheme,
	getSystemTheme,
	isTheme,
	THEME_STORAGE_KEY,
	type Theme,
} from "#/lib/theme";

interface ThemeContextValue {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readThemeFromDocument(): Theme {
	if (typeof document === "undefined") {
		return "light";
	}

	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(readThemeFromDocument);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const root = document.documentElement;
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
		const initialTheme = isTheme(storedTheme)
			? storedTheme
			: getSystemTheme(window);

		applyTheme(initialTheme, root);
		setThemeState(initialTheme);

		const handleChange = (event: MediaQueryListEvent) => {
			if (isTheme(window.localStorage.getItem(THEME_STORAGE_KEY))) {
				return;
			}

			const nextTheme = event.matches ? "dark" : "light";
			applyTheme(nextTheme, root);
			setThemeState(nextTheme);
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => {
			mediaQuery.removeEventListener("change", handleChange);
		};
	}, []);

	const setTheme = useCallback((nextTheme: Theme) => {
		if (typeof window === "undefined") {
			return;
		}

		window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
		applyTheme(nextTheme, document.documentElement);
		setThemeState(nextTheme);
	}, []);

	const toggleTheme = useCallback(() => {
		setTheme(theme === "dark" ? "light" : "dark");
	}, [setTheme, theme]);

	const value = useMemo(
		() => ({
			theme,
			setTheme,
			toggleTheme,
		}),
		[setTheme, theme, toggleTheme],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used inside ThemeProvider.");
	}

	return context;
}
