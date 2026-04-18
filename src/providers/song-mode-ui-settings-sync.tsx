import { useEffect } from "react";
import {
	applyUiSettingsToRoot,
	writeUiSettingsToStorage,
} from "#/lib/song-mode/ui-settings";
import { useSongMode } from "./song-mode-provider";

export function SongModeUiSettingsSync() {
	const { ready, settings } = useSongMode();

	useEffect(() => {
		if (!ready || typeof window === "undefined") {
			return;
		}

		applyUiSettingsToRoot(settings.ui, document.documentElement);
		writeUiSettingsToStorage(window, settings.ui);
	}, [ready, settings.ui]);

	return null;
}
