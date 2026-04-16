export type AnnotationType = "point" | "range";

export interface RichTextMark {
	type: string;
	attrs?: Record<string, unknown>;
}

export interface RichTextNode {
	type?: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: RichTextMark[];
	content?: RichTextNode[];
}

export interface RichTextDoc {
	type: "doc";
	content?: RichTextNode[];
}

export interface WaveformData {
	peaks: number[];
	peakCount: number;
	durationMs: number;
	sampleRate: number;
}

export interface Song {
	id: string;
	title: string;
	artist: string;
	project: string;
	generalNotes: RichTextDoc;
	audioFileOrder: string[];
	createdAt: string;
	updatedAt: string;
}

export interface AudioFileRecord {
	id: string;
	songId: string;
	title: string;
	notes: RichTextDoc;
	masteringNote: RichTextDoc;
	durationMs: number;
	waveform: WaveformData;
	createdAt: string;
	updatedAt: string;
}

export interface Annotation {
	id: string;
	songId: string;
	audioFileId: string;
	type: AnnotationType;
	startMs: number;
	endMs?: number;
	title: string;
	body: RichTextDoc;
	color?: string;
	createdAt: string;
	updatedAt: string;
}

export interface WorkspaceState {
	selectedFileId?: string;
	activeAnnotationId?: string;
	playheadMsByFileId: Record<string, number>;
	inspectorRatio: number;
	lastVisitedAt: string | null;
}

export interface SongModeSettings {
	recents: string[];
	lastOpenSongId?: string;
	workspaceBySongId: Record<string, WorkspaceState>;
}

export interface SongModeSnapshot {
	songs: Song[];
	audioFiles: AudioFileRecord[];
	annotations: Annotation[];
	blobsByAudioId: Record<string, Blob>;
	settings: SongModeSettings;
}

export interface SongLinkTarget {
	songId: string;
	fileId?: string;
	annotationId?: string;
	timeMs?: number;
	autoplay?: boolean;
}

export interface SongRouteSearch {
	fileId?: string;
	annotationId?: string;
	timeMs?: number;
	autoplay?: boolean;
}

export type SearchResultType = "song" | "file" | "annotation" | "journal";

export interface SearchResult {
	id: string;
	type: SearchResultType;
	title: string;
	subtitle: string;
	snippet: string;
	target: SongLinkTarget;
	score: number;
}

export interface CreateSongInput {
	title: string;
	artist: string;
	project: string;
	generalNotes: RichTextDoc;
}

export interface AddAudioFileInput {
	file: File;
	title: string;
	notes: RichTextDoc;
	masteringNote: RichTextDoc;
}

export interface CreateAnnotationInput {
	songId: string;
	audioFileId: string;
	type: AnnotationType;
	startMs: number;
	endMs?: number;
	title: string;
	body: RichTextDoc;
	color?: string;
}

export const ANNOTATION_COLORS = [
	"#fe7f62",
	"#f6b53b",
	"#72c98d",
	"#63b4ff",
	"#c481ff",
] as const;

export function createDefaultWorkspaceState(): WorkspaceState {
	return {
		playheadMsByFileId: {},
		inspectorRatio: 0.56,
		lastVisitedAt: null,
	};
}

export function createEmptySettings(): SongModeSettings {
	return {
		recents: [],
		workspaceBySongId: {},
	};
}
