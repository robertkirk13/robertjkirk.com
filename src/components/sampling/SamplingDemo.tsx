import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 320;

interface SamplingDemoProps {
	initialFrequency?: number;
	initialSampleRate?: number;
	showReconstruction?: boolean;
}

export default function SamplingDemo({
	initialFrequency = 2.0,
	initialSampleRate = 10,
	showReconstruction = true,
}: SamplingDemoProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [frequency, setFrequency] = useState(initialFrequency);
	const [sampleRate, setSampleRate] = useState(initialSampleRate);
	const [showRecon, setShowRecon] = useState(showReconstruction);
	const animationRef = useRef<number>();

	// Generate samples for a given time window
	const getSamples = useCallback(
		(startTime: number, timeWindow: number, fs: number, freq: number) => {
			const samples: { t: number; value: number }[] = [];
			const samplePeriod = 1 / fs;
			// Find the first sample time >= startTime
			const firstSampleIndex = Math.ceil(startTime / samplePeriod);
			const lastSampleIndex = Math.floor((startTime + timeWindow) / samplePeriod);

			for (let i = firstSampleIndex; i <= lastSampleIndex; i++) {
				const t = i * samplePeriod;
				const value = Math.sin(2 * Math.PI * freq * t);
				samples.push({ t, value });
			}
			return samples;
		},
		[],
	);

	// Linear interpolation reconstruction
	const reconstructLinear = useCallback(
		(t: number, samples: { t: number; value: number }[]) => {
			if (samples.length === 0) return 0;
			if (samples.length === 1) return samples[0].value;

			// Find surrounding samples
			let left = samples[0];
			let right = samples[samples.length - 1];

			for (let i = 0; i < samples.length - 1; i++) {
				if (samples[i].t <= t && samples[i + 1].t >= t) {
					left = samples[i];
					right = samples[i + 1];
					break;
				}
			}

			if (t <= left.t) return left.value;
			if (t >= right.t) return right.value;

			// Linear interpolation
			const alpha = (t - left.t) / (right.t - left.t);
			return left.value * (1 - alpha) + right.value * alpha;
		},
		[],
	);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			freq: number,
			fs: number,
			showReconst: boolean,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;
			const plotHeight = height - 2 * padding;
			const centerY = padding + plotHeight / 2;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Draw grid
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 4; i++) {
				const y = padding + (plotHeight * i) / 4;
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - padding, y);
				ctx.stroke();
			}

			// Center line
			ctx.strokeStyle = "#334155";
			ctx.beginPath();
			ctx.moveTo(padding, centerY);
			ctx.lineTo(width - padding, centerY);
			ctx.stroke();

			// Y-axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "12px monospace";
			ctx.textAlign = "right";
			ctx.fillText("+1", padding - 8, padding + 6);
			ctx.fillText("0", padding - 8, centerY + 4);
			ctx.fillText("-1", padding - 8, padding + plotHeight + 6);

			// Title
			ctx.fillStyle = "#94a3b8";
			ctx.font = "14px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Sampling a Signal", padding, 22);

			const timeWindow = 2;
			const startTime = currentTime;

			// Get samples for this window
			const samples = getSamples(startTime, timeWindow, fs, freq);

			// Draw original continuous signal (faded)
			ctx.beginPath();
			ctx.strokeStyle = "rgba(34, 197, 94, 0.3)";
			ctx.lineWidth = 2;
			for (let i = 0; i <= 400; i++) {
				const t = startTime + (timeWindow * i) / 400;
				const x = padding + (plotWidth * i) / 400;
				const y = centerY - (plotHeight / 2) * 0.8 * Math.sin(2 * Math.PI * freq * t);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw reconstructed signal if enabled
			if (showReconst && samples.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#f97316";
				ctx.lineWidth = 2;
				for (let i = 0; i <= 400; i++) {
					const t = startTime + (timeWindow * i) / 400;
					const x = padding + (plotWidth * i) / 400;
					const reconstructedValue = reconstructLinear(t, samples);
					const y = centerY - (plotHeight / 2) * 0.8 * reconstructedValue;
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			}

			// Draw sample points with stems
			ctx.strokeStyle = "#3b82f6";
			ctx.fillStyle = "#3b82f6";
			ctx.lineWidth = 2;

			for (const sample of samples) {
				const x = padding + ((sample.t - startTime) / timeWindow) * plotWidth;
				const y = centerY - (plotHeight / 2) * 0.8 * sample.value;

				// Draw stem
				ctx.beginPath();
				ctx.moveTo(x, centerY);
				ctx.lineTo(x, y);
				ctx.stroke();

				// Draw sample point
				ctx.beginPath();
				ctx.arc(x, y, 5, 0, Math.PI * 2);
				ctx.fill();
			}

			// Legend
			const legendY = height - 12;
			ctx.font = "11px sans-serif";

			// Original signal
			ctx.fillStyle = "rgba(34, 197, 94, 0.5)";
			ctx.fillRect(padding, legendY - 8, 12, 3);
			ctx.fillStyle = "#22c55e";
			ctx.textAlign = "left";
			ctx.fillText("Original", padding + 16, legendY);

			// Samples
			ctx.fillStyle = "#3b82f6";
			ctx.beginPath();
			ctx.arc(padding + 90, legendY - 6, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillText("Samples", padding + 100, legendY);

			// Reconstructed
			if (showReconst) {
				ctx.fillStyle = "#f97316";
				ctx.fillRect(padding + 175, legendY - 8, 12, 3);
				ctx.fillText("Reconstructed", padding + 191, legendY);
			}

			// Nyquist warning
			const nyquist = fs / 2;
			if (freq > nyquist) {
				ctx.fillStyle = "#ef4444";
				ctx.font = "12px monospace";
				ctx.textAlign = "right";
				ctx.fillText(`⚠ Aliasing! f > fs/2`, width - padding, 22);
			}
		},
		[getSamples, reconstructLinear],
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
			draw(ctx, time, frequency, sampleRate, showRecon);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, frequency, sampleRate, showRecon]);

	const handleReset = () => {
		setTime(0);
		setFrequency(initialFrequency);
		setSampleRate(initialSampleRate);
		setShowRecon(showReconstruction);
	};

	const nyquist = sampleRate / 2;
	const isAliasing = frequency > nyquist;

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
					<label className="text-sm font-mono text-zinc-400 w-24">Signal freq</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className={`absolute left-0 top-0 h-full rounded-lg ${isAliasing ? "bg-red-500" : "bg-emerald-500"}`}
							style={{ width: `${((frequency - 0.5) / 9.5) * 100}%` }}
						/>
						<input
							type="range"
							min="0.5"
							max="10"
							step="0.1"
							value={frequency}
							onChange={(e) => setFrequency(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 pointer-events-none ${isAliasing ? "bg-red-500 border-red-300" : "bg-emerald-500 border-emerald-300"}`}
							style={{ left: `calc(${((frequency - 0.5) / 9.5) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className={`text-sm font-mono w-16 text-right ${isAliasing ? "text-red-400" : "text-emerald-400"}`}
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{frequency.toFixed(1)} Hz
					</span>
				</div>

				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-24">Sample rate</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${((sampleRate - 2) / 48) * 100}%` }}
						/>
						<input
							type="range"
							min="2"
							max="50"
							step="1"
							value={sampleRate}
							onChange={(e) => setSampleRate(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${((sampleRate - 2) / 48) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-blue-400 w-16 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{sampleRate} Hz
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
					<button
						type="button"
						onClick={() => setShowRecon(!showRecon)}
						className={`p-2.5 rounded-xl transition-all ${showRecon ? "bg-orange-600/20 hover:bg-orange-600/30" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700"}`}
						title={showRecon ? "Hide Reconstruction" : "Show Reconstruction"}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke={showRecon ? "#f97316" : "#a1a1aa"}
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M3 3v18h18" />
							<path d="m19 9-5 5-4-4-3 3" />
						</svg>
					</button>
				</div>
				<div className="flex gap-2 font-mono text-xs flex-wrap">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px]">Nyquist</span>
						<span
							className="text-blue-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{nyquist.toFixed(1)} Hz
						</span>
					</div>
					<div className={`px-2 py-1.5 rounded-xl flex flex-col items-center min-w-[70px] ${isAliasing ? "bg-red-900/30" : "bg-zinc-900"}`}>
						<span className="text-zinc-500 text-[10px]">Status</span>
						<span
							className={isAliasing ? "text-red-400" : "text-emerald-400"}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{isAliasing ? "Aliasing!" : "OK"}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

