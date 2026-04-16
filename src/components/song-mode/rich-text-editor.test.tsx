// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	plainTextToRichText,
	richTextToMultiline,
} from "#/lib/song-mode/rich-text";
import type { RichTextDoc } from "#/lib/song-mode/types";
import { RichTextEditor, type RichTextToolbarAction } from "./rich-text-editor";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function TestHarness({
	onChangeSpy,
}: {
	onChangeSpy: (value: RichTextDoc) => void;
}) {
	const [value, setValue] = useState(plainTextToRichText("Alpha Beta"));
	const toolbarActions = useMemo<RichTextToolbarAction[]>(
		() => [
			{
				label: "Move Caret",
				onClick: (editor) => {
					editor.commands.setTextSelection("Alpha ".length + 1);
				},
			},
			{
				label: "Add Timestamp",
				onClick: (editor) => {
					const timestamp = new Intl.DateTimeFormat(undefined, {
						dateStyle: "medium",
						timeStyle: "short",
					}).format(new Date());

					editor
						.chain()
						.focus(undefined, { scrollIntoView: false })
						.insertContent(timestamp)
						.run();
				},
			},
		],
		[],
	);

	return (
		<>
			<RichTextEditor
				value={value}
				onChange={(nextValue) => {
					onChangeSpy(nextValue);
					setValue(nextValue);
				}}
				toolbarActions={toolbarActions}
			/>
			<output data-testid="editor-output">{richTextToMultiline(value)}</output>
		</>
	);
}

describe("RichTextEditor", () => {
	it("inserts a timestamp at the current selection through a custom toolbar action", async () => {
		const RealDate = Date;
		const now = new RealDate("2026-04-16T09:41:00");
		class MockDate extends RealDate {
			constructor(...args: ConstructorParameters<DateConstructor>) {
				super(args.length > 0 ? args[0] : now);
			}

			static now() {
				return now.getTime();
			}

			static parse = RealDate.parse;
			static UTC = RealDate.UTC;
		}

		vi.stubGlobal("Date", MockDate);
		const onChangeSpy = vi.fn();
		const expectedTimestamp = new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(now);

		render(<TestHarness onChangeSpy={onChangeSpy} />);

		await screen.findByRole("button", { name: "Add Timestamp" });

		fireEvent.click(screen.getByRole("button", { name: "Move Caret" }));
		fireEvent.click(screen.getByRole("button", { name: "Add Timestamp" }));

		await waitFor(() => {
			expect(screen.getByTestId("editor-output").textContent).toBe(
				`Alpha ${expectedTimestamp}Beta`,
			);
		});

		expect(onChangeSpy).toHaveBeenCalled();
		expect(
			richTextToMultiline(onChangeSpy.mock.lastCall?.[0] as RichTextDoc),
		).toBe(`Alpha ${expectedTimestamp}Beta`);
	});

	it("keeps the journal toolbar outside the scroll region", async () => {
		render(
			<RichTextEditor
				value={plainTextToRichText("Scrollable body")}
				onChange={() => {}}
				focusId="journal"
			/>,
		);

		const journalEditor = await screen.findByTestId("rich-text-editor-journal");
		const toolbar = journalEditor.querySelector("[data-song-mode-toolbar]");
		const scrollRegion = journalEditor.querySelector(".song-editor-scroll-region");
		const editorBody = journalEditor.querySelector(".song-editor");

		expect(toolbar).toBeTruthy();
		expect(scrollRegion).toBeTruthy();
		expect(editorBody).toBeTruthy();
		expect(scrollRegion?.contains(toolbar as Node)).toBe(false);
		expect(scrollRegion?.contains(editorBody as Node)).toBe(true);
	});
});
