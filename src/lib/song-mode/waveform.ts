import type { WaveformData } from "./types";

const DEFAULT_PEAK_COUNT = 960;
const FALLBACK_PEAK_COUNT = 120;

export function normalizeWaveformData(
	waveform: Partial<WaveformData> | null | undefined,
	fallbackDurationMs = 0,
): WaveformData {
	const normalizedPeaks = Array.isArray(waveform?.peaks)
		? waveform.peaks
				.filter((value): value is number => Number.isFinite(value))
				.map((value) => Math.max(0, Math.min(1, value)))
		: [];
	const peakCount = Math.max(
		1,
		Math.min(
			DEFAULT_PEAK_COUNT,
			Math.round(
				typeof waveform?.peakCount === "number" && waveform.peakCount > 0
					? waveform.peakCount
					: normalizedPeaks.length || FALLBACK_PEAK_COUNT,
			),
		),
	);

	return {
		peaks:
			normalizedPeaks.length > 0 ? normalizedPeaks : Array(peakCount).fill(0),
		peakCount: normalizedPeaks.length > 0 ? normalizedPeaks.length : peakCount,
		durationMs: Math.max(
			0,
			Math.round(
				typeof waveform?.durationMs === "number" && waveform.durationMs > 0
					? waveform.durationMs
					: fallbackDurationMs,
			),
		),
		sampleRate: Math.max(
			1,
			Math.round(
				typeof waveform?.sampleRate === "number" && waveform.sampleRate > 0
					? waveform.sampleRate
					: 44100,
			),
		),
	};
}

export function hasRenderableWaveform(
	waveform: Partial<WaveformData> | null | undefined,
): boolean {
	return Array.isArray(waveform?.peaks)
		? waveform.peaks.some((value) => Number.isFinite(value))
		: false;
}

export async function generateWaveformFromFile(
	file: Blob,
	peakCount = DEFAULT_PEAK_COUNT,
): Promise<WaveformData> {
	if (typeof window === "undefined") {
		throw new Error("Audio decoding is only available in the browser.");
	}

	const AudioContextCtor =
		window.AudioContext ||
		(window as Window & { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;

	if (!AudioContextCtor) {
		throw new Error("This browser does not support Web Audio decoding.");
	}

	const context = new AudioContextCtor();
	try {
		const audioBuffer = await context.decodeAudioData(await file.arrayBuffer());
		const peaks = extractPeaks(audioBuffer, peakCount);
		const durationMs = Math.round(audioBuffer.duration * 1000);

		return normalizeWaveformData(
			{
				peaks,
				peakCount: peaks.length,
				durationMs,
				sampleRate: audioBuffer.sampleRate,
			},
			durationMs,
		);
	} catch {
		throw new Error(
			"Song Mode could not decode that audio file. Try a shorter file or a browser-friendly format such as WAV, MP3, or AAC.",
		);
	} finally {
		await context.close().catch(() => undefined);
	}
}

export function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function clampTime(timeMs: number, durationMs: number): number {
	return Math.max(0, Math.min(durationMs, timeMs));
}

function extractPeaks(audioBuffer: AudioBuffer, targetPeaks: number): number[] {
	const length = audioBuffer.length;
	const channelCount = audioBuffer.numberOfChannels;
	const bucketSize = Math.max(1, Math.floor(length / targetPeaks));
	const peaks: number[] = [];

	for (let bucket = 0; bucket < targetPeaks; bucket += 1) {
		const start = bucket * bucketSize;
		if (start >= length) {
			break;
		}

		const end = Math.min(length, start + bucketSize);
		let peak = 0;

		for (let channel = 0; channel < channelCount; channel += 1) {
			const data = audioBuffer.getChannelData(channel);
			for (let index = start; index < end; index += 1) {
				const value = Math.abs(data[index] ?? 0);
				if (value > peak) {
					peak = value;
				}
			}
		}

		peaks.push(peak);
	}

	const maxPeak = Math.max(...peaks, 1);
	return peaks.map((value) => value / maxPeak);
}
