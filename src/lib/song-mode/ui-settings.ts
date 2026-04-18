import {
	normalizeUiSettings,
	type SongModeUiSettings,
	type WaveformHeightPreset,
} from "./types";

export const UI_SETTINGS_STORAGE_KEY = "song-mode-ui-settings";

const WAVEFORM_HEIGHT_PX_BY_PRESET: Record<WaveformHeightPreset, number> = {
	large: 164,
	medium: 128,
	small: 92,
};

export function getWaveformHeightPx(preset: WaveformHeightPreset): number {
	return WAVEFORM_HEIGHT_PX_BY_PRESET[preset];
}

export function applyUiSettingsToRoot(
	uiSettings: SongModeUiSettings,
	root: HTMLElement,
) {
	root.style.setProperty(
		"--accent-light-primary-base",
		uiSettings.accentLightPrimary,
	);
	root.style.setProperty(
		"--accent-light-strong-base",
		uiSettings.accentLightStrong,
	);
	root.style.setProperty(
		"--accent-dark-primary-base",
		uiSettings.accentDarkPrimary,
	);
	root.style.setProperty(
		"--accent-dark-strong-base",
		uiSettings.accentDarkStrong,
	);
	root.style.setProperty(
		"--song-workspace-waveform-height",
		`${getWaveformHeightPx(uiSettings.waveformHeight)}px`,
	);
	if (uiSettings.keyboardFocusHighlights) {
		root.removeAttribute("data-reduce-keyboard-focus");
	} else {
		root.setAttribute("data-reduce-keyboard-focus", "");
	}
}

export function readUiSettingsFromStorage(
	windowObject: Window,
): SongModeUiSettings | null {
	const storedValue = windowObject.localStorage.getItem(
		UI_SETTINGS_STORAGE_KEY,
	);
	if (!storedValue) {
		return null;
	}

	try {
		const parsedValue = JSON.parse(
			storedValue,
		) as Partial<SongModeUiSettings> | null;
		return normalizeUiSettings(parsedValue);
	} catch {
		return null;
	}
}

export function writeUiSettingsToStorage(
	windowObject: Window,
	uiSettings: SongModeUiSettings,
) {
	windowObject.localStorage.setItem(
		UI_SETTINGS_STORAGE_KEY,
		JSON.stringify(uiSettings),
	);
}
