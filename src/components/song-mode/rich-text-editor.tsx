import Link from "@tiptap/extension-link";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	Italic,
	Link2,
	List,
	ListOrdered,
	Quote,
	Unlink,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { parseSongTarget } from "#/lib/song-mode/links";
import { EMPTY_RICH_TEXT } from "#/lib/song-mode/rich-text";
import type { RichTextDoc, SongLinkTarget } from "#/lib/song-mode/types";

interface RichTextEditorProps {
	value: RichTextDoc;
	onChange: (value: RichTextDoc) => void;
	onInternalLink?: (target: SongLinkTarget) => void;
	compact?: boolean;
	/** Further shrinks padding/min-height; only meaningful when `compact` is also set. */
	dense?: boolean;
	placeholder?: string;
	focusId?: string;
	/** When false, formatting toolbar is hidden (editor still supports rich content). */
	showToolbar?: boolean;
	toolbarActions?: RichTextToolbarAction[];
}

export interface RichTextToolbarAction {
	label: string;
	onClick: (editor: Editor) => void;
}

export function RichTextEditor({
	value,
	onChange,
	onInternalLink,
	compact = false,
	dense = false,
	placeholder,
	focusId,
	showToolbar = true,
	toolbarActions = [],
}: RichTextEditorProps) {
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const serializedValue = useMemo(
		() => JSON.stringify(value ?? EMPTY_RICH_TEXT),
		[value],
	);
	const debounceRef = useRef<number | null>(null);

	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit.configure({
				heading: false,
				link: false,
			}),
			Link.configure({
				openOnClick: false,
				autolink: true,
				HTMLAttributes: {
					class: "song-link",
				},
			}),
		],
		content: value ?? EMPTY_RICH_TEXT,
		editorProps: {
			attributes: {
				class: [
					"song-editor prose prose-sm max-w-none outline-none",
					compact
						? dense
							? "min-h-12 px-2 py-1.5 text-[13px]"
							: "min-h-28 px-3 py-3"
						: "min-h-44 px-4 py-4",
				].join(" "),
				"data-placeholder": placeholder ?? "",
			},
		},
		onUpdate({ editor: currentEditor }) {
			if (debounceRef.current) {
				window.clearTimeout(debounceRef.current);
			}

			debounceRef.current = window.setTimeout(() => {
				onChange(currentEditor.getJSON() as RichTextDoc);
			}, 180);
		},
	});

	useEffect(() => {
		return () => {
			if (debounceRef.current) {
				window.clearTimeout(debounceRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (!editor) {
			return;
		}

		const nextSerialized = JSON.stringify(editor.getJSON());
		if (nextSerialized !== serializedValue) {
			editor.commands.setContent(value ?? EMPTY_RICH_TEXT, {
				emitUpdate: false,
				parseOptions: { preserveWhitespace: "full" },
			});
		}
	}, [editor, serializedValue, value]);

	useEffect(() => {
		if (!editor || !wrapperRef.current) {
			return;
		}

		const handleClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) {
				return;
			}

			const anchor = target.closest("a[href]");
			if (!(anchor instanceof HTMLAnchorElement)) {
				return;
			}

			const internalTarget = parseSongTarget(anchor.getAttribute("href"));
			if (internalTarget && onInternalLink) {
				event.preventDefault();
				onInternalLink(internalTarget);
				return;
			}

			event.preventDefault();
			window.open(anchor.href, "_blank", "noopener,noreferrer");
		};

		const node = wrapperRef.current;
		node.addEventListener("click", handleClick);
		return () => {
			node.removeEventListener("click", handleClick);
		};
	}, [editor, onInternalLink]);

	if (!editor) {
		return (
			<div className="border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
				Loading editor...
			</div>
		);
	}

	return (
		<div
			ref={wrapperRef}
			className="min-h-0 border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-[var(--shadow-control)]"
			data-song-mode-editor={focusId}
			data-testid={focusId ? `rich-text-editor-${focusId}` : undefined}
		>
			{showToolbar ? (
				<div
					className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2"
					data-song-mode-toolbar
				>
					<ToolbarButton
						label="Bold"
						active={editor.isActive("bold")}
						onClick={() => editor.chain().focus().toggleBold().run()}
					>
						<Bold size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Italic"
						active={editor.isActive("italic")}
						onClick={() => editor.chain().focus().toggleItalic().run()}
					>
						<Italic size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Bullets"
						active={editor.isActive("bulletList")}
						onClick={() => editor.chain().focus().toggleBulletList().run()}
					>
						<List size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Numbers"
						active={editor.isActive("orderedList")}
						onClick={() => editor.chain().focus().toggleOrderedList().run()}
					>
						<ListOrdered size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Quote"
						active={editor.isActive("blockquote")}
						onClick={() => editor.chain().focus().toggleBlockquote().run()}
					>
						<Quote size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Link"
						active={editor.isActive("link")}
						onClick={() => {
							const existing = editor.getAttributes("link").href as
								| string
								| undefined;
							const href = window.prompt(
								"Paste a URL or an internal Song Mode link.",
								existing ?? "",
							);

							if (href === null) {
								return;
							}

							if (!href.trim()) {
								editor.chain().focus().unsetLink().run();
								return;
							}

							editor
								.chain()
								.focus()
								.extendMarkRange("link")
								.setLink({ href })
								.run();
						}}
					>
						<Link2 size={15} />
					</ToolbarButton>
					<ToolbarButton
						label="Remove link"
						active={false}
						onClick={() => editor.chain().focus().unsetLink().run()}
					>
						<Unlink size={15} />
					</ToolbarButton>
					{toolbarActions.map((action) => (
						<ToolbarButton
							key={action.label}
							label={action.label}
							active={false}
							onClick={() => action.onClick(editor)}
						>
							{action.label}
						</ToolbarButton>
					))}
				</div>
			) : null}
			<div className="song-editor-scroll-region min-h-0 flex-1 overflow-hidden">
				<EditorContent editor={editor} />
			</div>
		</div>
	);
}

function ToolbarButton({
	label,
	active,
	onClick,
	children,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`inline-flex h-8 items-center justify-center border px-3 text-xs font-semibold ${
				active
					? "border-[var(--color-accent-strong)] bg-[var(--color-accent-surface)] text-[var(--color-text)]"
					: "border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
			}`}
			aria-label={label}
			title={label}
		>
			{children}
		</button>
	);
}
