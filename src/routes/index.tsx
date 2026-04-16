import { createFileRoute } from "@tanstack/react-router";
import { LibraryView } from "../components/song-mode/library-view";

export const Route = createFileRoute("/")({ component: App });

function App() {
	return <LibraryView />;
}
