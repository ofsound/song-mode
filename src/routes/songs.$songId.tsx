import { createFileRoute } from "@tanstack/react-router";
import { SongWorkspace } from "#/components/song-mode/song-workspace";
import { normalizeSongRouteSearch } from "#/lib/song-mode/links";

export const Route = createFileRoute("/songs/$songId")({
	validateSearch: (search) => normalizeSongRouteSearch(search),
	component: SongRouteComponent,
});

function SongRouteComponent() {
	const { songId } = Route.useParams();
	const search = Route.useSearch();

	return <SongWorkspace songId={songId} search={search} />;
}
