# Song Mode

Song Mode is a local-first review workspace for song files. It stores songs, uploaded audio, waveform peaks, annotations, and workspace state in IndexedDB so the app works without a backend.

## What It Does

- Create song records with artist, project, and journal notes
- Import multiple audio files per song and cache generated waveform data locally
- Review waveforms, create point/range annotations, and deep-link back to exact moments
- Keep file-level notes alongside a persistent song journal
- Search across songs, journals, file notes, and annotations

## Development

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:3000`.

## Quality Checks

```bash
npm run verify
```

## Architecture

- Routing: TanStack Router file-based routes in `src/routes`
- State: `SongModeProvider` owns the local snapshot and serializes persistence writes
- Storage: IndexedDB via `idb` in `src/lib/song-mode/db.ts`
- Rich text: Tiptap-based editors for journals, file notes, and annotation notes
- Waveforms: browser-side decoding and peak generation in `src/lib/song-mode/waveform.ts`
- Server/runtime plugin: TanStack Start wired through `nitro/vite`; this repo pins the currently compatible Nitro beta line because the official TanStack Start hosting docs note that the `nitro/vite` integration is still under active development

## Keyboard Shortcuts

- `Space`: play/pause the selected file
- `Left` / `,`: seek backward 5 seconds (hold `Shift` to seek 1 second)
- `Right` / `.`: seek forward 5 seconds (hold `Shift` to seek 1 second)
- `Shift + Up`: jump to previous annotation
- `Shift + Down`: jump to next annotation
- `Shift + J`: focus the song journal
- `/` or `Cmd/Ctrl + K`: focus global search

## Local Data Model

Song Mode persists the following records locally:

- songs
- audio files
- annotation records
- raw audio blobs
- per-song workspace settings and recents

No server sync is implemented. Clearing site storage removes the workspace.
