// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const baseRangeAnnotation: Annotation = {
	...baseAnnotation,
	id: "annotation-2",
	type: "range",
	startMs: 60000,
	endMs: 179000,
	title: "Range 1:00",
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
	const onDeleteFile = vi.fn().mockResolvedValue(undefined);
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
			onDeleteFile={onDeleteFile}
			onSelectAnnotation={onSelectAnnotation}
			{...overrides}
		/>,
	);

	return {
		onOpenTarget,
		onUpdateAnnotation,
		onDeleteAnnotation,
		onDeleteFile,
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

	it("commits a typed start time when the user presses Enter", () => {
		const { onUpdateAnnotation } = renderInspector();

		const startInput = screen.getByLabelText("Start time") as HTMLInputElement;
		fireEvent.focus(startInput);
		fireEvent.change(startInput, { target: { value: "1:02.25" } });
		fireEvent.keyDown(startInput, { key: "Enter" });

		expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
			startMs: 62250,
		});
	});

	it("scrubs the start time upward in one-second steps", () => {
		const { onUpdateAnnotation } = renderInspector();

		const startInput = screen.getByLabelText("Start time") as HTMLInputElement;

		fireEvent.pointerDown(startInput, {
			button: 0,
			pointerId: 1,
			clientY: 100,
		});
		fireEvent.pointerMove(startInput, {
			pointerId: 1,
			clientY: 84,
		});
		fireEvent.pointerUp(startInput, {
			pointerId: 1,
			clientY: 84,
		});

		expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
			startMs: 56000,
		});
		expect(startInput.value).toBe("0:56");
	});

	it("uses Shift for fine scrub adjustment and shows sub-second precision", () => {
		const { onUpdateAnnotation } = renderInspector();

		const startInput = screen.getByLabelText("Start time") as HTMLInputElement;

		fireEvent.pointerDown(startInput, {
			button: 0,
			pointerId: 1,
			clientY: 100,
		});
		fireEvent.pointerMove(startInput, {
			pointerId: 1,
			clientY: 92,
			shiftKey: true,
		});
		fireEvent.pointerUp(startInput, {
			pointerId: 1,
			clientY: 92,
		});

		expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-1", {
			startMs: 54250,
		});
		expect(startInput.value).toBe("0:54.25");
	});

	it("keeps form controls from seeking while the marker card background activates the marker", () => {
		const { onOpenTarget, onSelectAnnotation, onUpdateAnnotation } =
			renderInspector();

		fireEvent.click(screen.getByDisplayValue("Marker 0:54"));
		fireEvent.click(screen.getByLabelText("Start time"));
		fireEvent.pointerDown(screen.getByLabelText("Start time"), {
			button: 0,
			pointerId: 2,
			clientY: 100,
		});
		fireEvent.pointerUp(screen.getByLabelText("Start time"), {
			pointerId: 2,
			clientY: 100,
		});
		expect(onOpenTarget).not.toHaveBeenCalled();
		expect(onSelectAnnotation).not.toHaveBeenCalled();
		expect(onUpdateAnnotation).not.toHaveBeenCalled();

		const markerCard = screen.getByTestId("marker-card-annotation-1");
		fireEvent.click(markerCard);

		expect(
			markerCard.classList.contains("border-[var(--color-border-strong)]"),
		).toBe(true);
		expect(
			markerCard.classList.contains("bg-[var(--color-surface-selected)]"),
		).toBe(true);
		expect(markerCard.classList.contains("marker-card--selected")).toBe(true);
		expect(
			markerCard.classList.contains("border-[var(--color-accent-strong)]"),
		).toBe(false);
		expect(
			markerCard.classList.contains("bg-[var(--color-accent-surface)]"),
		).toBe(false);

		expect(onSelectAnnotation).toHaveBeenCalledWith("annotation-1");
		expect(onOpenTarget).toHaveBeenCalledWith({
			songId: "song-1",
			fileId: "file-1",
			annotationId: "annotation-1",
			timeMs: 54000,
			autoplay: true,
		});

		onOpenTarget.mockClear();
		onSelectAnnotation.mockClear();
		fireEvent.click(screen.getByDisplayValue("Marker 0:54"));
		expect(onOpenTarget).not.toHaveBeenCalled();
		expect(onSelectAnnotation).not.toHaveBeenCalled();
	});

	it("copies a rich hyperlink payload with a clean marker label", async () => {
		class FakeClipboardItem {
			constructor(readonly items: Record<string, Blob>) {}
		}

		const write = vi.fn().mockResolvedValue(undefined);
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("ClipboardItem", FakeClipboardItem);
		Object.defineProperty(window.navigator, "clipboard", {
			configurable: true,
			value: {
				write,
				writeText,
			},
		});

		renderInspector({
			selectedFile: baseAudioFile,
		});

		fireEvent.click(screen.getByTitle("Copy link"));

		await waitFor(() => {
			expect(write).toHaveBeenCalledTimes(1);
		});

		const expectedLabel = "Mix v1 - Marker 0:54";
		const expectedUrl =
			"http://localhost:3000/songs/song-1?fileId=file-1&annotationId=annotation-1&timeMs=54000&autoplay=1";
		const expectedHtmlUrl = expectedUrl.replaceAll("&", "&amp;");
		const richItem = (write.mock.calls[0]?.[0] as FakeClipboardItem[])[0];
		const htmlPayload = await richItem.items["text/html"].text();
		const plainPayload = await richItem.items["text/plain"].text();

		expect(htmlPayload).toBe(
			`<a href="${expectedHtmlUrl}">${expectedLabel}</a>`,
		);
		expect(plainPayload).toBe(`${expectedLabel}\n${expectedUrl}`);
		expect(writeText).not.toHaveBeenCalled();
	});

	it("falls back to plain text clipboard payload when rich clipboard is unavailable", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("ClipboardItem", undefined);
		Object.defineProperty(window.navigator, "clipboard", {
			configurable: true,
			value: {
				writeText,
			},
		});

		renderInspector({
			selectedFile: baseAudioFile,
		});

		fireEvent.click(screen.getByTitle("Copy link"));

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledTimes(1);
		});

		expect(writeText).toHaveBeenCalledWith(
			"Mix v1 - Marker 0:54\nhttp://localhost:3000/songs/song-1?fileId=file-1&annotationId=annotation-1&timeMs=54000&autoplay=1",
		);
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

	it("clamps range scrubbing against the paired endpoint and file duration", () => {
		const { onUpdateAnnotation } = renderInspector({
			selectedFile: baseAudioFile,
			annotations: [baseRangeAnnotation],
			activeAnnotation: baseRangeAnnotation,
		});

		const startInput = screen.getByLabelText("Start time") as HTMLInputElement;
		const endInput = screen.getByLabelText("End time") as HTMLInputElement;

		fireEvent.pointerDown(startInput, {
			button: 0,
			pointerId: 3,
			clientY: 200,
		});
		fireEvent.pointerMove(startInput, {
			pointerId: 3,
			clientY: -1000,
		});
		fireEvent.pointerUp(startInput, {
			pointerId: 3,
			clientY: -1000,
		});

		fireEvent.pointerDown(endInput, {
			button: 0,
			pointerId: 4,
			clientY: 200,
		});
		fireEvent.pointerMove(endInput, {
			pointerId: 4,
			clientY: 0,
		});
		fireEvent.pointerUp(endInput, {
			pointerId: 4,
			clientY: 0,
		});

		expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-2", {
			startMs: 179000,
		});
		expect(onUpdateAnnotation).toHaveBeenCalledWith("annotation-2", {
			endMs: 180000,
		});
	});

	it("shows a single per-file notes editor when an audio file is selected", () => {
		renderInspector({
			selectedFile: baseAudioFile,
		});

		expect(screen.getByText(/^notes$/i)).toBeTruthy();
		expect(screen.queryByText(/mastering note/i)).toBeNull();
		expect(screen.getAllByTestId("rich-text-editor")).toHaveLength(2);
	});

	it("renders the delete-file control below the Date field", () => {
		renderInspector({
			selectedFile: baseAudioFile,
		});

		const dateLabel = screen.getByText(/^date$/i);
		const deleteButton = screen.getByTitle("Delete file");
		const relation = dateLabel.compareDocumentPosition(deleteButton);
		expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it("confirms before deleting the selected file from the details panel", () => {
		const confirmSpy = vi.fn(() => false);
		vi.stubGlobal("confirm", confirmSpy);
		const { onDeleteFile } = renderInspector({
			selectedFile: baseAudioFile,
		});

		fireEvent.click(screen.getByTitle("Delete file"));
		expect(confirmSpy).toHaveBeenCalledWith("Delete this file?");
		expect(onDeleteFile).not.toHaveBeenCalled();

		confirmSpy.mockReturnValue(true);
		fireEvent.click(screen.getByTitle("Delete file"));
		expect(onDeleteFile).toHaveBeenCalledTimes(1);
	});
});
