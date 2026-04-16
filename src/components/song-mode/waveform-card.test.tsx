// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/song-mode/rich-text";
import type {
	Annotation,
	AudioFileRecord,
	CreateAnnotationInput,
} from "#/lib/song-mode/types";
import { WaveformCard } from "./waveform-card";

vi.mock("#/providers/theme-provider", () => ({
	useTheme: () => ({
		theme: "light",
	}),
}));

const createObjectURLMock = vi.fn(() => "blob:waveform-card-test");
const revokeObjectURLMock = vi.fn();

class MockAudioContext {
	static instances: MockAudioContext[] = [];

	public readonly destination = {};
	public readonly sourceNode = {
		connect: vi.fn(),
		disconnect: vi.fn(),
	};
	public readonly gainNode = {
		connect: vi.fn(),
		disconnect: vi.fn(),
		gain: {
			value: 0,
		},
	};
	public state: AudioContextState = "running";
	public close = vi.fn().mockResolvedValue(undefined);
	public resume = vi.fn().mockResolvedValue(undefined);

	constructor() {
		MockAudioContext.instances.push(this);
	}

	createMediaElementSource() {
		return this.sourceNode;
	}

	createGain() {
		return this.gainNode;
	}
}

function createAudioFile(
	overrides: Partial<AudioFileRecord> = {},
): AudioFileRecord {
	return {
		id: "file-1",
		songId: "song-1",
		title: "Mix v1",
		notes: EMPTY_RICH_TEXT,
		masteringNote: EMPTY_RICH_TEXT,
		volumeDb: 0,
		durationMs: 180000,
		waveform: {
			peaks: [0.2, 0.6, 0.4],
			peakCount: 3,
			durationMs: 180000,
			sampleRate: 44100,
		},
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt: "2026-04-16T00:00:00.000Z",
		...overrides,
	};
}

function renderWaveformCard({
	audioFile = createAudioFile(),
	annotations = [],
	isPlaying = false,
	onSeek = vi.fn().mockResolvedValue(undefined),
	onSelectFile = vi.fn(),
	onStepVolume = vi.fn().mockResolvedValue(undefined),
}: {
	audioFile?: AudioFileRecord;
	annotations?: Annotation[];
	isPlaying?: boolean;
	onSeek?: (timeMs: number, autoplay?: boolean) => Promise<void>;
	onSelectFile?: (fileId: string) => void;
	onStepVolume?: (deltaDb: number) => Promise<void>;
} = {}) {
	return render(
		<WaveformCard
			audioFile={audioFile}
			annotations={annotations}
			blob={new Blob(["tone"], { type: "audio/wav" })}
			currentTimeMs={0}
			isPlaying={isPlaying}
			isSelected
			onSelectFile={onSelectFile}
			onSelectAnnotation={vi.fn()}
			onCreateAnnotation={vi.fn(
				async (input: Omit<CreateAnnotationInput, "songId" | "audioFileId">) =>
					({
						id: "annotation-1",
						songId: "song-1",
						audioFileId: "file-1",
						createdAt: "2026-04-16T00:00:00.000Z",
						updatedAt: "2026-04-16T00:00:00.000Z",
						...input,
					}) as Annotation,
			)}
			onSeek={onSeek}
			onTogglePlayback={vi.fn().mockResolvedValue(undefined)}
			onRegisterAudioElement={vi.fn()}
			onReportPlayback={vi.fn()}
			onStepVolume={onStepVolume}
			onDragStart={vi.fn()}
			onDragEnd={vi.fn()}
			onDrop={vi.fn()}
		/>,
	);
}

function mockWaveformBounds(
	element: HTMLElement,
	{ left = 0, width = 200 }: { left?: number; width?: number } = {},
) {
	Object.defineProperty(element, "getBoundingClientRect", {
		configurable: true,
		value: () => ({
			left,
			top: 0,
			right: left + width,
			bottom: 164,
			width,
			height: 164,
			x: left,
			y: 0,
			toJSON: () => ({}),
		}),
	});
}

