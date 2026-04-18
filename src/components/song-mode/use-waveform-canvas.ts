import { type MutableRefObject, useEffect } from "react";
import type { WaveformData } from "#/lib/song-mode/types";
import { getWaveformHeightPx } from "#/lib/song-mode/ui-settings";

interface UseWaveformCanvasOptions {
	canvasRef: MutableRefObject<HTMLCanvasElement | null>;
	surfaceRef: MutableRefObject<HTMLDivElement | null>;
	waveform: WaveformData;
	currentTimeMs: number;
	isSelected: boolean;
}

export function useWaveformCanvas({
	canvasRef,
	surfaceRef,
	waveform,
	currentTimeMs,
	isSelected,
}: UseWaveformCanvasOptions) {
	useEffect(() => {
		const canvas = canvasRef.current;
		const surface = surfaceRef.current;
		if (!canvas || !surface) {
			return;
		}

		const context = canvas.getContext("2d");
		if (!context) {
			return;
		}

		const draw = () => {
			const width = Math.round(surface.clientWidth);
			if (width <= 0) {
				return false;
			}

			const ratio = window.devicePixelRatio || 1;
			const styles = window.getComputedStyle(surface);
			const readColor = (name: string) =>
				styles.getPropertyValue(name).trim() || "transparent";
			const parsedHeight = Number.parseInt(
				styles.getPropertyValue("--song-workspace-waveform-height"),
				10,
			);
			const height = Number.isFinite(parsedHeight)
				? parsedHeight
				: getWaveformHeightPx("large");
			canvas.width = width * ratio;
			canvas.height = height * ratio;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;

			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			context.clearRect(0, 0, width, height);

			context.fillStyle = readColor("--canvas-waveform-surface");
			context.fillRect(0, 0, width, height);

			context.strokeStyle = readColor("--canvas-waveform-grid");
			context.lineWidth = 1;
			context.beginPath();
			context.moveTo(0, height / 2);
			context.lineTo(width, height / 2);
			context.stroke();

			const peaks = waveform.peaks;
			const step = width / Math.max(peaks.length, 1);
			const middle = height / 2;

			for (let index = 0; index < peaks.length; index += 1) {
				const peak = peaks[index] ?? 0;
				const x = index * step;
				const y = Math.max(2, peak * (height * 0.42));

				context.strokeStyle = isSelected
					? readColor("--canvas-waveform-selected")
					: readColor("--canvas-waveform-base");
				context.lineWidth = Math.max(1, step * 0.68);
				context.beginPath();
				context.moveTo(x, middle - y);
				context.lineTo(x, middle + y);
				context.stroke();
			}

			const progressX =
				width * (currentTimeMs / Math.max(waveform.durationMs, 1));
			context.fillStyle = readColor("--canvas-waveform-progress");
			context.fillRect(0, 0, progressX, height);
			context.strokeStyle = readColor("--canvas-waveform-progress-line");
			context.lineWidth = 2;
			context.beginPath();
			context.moveTo(progressX, 0);
			context.lineTo(progressX, height);
			context.stroke();

			return true;
		};

		let frameId = 0;
		const scheduleDraw = () => {
			if (frameId) {
				window.cancelAnimationFrame(frameId);
			}

			frameId = window.requestAnimationFrame(() => {
				if (!draw()) {
					frameId = window.requestAnimationFrame(() => {
						draw();
					});
				}
			});
		};

		const observer = new ResizeObserver(scheduleDraw);
		observer.observe(surface);
		scheduleDraw();

		return () => {
			observer.disconnect();
			if (frameId) {
				window.cancelAnimationFrame(frameId);
			}
		};
	}, [
		canvasRef,
		currentTimeMs,
		isSelected,
		surfaceRef,
		waveform.durationMs,
		waveform.peaks,
	]);
}
