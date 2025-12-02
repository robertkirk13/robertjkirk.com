import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 380;

interface FrequencyResponseDemoProps {
	initialCutoff?: number;
}

export default function FrequencyResponseDemo({
	initialCutoff = 0.3,
}: FrequencyResponseDemoProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [cutoffFreq, setCutoffFreq] = useState(initialCutoff);
	const [filterType, setFilterType] = useState<"lowpass" | "highpass" | "bandpass">("lowpass");
	const animationRef = useRef<number>();

	// Simple low-pass filter coefficient
	const getFilterResponse = useCallback(
		(freq: number, cutoff: number, type: "lowpass" | "highpass" | "bandpass") => {
			// Simulate frequency response magnitude
			const normalizedFreq = freq / 0.5; // Normalize to Nyquist
			const normalizedCutoff = cutoff;

			switch (type) {
				case "lowpass": {
					// Simple first-order response
					const ratio = normalizedFreq / normalizedCutoff;
					return 1 / Math.sqrt(1 + Math.pow(ratio, 4));
				}
				case "highpass": {
					const ratio = normalizedCutoff / normalizedFreq;
					return 1 / Math.sqrt(1 + Math.pow(ratio, 4));
				}
				case "bandpass": {
					const center = cutoff;
					const bandwidth = 0.1;
					const distance = Math.abs(normalizedFreq - center) / bandwidth;
					return Math.exp(-distance * distance);
				}
			}
		},
		[],
	);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			cutoff: number,
			type: "lowpass" | "highpass" | "bandpass",
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Upper plot: Time domain
			const timeHeight = (height - 70) / 2;
			const timeCenterY = padding + timeHeight / 2;

			// Title
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Time Domain: Input vs Filtered", padding, 25);

			// Grid for time domain
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 4; i++) {
				const y = padding + (timeHeight * i) / 4;
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - padding, y);
				ctx.stroke();
			}

			// Center line
			ctx.strokeStyle = "#334155";
			ctx.beginPath();
			ctx.moveTo(padding, timeCenterY);
			ctx.lineTo(width - padding, timeCenterY);
			ctx.stroke();

			// Draw input signal (composite of multiple frequencies)
			const frequencies = [0.05, 0.15, 0.35, 0.45];
			const amplitudes = [0.4, 0.3, 0.2, 0.1];

			// Input signal
			ctx.beginPath();
			ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
			ctx.lineWidth = 1.5;
			const timeWindow = 3;
			for (let i = 0; i <= 300; i++) {
				const t = currentTime + (timeWindow * i) / 300;
				const x = padding + (plotWidth * i) / 300;
				let value = 0;
				for (let j = 0; j < frequencies.length; j++) {
					value += amplitudes[j] * Math.sin(2 * Math.PI * frequencies[j] * t * 10);
				}
				const y = timeCenterY - value * (timeHeight * 0.35);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Filtered signal
			ctx.beginPath();
			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 2;
			for (let i = 0; i <= 300; i++) {
				const t = currentTime + (timeWindow * i) / 300;
				const x = padding + (plotWidth * i) / 300;
				let value = 0;
				for (let j = 0; j < frequencies.length; j++) {
					const gain = getFilterResponse(frequencies[j], cutoff, type);
					value += amplitudes[j] * gain * Math.sin(2 * Math.PI * frequencies[j] * t * 10);
				}
				const y = timeCenterY - value * (timeHeight * 0.35);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Lower plot: Frequency response
			const freqY = padding + timeHeight + 30;
			const freqHeight = timeHeight - 10;
			const freqBottom = freqY + freqHeight;

			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Frequency Response (Magnitude)", padding, freqY - 10);

			// Grid for frequency domain
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 4; i++) {
				const y = freqY + (freqHeight * i) / 4;
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - padding, y);
				ctx.stroke();
			}

			// Y-axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "right";
			ctx.fillText("1.0", padding - 5, freqY + 5);
			ctx.fillText("0.5", padding - 5, freqY + freqHeight / 2 + 3);
			ctx.fillText("0", padding - 5, freqBottom + 3);

			// X-axis labels
			ctx.textAlign = "center";
			ctx.fillText("0", padding, freqBottom + 15);
			ctx.fillText("0.25", padding + plotWidth * 0.5, freqBottom + 15);
			ctx.fillText("0.5 (Nyquist)", width - padding, freqBottom + 15);

			// Draw frequency response curve
			ctx.beginPath();
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 2.5;
			for (let i = 0; i <= 200; i++) {
				const freq = (i / 200) * 0.5;
				const x = padding + (i / 200) * plotWidth;
				const gain = getFilterResponse(freq, cutoff, type);
				const y = freqBottom - gain * freqHeight;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw cutoff frequency line
			const cutoffX = padding + (cutoff / 0.5) * plotWidth;
			ctx.strokeStyle = "rgba(249, 115, 22, 0.5)";
			ctx.setLineDash([5, 5]);
			ctx.beginPath();
			ctx.moveTo(cutoffX, freqY);
			ctx.lineTo(cutoffX, freqBottom);
			ctx.stroke();
			ctx.setLineDash([]);

			// Draw -3dB line
			const halfPowerY = freqBottom - 0.707 * freqHeight;
			ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
			ctx.setLineDash([3, 3]);
			ctx.beginPath();
			ctx.moveTo(padding, halfPowerY);
			ctx.lineTo(width - padding, halfPowerY);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = "#64748b";
			ctx.font = "9px monospace";
			ctx.textAlign = "left";
			ctx.fillText("-3dB", width - padding + 5, halfPowerY + 3);

			// Draw frequency markers for input signal
			ctx.fillStyle = "#3b82f6";
			for (const freq of frequencies) {
				const x = padding + (freq / 0.5) * plotWidth;
				const gain = getFilterResponse(freq, cutoff, type);
				const y = freqBottom - gain * freqHeight;
				ctx.beginPath();
				ctx.arc(x, y, 5, 0, Math.PI * 2);
				ctx.fill();
			}

			// Legend
			const legendY = height - 8;
			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";

			ctx.fillStyle = "rgba(59, 130, 246, 0.6)";
			ctx.fillRect(padding, legendY - 8, 12, 3);
			ctx.fillStyle = "#3b82f6";
			ctx.fillText("Input", padding + 16, legendY);

			ctx.fillStyle = "#22c55e";
			ctx.fillRect(padding + 70, legendY - 8, 12, 3);
			ctx.fillText("Filtered", padding + 86, legendY);

			ctx.fillStyle = "#f97316";
			ctx.fillRect(padding + 160, legendY - 8, 12, 3);
			ctx.fillText("Response", padding + 176, legendY);
		},
		[getFilterResponse],
	);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => setIsVisible(entry.isIntersecting),
			{ threshold: 0.1 },
		);
		if (containerRef.current) observer.observe(containerRef.current);
		return () => {
			if (containerRef.current) observer.unobserve(containerRef.current);
		};
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx || !isVisible) return;

		const loop = () => {
			if (isRunning) {
				setTime((t) => t + 1 / 60);
			}
			draw(ctx, time, cutoffFreq, filterType);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, cutoffFreq, filterType]);

	const handleReset = () => {
		setTime(0);
		setCutoffFreq(initialCutoff);
		setFilterType("lowpass");
	};

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl"
		>
			<canvas
				ref={canvasRef}
				width={CANVAS_WIDTH * DPR}
				height={CANVAS_HEIGHT * DPR}
				className="w-full rounded-xl"
				style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
			/>

			<div className="flex flex-col gap-3 px-2">
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-28">Cutoff Freq</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-orange-500 rounded-lg"
							style={{ width: `${(cutoffFreq / 0.5) * 100}%` }}
						/>
						<input
							type="range"
							min="0.05"
							max="0.45"
							step="0.01"
							value={cutoffFreq}
							onChange={(e) => setCutoffFreq(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-orange-500 rounded-full border-2 border-orange-300 pointer-events-none"
							style={{ left: `calc(${(cutoffFreq / 0.5) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-orange-400 w-16 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{cutoffFreq.toFixed(2)}
					</span>
				</div>
			</div>

			<div className="flex justify-between items-center flex-wrap gap-3">
				<div className="flex gap-2 items-center">
					<button
						type="button"
						onClick={handleReset}
						className="p-2.5 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 rounded-xl transition-all"
						title="Reset"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
							<path d="M3 3v5h5" />
						</svg>
					</button>
					<button
						type="button"
						onClick={() => setIsRunning(!isRunning)}
						className="p-2.5 rounded-xl transition-all bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700"
						title={isRunning ? "Pause" : "Play"}
					>
						{isRunning ? (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#a1a1aa"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<rect x="6" y="4" width="4" height="16" rx="1" />
								<rect x="14" y="4" width="4" height="16" rx="1" />
							</svg>
						) : (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="#a1a1aa"
								stroke="#a1a1aa"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polygon points="5 3 19 12 5 21 5 3" />
							</svg>
						)}
					</button>
				</div>
				<div className="flex gap-2">
					{(["lowpass", "highpass", "bandpass"] as const).map((type) => (
						<button
							key={type}
							type="button"
							onClick={() => setFilterType(type)}
							className={`px-3 py-1.5 rounded-xl text-sm font-mono transition-all ${
								filterType === type
									? "bg-orange-600/30 text-orange-400"
									: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
							}`}
						>
							{type === "lowpass" ? "Low-pass" : type === "highpass" ? "High-pass" : "Band-pass"}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

