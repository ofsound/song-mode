import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
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
	placeholder?: string;
	focusId?: string;
}

export function RichTextEditor({
	value,
	onChange,
	onInternalLink,
	compact = false,
	placeholder,
	focusId,
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
			}),
			Link.configure({
				openOnClick: true,
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
					compact ? "min-h-28 px-3 py-3" : "min-h-44 px-4 py-4",
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
			editor.commands.setContent(value ?? EMPTY_RICH_TEXT, false, {
				preserveWhitespace: "full",
			});
		}
	}, [editor, serializedValue, value]);

	useEffect(() => {
		if (!editor || !wrapperRef.current || !onInternalLink) {
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
			if (!internalTarget) {
				return;
			}

			event.preventDefault();
			onInternalLink(internalTarget);
		};

		const node = wrapperRef.current;
		node.addEventListener("click", handleClick);
		return () => {
			node.removeEventListener("click", handleClick);
		};
	}, [editor, onInternalLink]);

	if (!editor) {
		return (
			<div className="rounded-[1.15rem] border border-[var(--border-strong)] bg-[var(--panel)] px-4 py-4 text-sm text-[var(--text-dim)]">
				Loading editor...
			</div>
		);
	}

	return (
		<div
			ref={wrapperRef}
			className="rounded-[1.15rem] border border-[var(--border-strong)] bg-[var(--panel)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
			data-song-mode-editor={focusId}
		>
			<div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-muted)] px-3 py-2">
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
			</div>
			<EditorContent editor={editor} />
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
			className={`inline-flex h-8 items-center justify-center rounded-full border px-3 text-xs font-semibold ${
				active
					? "border-[var(--accent-strong)] bg-[var(--accent-muted)] text-[var(--text-strong)]"
					: "border-[var(--border-muted)] bg-[var(--panel-elevated)] text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:text-[var(--text-strong)]"
			}`}
			aria-label={label}
			title={label}
		>
			{children}
		</button>
	);
}
