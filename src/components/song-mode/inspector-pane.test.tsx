// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RICH_TEXT } from "#/lib/song-mode/rich-text";
import type { Annotation, AudioFileRecord, Song } from "#/lib/song-mode/types";
import { InspectorPane } from "./inspector-pane";

vi.mock("./rich-text-editor", () => ({
	RichTextEditor: () => <div data-testid="rich-text-editor" />,
}));

const baseSong: Song = {
	id: "song-1",
	title: "Reload Test",
	artist: "Tester",
	project: "Album",
	generalNotes: EMPTY_RICH_TEXT,
	audioFileOrder: ["file-1"],
	createdAt: "2026-04-16T00:00:00.000Z",
	updatedAt: "2026-04-16T00:00:00.000Z",
};

const baseAnnotation: Annotation = {
	id: "annotation-1",
	songId: "song-1",
	audioFileId: "file-1",
	type: "point",
	startMs: 54000,
	title: "Marker 0:54",
	body: EMPTY_RICH_TEXT,
	createdAt: "2026-04-16T00:00:00.000Z",
	updatedAt: "2026-04-16T00:00:00.000Z",
};

const baseAudioFile: AudioFileRecord = {
	id: "file-1",
	songId: "song-1",
	title: "Mix v1",
	notes: EMPTY_RICH_TEXT,
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
};

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function renderInspector(
	overrides: Partial<React.ComponentProps<typeof InspectorPane>> = {},
) {
	const onOpenTarget = vi.fn();
	const onUpdateAnnotation = vi.fn().mockResolvedValue(undefined);
	const onDeleteAnnotation = vi.fn().mockResolvedValue(undefined);
	const onSelectAnnotation = vi.fn();
	const onUpdateFile = vi.fn().mockResolvedValue(undefined);

	render(
		<InspectorPane
			song={baseSong}
			annotations={[baseAnnotation]}
			activeAnnotation={baseAnnotation}
			onOpenTarget={onOpenTarget}
			onUpdateFile={onUpdateFile}
			onUpdateAnnotation={onUpdateAnnotation}
			onDeleteAnnotation={onDeleteAnnotation}
			onSelectAnnotation={onSelectAnnotation}
			{...overrides}
		/>,
	);

	return {
		onOpenTarget,
		onUpdateAnnotation,
		onDeleteAnnotation,
		onSelectAnnotation,
		onUpdateFile,
	};
}

describe("InspectorPane", () => {
	it("renders each annotation as an inline editor and updates the title directly from the card", () => {
		const { onUpdateAnnotation } = renderInspector();

		expect(screen.queryByText(/annotation details/i)).toBeNull();
		expect(screen.getAllByTestId("rich-text-editor")).toHaveLength(1);

		fireEvent.change(screen.getByDisplayValue("Marker 0:54"), {
			target: { value: "Intro marker" },
		});

		expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
			title: "Intro marker",
		});
	});

	it("commits a new start time when the user edits the inline time input", () => {
		const { onUpdateAnnotation } = renderInspector();

		const startInput = screen.getByLabelText("Start time") as HTMLInputElement;
		expect(startInput.value).toBe("0:54");

		fireEvent.focus(startInput);
		fireEvent.change(startInput, { target: { value: "1:02" } });
		fireEvent.blur(startInput);

		expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
			startMs: 62000,
		});
	});

	it("keeps form controls from seeking while the play button activates the marker", () => {
		const { onOpenTarget, onSelectAnnotation } = renderInspector();

		fireEvent.click(screen.getByDisplayValue("Marker 0:54"));
		fireEvent.click(screen.getByLabelText("Start time"));
		expect(onOpenTarget).not.toHaveBeenCalled();
		expect(onSelectAnnotation).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: /play marker/i }));

		expect(onSelectAnnotation).toHaveBeenCalledWith("annotation-1");
		expect(onOpenTarget).toHaveBeenCalledWith({
			songId: "song-1",
			fileId: "file-1",
			annotationId: "annotation-1",
			timeMs: 54000,
			autoplay: true,
		});
	});

	it("confirms before deleting a marker from the inline card", () => {
		const confirmSpy = vi.fn(() => true);
		vi.stubGlobal("confirm", confirmSpy);
		const { onDeleteAnnotation, onOpenTarget } = renderInspector();

		fireEvent.click(screen.getByTitle("Delete annotation"));

		expect(confirmSpy).toHaveBeenCalledWith("Delete this marker?");
		expect(onDeleteAnnotation).toHaveBeenCalledWith("annotation-1");
		expect(onOpenTarget).not.toHaveBeenCalled();
	});

	it("shows a single per-file notes editor when an audio file is selected", () => {
		renderInspector({
			selectedFile: baseAudioFile,
		});

		expect(screen.getByText(/^notes$/i)).toBeTruthy();
		expect(screen.queryByText(/mastering note/i)).toBeNull();
		expect(screen.getAllByTestId("rich-text-editor")).toHaveLength(2);
	});
});