describe("WaveformCard", () => {
	beforeEach(() => {
		MockAudioContext.instances = [];
		vi.stubGlobal("AudioContext", MockAudioContext);
		vi.stubGlobal("webkitAudioContext", MockAudioContext);
		vi.stubGlobal(
			"ResizeObserver",
			class {
				disconnect() {}
				observe() {}
				unobserve() {}
			},
		);
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: createObjectURLMock,
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			value: revokeObjectURLMock,
		});
		createObjectURLMock.mockClear();
		revokeObjectURLMock.mockClear();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("shows the volume stepper and disables buttons at the configured bounds", async () => {
		const onStepVolume = vi.fn().mockResolvedValue(undefined);
		const { rerender } = renderWaveformCard({
			audioFile: createAudioFile({ volumeDb: 12 }),
			onStepVolume,
		});
		const decreaseButton = screen.getByRole("button", {
			name: /decrease volume for mix v1/i,
		}) as HTMLButtonElement;
		const increaseButton = screen.getByRole("button", {
			name: /increase volume for mix v1/i,
		}) as HTMLButtonElement;

		expect(screen.getByText("+12 dB")).toBeTruthy();
		expect(decreaseButton.disabled).toBe(false);
		expect(increaseButton.disabled).toBe(true);

		fireEvent.click(decreaseButton);

		await waitFor(() => {
			expect(onStepVolume).toHaveBeenCalledWith(-1);
		});

		rerender(
			<WaveformCard
				audioFile={createAudioFile({ volumeDb: -12 })}
				annotations={[]}
				blob={new Blob(["tone"], { type: "audio/wav" })}
				currentTimeMs={0}
				isPlaying={false}
				isSelected
				onSelectFile={vi.fn()}
				onSelectAnnotation={vi.fn()}
				onCreateAnnotation={vi.fn().mockResolvedValue({
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 0,
					title: "Marker 0:00",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				})}
				onSeek={vi.fn().mockResolvedValue(undefined)}
				onTogglePlayback={vi.fn().mockResolvedValue(undefined)}
				onRegisterAudioElement={vi.fn()}
				onReportPlayback={vi.fn()}
				onStepVolume={onStepVolume}
				onDragStart={vi.fn()}
				onDragEnd={vi.fn()}
				onDrop={vi.fn()}
			/>,
		);

		expect(screen.getByText("-12 dB")).toBeTruthy();
		expect(
			(
				screen.getByRole("button", {
					name: /decrease volume for mix v1/i,
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	it("updates the gain node when the stored decibel value changes", async () => {
		const { rerender } = renderWaveformCard({
			audioFile: createAudioFile({ volumeDb: 0 }),
		});

		await waitFor(() => {
			expect(MockAudioContext.instances).toHaveLength(1);
		});

		expect(MockAudioContext.instances[0]?.gainNode.gain.value).toBe(1);

		rerender(
			<WaveformCard
				audioFile={createAudioFile({ volumeDb: 6 })}
				annotations={[]}
				blob={new Blob(["tone"], { type: "audio/wav" })}
				currentTimeMs={0}
				isPlaying={false}
				isSelected
				onSelectFile={vi.fn()}
				onSelectAnnotation={vi.fn()}
				onCreateAnnotation={vi.fn().mockResolvedValue({
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 0,
					title: "Marker 0:00",
					body: EMPTY_RICH_TEXT,
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				})}
				onSeek={vi.fn().mockResolvedValue(undefined)}
				onTogglePlayback={vi.fn().mockResolvedValue(undefined)}
				onRegisterAudioElement={vi.fn()}
				onReportPlayback={vi.fn()}
				onStepVolume={vi.fn().mockResolvedValue(undefined)}
				onDragStart={vi.fn()}
				onDragEnd={vi.fn()}
				onDrop={vi.fn()}
			/>,
		);

		await waitFor(() => {
			expect(MockAudioContext.instances[0]?.gainNode.gain.value).toBeCloseTo(
				1.995,
				3,
			);
		});
	});

	it("seeks on click and seeks with autoplay on double-click in seek mode", async () => {
		const onSeek = vi.fn().mockResolvedValue(undefined);
		const onSelectFile = vi.fn();

		renderWaveformCard({
			onSeek,
			onSelectFile,
		});

		const waveformSurface = screen.getByRole("button", {
			name: /waveform for mix v1/i,
		});
		mockWaveformBounds(waveformSurface, { left: 10, width: 200 });

		fireEvent.click(waveformSurface, { clientX: 60 });

		await waitFor(() => {
			expect(onSeek).toHaveBeenCalledWith(45000);
		});
		expect(onSelectFile).toHaveBeenCalledWith("file-1");

		fireEvent.doubleClick(waveformSurface, { clientX: 160 });

		await waitFor(() => {
			expect(onSeek).toHaveBeenCalledWith(135000, true);
		});
	});

	it("ignores waveform double-click playback when the event originates from an annotation hit", async () => {
		const onSeek = vi.fn().mockResolvedValue(undefined);

		renderWaveformCard({
			onSeek,
			annotations: [
				{
					id: "annotation-1",
					songId: "song-1",
					audioFileId: "file-1",
					type: "point",
					startMs: 30000,
					title: "Verse",
					body: EMPTY_RICH_TEXT,
					color: "var(--color-annotation-4)",
					createdAt: "2026-04-16T00:00:00.000Z",
					updatedAt: "2026-04-16T00:00:00.000Z",
				},
			],
		});

		fireEvent.doubleClick(screen.getByTitle(/verse/i), {
			clientX: 160,
		});

		await waitFor(() => {
			expect(onSeek).not.toHaveBeenCalled();
		});
	});
});
