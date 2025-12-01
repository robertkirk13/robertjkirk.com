import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;

type ReconstructionMethod = "zoh" | "linear" | "sinc";

export default function ReconstructionDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [frequency, setFrequency] = useState(2);
	const [sampleRate, setSampleRate] = useState(12);
	const [method, setMethod] = useState<ReconstructionMethod>("linear");
	const animationRef = useRef<number>();

	// Sinc function
	const sinc = useCallback((x: number): number => {
		if (Math.abs(x) < 1e-10) return 1;
		return Math.sin(Math.PI * x) / (Math.PI * x);
	}, []);

	// Generate samples
	const getSamples = useCallback(
		(startTime: number, timeWindow: number, fs: number, freq: number) => {
			const samples: { t: number; value: number }[] = [];
			const samplePeriod = 1 / fs;
			const firstSampleIndex = Math.ceil((startTime - 0.5) / samplePeriod);
			const lastSampleIndex = Math.floor((startTime + timeWindow + 0.5) / samplePeriod);

			for (let i = firstSampleIndex; i <= lastSampleIndex; i++) {
				const t = i * samplePeriod;
				const value = Math.sin(2 * Math.PI * freq * t);
				samples.push({ t, value });
			}
			return samples;
		},
		[],
	);

	// Zero-Order Hold reconstruction
	const reconstructZOH = useCallback(
		(t: number, samples: { t: number; value: number }[]) => {
			if (samples.length === 0) return 0;
			
			// Find the most recent sample
			let lastSample = samples[0];
			for (const sample of samples) {
				if (sample.t <= t) {
					lastSample = sample;
				} else {
					break;
				}
			}
			return lastSample.value;
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

			const alpha = (t - left.t) / (right.t - left.t);
			return left.value * (1 - alpha) + right.value * alpha;
		},
		[],
	);

	// Sinc (ideal) reconstruction
	const reconstructSinc = useCallback(
		(t: number, samples: { t: number; value: number }[], fs: number) => {
			if (samples.length === 0) return 0;

			let value = 0;
			const T = 1 / fs;

			// Sum contributions from nearby samples (windowed for efficiency)
			for (const sample of samples) {
				const delta = (t - sample.t) / T;
				if (Math.abs(delta) < 10) {
					// Window to nearby samples
					value += sample.value * sinc(delta);
				}
			}
			return value;
		},
		[sinc],
	);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			freq: number,
			fs: number,
			reconstructMethod: ReconstructionMethod,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;
			const plotHeight = height - 2 * padding - 50;
			const centerY = padding + plotHeight / 2;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Grid
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
			ctx.font = "11px monospace";
			ctx.textAlign = "right";
			ctx.fillText("+1", padding - 8, padding + 6);
			ctx.fillText("0", padding - 8, centerY + 4);
			ctx.fillText("-1", padding - 8, padding + plotHeight + 6);

			// Title
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			const methodNames = {
				zoh: "Zero-Order Hold",
				linear: "Linear Interpolation",
				sinc: "Sinc (Ideal) Reconstruction",
			};
			ctx.fillText(`Reconstruction: ${methodNames[reconstructMethod]}`, padding, padding - 12);

			const timeWindow = 2;
			const samples = getSamples(currentTime, timeWindow, fs, freq);

			// Draw original continuous signal (faded)
			ctx.beginPath();
			ctx.strokeStyle = "rgba(34, 197, 94, 0.25)";
			ctx.lineWidth = 2;
			for (let i = 0; i <= 400; i++) {
				const t = currentTime + (timeWindow * i) / 400;
				const x = padding + (plotWidth * i) / 400;
				const y = centerY - (plotHeight / 2) * 0.85 * Math.sin(2 * Math.PI * freq * t);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw reconstructed signal
			const methodColors = {
				zoh: "#f97316",
				linear: "#3b82f6",
				sinc: "#a855f7",
			};

			ctx.beginPath();
			ctx.strokeStyle = methodColors[reconstructMethod];
			ctx.lineWidth = 2.5;

			for (let i = 0; i <= 400; i++) {
				const t = currentTime + (timeWindow * i) / 400;
				const x = padding + (plotWidth * i) / 400;
				let value: number;

				switch (reconstructMethod) {
					case "zoh":
						value = reconstructZOH(t, samples);
						break;
					case "linear":
						value = reconstructLinear(t, samples);
						break;
					case "sinc":
						value = reconstructSinc(t, samples, fs);
						break;
				}

				const y = centerY - (plotHeight / 2) * 0.85 * value;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw sample points with stems
			ctx.strokeStyle = "#3b82f6";
			ctx.fillStyle = "#3b82f6";
			ctx.lineWidth = 2;

			const visibleSamples = samples.filter(
				(s) => s.t >= currentTime && s.t <= currentTime + timeWindow
			);

			for (const sample of visibleSamples) {
				const x = padding + ((sample.t - currentTime) / timeWindow) * plotWidth;
				const y = centerY - (plotHeight / 2) * 0.85 * sample.value;

				// Stem
				ctx.beginPath();
				ctx.moveTo(x, centerY);
				ctx.lineTo(x, y);
				ctx.stroke();

				// Point
				ctx.beginPath();
				ctx.arc(x, y, 5, 0, Math.PI * 2);
				ctx.fill();
			}

			// Legend
			const legendY = height - 20;
			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";

			// Original
			ctx.fillStyle = "rgba(34, 197, 94, 0.5)";
			ctx.fillRect(padding, legendY - 8, 12, 3);
			ctx.fillStyle = "#22c55e";
			ctx.fillText("Original", padding + 16, legendY);

			// Samples
			ctx.fillStyle = "#3b82f6";
			ctx.beginPath();
			ctx.arc(padding + 100, legendY - 5, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillText("Samples", padding + 110, legendY);

			// Reconstructed
			ctx.fillStyle = methodColors[reconstructMethod];
			ctx.fillRect(padding + 195, legendY - 8, 12, 3);
			ctx.fillText("Reconstructed", padding + 211, legendY);

			// Method descriptions
			const descriptions = {
				zoh: "Holds each sample value until the next sample",
				linear: "Connects samples with straight lines",
				sinc: "Uses sinc function for perfect reconstruction (if no aliasing)",
			};

			ctx.fillStyle = "#64748b";
			ctx.font = "11px sans-serif";
			ctx.textAlign = "right";
			ctx.fillText(descriptions[reconstructMethod], width - padding, padding - 12);
		},
		[getSamples, reconstructZOH, reconstructLinear, reconstructSinc],
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
			draw(ctx, time, frequency, sampleRate, method);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, frequency, sampleRate, method]);

	const handleReset = () => {
		setTime(0);
		setFrequency(2);
		setSampleRate(12);
		setMethod("linear");
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
				{/* Method selector */}
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-20">Method</label>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => setMethod("zoh")}
							className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
								method === "zoh"
									? "bg-orange-600/30 text-orange-400 border border-orange-500/50"
									: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-transparent"
							}`}
						>
							ZOH
						</button>
						<button
							type="button"
							onClick={() => setMethod("linear")}
							className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
								method === "linear"
									? "bg-blue-600/30 text-blue-400 border border-blue-500/50"
									: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-transparent"
							}`}
						>
							Linear
						</button>
						<button
							type="button"
							onClick={() => setMethod("sinc")}
							className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
								method === "sinc"
									? "bg-purple-600/30 text-purple-400 border border-purple-500/50"
									: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-transparent"
							}`}
						>
							Sinc
						</button>
					</div>
				</div>

				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-20">Frequency</label>
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
							step="0.25"
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
						{frequency.toFixed(2)} Hz
					</span>
				</div>

				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-20">Sample rate</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${((sampleRate - 4) / 26) * 100}%` }}
						/>
						<input
							type="range"
							min="4"
							max="30"
							step="1"
							value={sampleRate}
							onChange={(e) => setSampleRate(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${((sampleRate - 4) / 26) * 100}% - 8px)` }}
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
				</div>
				<div className="flex gap-2 font-mono text-xs flex-wrap">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px]">Nyquist</span>
						<span
							className="text-yellow-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{nyquist} Hz
						</span>
					</div>
					<div className={`px-2 py-1.5 rounded-xl flex flex-col items-center min-w-[70px] ${isAliasing ? "bg-red-900/30" : "bg-zinc-900"}`}>
						<span className="text-zinc-500 text-[10px]">Status</span>
						<span
							className={isAliasing ? "text-red-400" : "text-emerald-400"}
						>
							{isAliasing ? "Aliasing" : "OK"}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

