import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";

import { app, BrowserWindow, dialog, shell } from "electron";

const DEV_SERVER_URL =
	process.env.SONG_MODE_ELECTRON_RENDERER_URL ?? "http://127.0.0.1:3000";
const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = Number.parseInt(
	process.env.SONG_MODE_ELECTRON_PORT ?? "31415",
	10,
);
const SERVER_BOOT_TIMEOUT_MS = 15_000;
const SERVER_READY_POLL_MS = 250;

/** @type {import("node:child_process").ChildProcessWithoutNullStreams | null} */
let serverProcess = null;
let isQuitting = false;

function shouldUseProductionServer() {
	return (
		app.isPackaged ||
		process.env.SONG_MODE_ELECTRON_USE_PRODUCTION_SERVER === "1"
	);
}

function getProductionServerUrl() {
	return `http://${SERVER_HOST}:${SERVER_PORT}`;
}

function getServerEntryPath() {
	if (app.isPackaged) {
		return join(process.resourcesPath, ".output", "server", "index.mjs");
	}

	return join(app.getAppPath(), ".output", "server", "index.mjs");
}

function delay(milliseconds) {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

async function canAccessFile(filePath) {
	try {
		await access(filePath, fsConstants.R_OK);
		return true;
	} catch {
		return false;
	}
}

async function waitForSongMode(url, timeoutMs) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (serverProcess?.exitCode != null) {
			throw new Error(
				"The packaged Song Mode server exited before it became ready.",
			);
		}

		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(1_000),
			});

			if (response.ok) {
				const html = await response.text();

				if (html.includes("<title>Song Mode</title>")) {
					return;
				}
			}
		} catch {}

		await delay(SERVER_READY_POLL_MS);
	}

	throw new Error(`Timed out waiting for Song Mode at ${url}.`);
}

async function startProductionServer() {
	const serverEntryPath = getServerEntryPath();

	if (!(await canAccessFile(serverEntryPath))) {
		throw new Error(
			`Missing built server at ${serverEntryPath}. Run npm run build before launching Electron.`,
		);
	}

	serverProcess = spawn(process.execPath, [serverEntryPath], {
		cwd: app.getAppPath(),
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			HOST: SERVER_HOST,
			NODE_ENV: "production",
			PORT: String(SERVER_PORT),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	serverProcess.stdout.on("data", (chunk) => {
		process.stdout.write(`[song-mode-server] ${chunk}`);
	});

	serverProcess.stderr.on("data", (chunk) => {
		process.stderr.write(`[song-mode-server] ${chunk}`);
	});

	serverProcess.on("exit", (code, signal) => {
		if (isQuitting) {
			return;
		}

		void dialog.showErrorBox(
			"Song Mode server stopped",
			`The packaged local server exited unexpectedly (${signal ?? code ?? "unknown"}).`,
		);
		app.quit();
	});

	await waitForSongMode(getProductionServerUrl(), SERVER_BOOT_TIMEOUT_MS);
}

function stopProductionServer() {
	if (serverProcess == null || serverProcess.killed) {
		return;
	}

	serverProcess.kill("SIGTERM");
	serverProcess = null;
}

async function createMainWindow() {
	const window = new BrowserWindow({
		width: 1440,
		height: 960,
		minWidth: 1120,
		minHeight: 720,
		show: false,
		backgroundColor: "#f4f1e8",
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	window.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	window.once("ready-to-show", () => {
		window.show();
	});

	if (shouldUseProductionServer()) {
		await window.loadURL(getProductionServerUrl());
		return;
	}

	await waitForSongMode(DEV_SERVER_URL, SERVER_BOOT_TIMEOUT_MS);
	await window.loadURL(DEV_SERVER_URL);
	window.webContents.openDevTools({ mode: "detach" });
}

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		void createMainWindow();
	}
});

app.on("before-quit", () => {
	isQuitting = true;
	stopProductionServer();
});

try {
	await app.whenReady();

	if (shouldUseProductionServer()) {
		await startProductionServer();
	}

	await createMainWindow();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	dialog.showErrorBox("Unable to launch Song Mode", message);
	app.quit();
}
