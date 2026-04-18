import { X } from "lucide-react";
import type {
	SongModeUiSettings,
	WaveformHeightPreset,
} from "#/lib/song-mode/types";

interface SongModeSettingsDialogProps {
	uiSettings: SongModeUiSettings;
	onClose: () => void;
	onUpdateUiSettings: (
		patch:
			| Partial<SongModeUiSettings>
			| ((current: SongModeUiSettings) => SongModeUiSettings),
	) => Promise<void>;
}

const WAVEFORM_OPTIONS: Array<{
	label: string;
	value: WaveformHeightPreset;
}> = [
	{ label: "Large", value: "large" },
	{ label: "Medium", value: "medium" },
	{ label: "Small", value: "small" },
];

export function SongModeSettingsDialog({
	uiSettings,
	onClose,
	onUpdateUiSettings,
}: SongModeSettingsDialogProps) {
	return (
		<div className="song-modal">
			<button
				type="button"
				aria-label="Dismiss settings dialog"
				onClick={onClose}
				className="song-modal__backdrop"
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="settings-title"
				className="song-modal__panel rise-in w-full max-w-[min(96rem,calc(100vw-2rem))]"
			>
				<div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4 sm:px-6">
					<div className="min-w-0">
						<h2
							id="settings-title"
							className="text-2xl font-semibold text-[var(--color-text)]"
						>
							Settings
						</h2>
					</div>
					<button
						type="button"
						aria-label="Close settings dialog"
						onClick={onClose}
						className="icon-button shrink-0"
					>
						<X size={16} />
					</button>
				</div>

				<div className="grid gap-8 p-5 sm:p-6">
					<section className="grid gap-4">
						<div>
							<p className="eyebrow mb-2">Appearance</p>
							<h3 className="text-lg font-semibold text-[var(--color-text)]">
								Accent colors
							</h3>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<ColorSettingField
								label="Light primary"
								value={uiSettings.accentLightPrimary}
								onChange={(value) =>
									void onUpdateUiSettings({ accentLightPrimary: value })
								}
							/>
							<ColorSettingField
								label="Light strong"
								value={uiSettings.accentLightStrong}
								onChange={(value) =>
									void onUpdateUiSettings({ accentLightStrong: value })
								}
							/>
							<ColorSettingField
								label="Dark primary"
								value={uiSettings.accentDarkPrimary}
								onChange={(value) =>
									void onUpdateUiSettings({ accentDarkPrimary: value })
								}
							/>
							<ColorSettingField
								label="Dark strong"
								value={uiSettings.accentDarkStrong}
								onChange={(value) =>
									void onUpdateUiSettings({ accentDarkStrong: value })
								}
							/>
						</div>
					</section>

					<section className="grid gap-4">
						<div>
							<p className="eyebrow mb-2">Workspace</p>
							<h3 className="text-lg font-semibold text-[var(--color-text)]">
								Waveform height
							</h3>
						</div>
						<div className="flex flex-wrap gap-2">
							{WAVEFORM_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									aria-pressed={uiSettings.waveformHeight === option.value}
									onClick={() =>
										void onUpdateUiSettings({
											waveformHeight: option.value,
										})
									}
									className={`inline-flex h-11 items-center justify-center px-4 text-sm font-semibold ${
										uiSettings.waveformHeight === option.value
											? "action-primary"
											: "action-secondary"
									}`}
								>
									{option.label}
								</button>
							))}
						</div>
					</section>

					<section className="grid gap-4">
						<div>
							<p className="eyebrow mb-2">Metadata</p>
							<h3 className="text-lg font-semibold text-[var(--color-text)]">
								Visible song fields
							</h3>
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							<ToggleSettingCard
								label="Artist"
								enabled={uiSettings.showArtist}
								onToggle={() =>
									void onUpdateUiSettings((current) => ({
										...current,
										showArtist: !current.showArtist,
									}))
								}
							/>
							<ToggleSettingCard
								label="Project"
								enabled={uiSettings.showProject}
								onToggle={() =>
									void onUpdateUiSettings((current) => ({
										...current,
										showProject: !current.showProject,
									}))
								}
							/>
						</div>
					</section>

					<section className="grid gap-4">
						<div>
							<p className="eyebrow mb-2">Accessibility</p>
							<h3 className="text-lg font-semibold text-[var(--color-text)]">
								Keyboard focus highlights
							</h3>
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							<ToggleSettingCard
								label="Show focus rings"
								enabled={uiSettings.keyboardFocusHighlights}
								detailWhenOn="Focused controls show a ring when using the keyboard."
								detailWhenOff="Keyboard focus rings are hidden; pointer use is unchanged."
								onToggle={() =>
									void onUpdateUiSettings((current) => ({
										...current,
										keyboardFocusHighlights: !current.keyboardFocusHighlights,
									}))
								}
							/>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}

function ColorSettingField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className="grid gap-2">
			<span className="field-label">{label}</span>
			<div className="field-input flex h-12 items-center gap-3 px-3 py-0">
				<input
					type="color"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					aria-label={label}
					className="h-7 w-9 shrink-0 cursor-pointer border-0 bg-transparent p-0"
				/>
				<span className="text-sm font-semibold uppercase text-[var(--color-text)]">
					{value}
				</span>
			</div>
		</label>
	);
}

function ToggleSettingCard({
	label,
	enabled,
	onToggle,
	detailWhenOn = "Visible across the UI",
	detailWhenOff = "Hidden until re-enabled",
}: {
	label: string;
	enabled: boolean;
	onToggle: () => void;
	detailWhenOn?: string;
	detailWhenOff?: string;
}) {
	return (
		<div className="border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] px-4 py-4">
			<div className="flex items-center justify-between gap-4">
				<div>
					<div className="text-sm font-semibold text-[var(--color-text)]">
						{label}
					</div>
					<div className="mt-1 text-sm text-[var(--color-text-muted)]">
						{enabled ? detailWhenOn : detailWhenOff}
					</div>
				</div>
				<button
					type="button"
					aria-pressed={enabled}
					onClick={onToggle}
					className={`inline-flex h-11 items-center justify-center px-4 text-sm font-semibold ${
						enabled ? "action-primary" : "action-secondary"
					}`}
				>
					{enabled ? "Shown" : "Hidden"}
				</button>
			</div>
		</div>
	);
}
