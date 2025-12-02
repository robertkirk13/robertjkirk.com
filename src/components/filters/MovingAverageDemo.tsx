import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 340;

interface MovingAverageDemoProps {
	initialWindowSize?: number;
	showWeights?: boolean;
}

export default function MovingAverageDemo({
	initialWindowSize = 5,
	showWeights = false,
}: MovingAverageDemoProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [windowSize, setWindowSize] = useState(initialWindowSize);
	const [noiseLevel] = useState(0.4);
	const animationRef = useRef<number>();
	const noiseRef = useRef<number[]>([]);

	// Generate stable noise
	useEffect(() => {
		noiseRef.current = Array.from({ length: 2000 }, () => Math.random() * 2 - 1);
	}, []);

	const getNoise = useCallback((index: number) => {
		return noiseRef.current[Math.abs(Math.floor(index)) % noiseRef.current.length];
	}, []);

	// Generate signal at a given point
	const getSignal = useCallback(
		(t: number, withNoise: boolean = true) => {
			const clean = Math.sin(2 * Math.PI * 1.5 * t);
			if (!withNoise) return clean;
			const noise = getNoise(Math.floor(t * 60)) * noiseLevel;
			return clean + noise;
		},
		[getNoise, noiseLevel],
	);

	// Apply moving average
	const applyMovingAverage = useCallback(
		(t: number, window: number) => {
			let sum = 0;
			const dt = 1 / 60; // Sample interval
			for (let i = 0; i < window; i++) {
				sum += getSignal(t - i * dt, true);
			}
			return sum / window;
		},
		[getSignal],
	);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			window: number,
			showWeightsPanel: boolean,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;
			const plotHeight = showWeightsPanel ? (height - 100) * 0.6 : height - 2 * padding;
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

			// Title
			ctx.fillStyle = "#94a3b8";
			ctx.font = "14px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Moving Average Filter", padding, 22);

			const timeWindow = 2;
			const startTime = currentTime;
			const numPoints = 300;

			// Draw noisy signal
			ctx.beginPath();
			ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
			ctx.lineWidth = 1.5;
			for (let i = 0; i <= numPoints; i++) {
				const t = startTime + (timeWindow * i) / numPoints;
				const x = padding + (plotWidth * i) / numPoints;
				const value = getSignal(t, true);
				const y = centerY - (plotHeight / 2) * 0.8 * value;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw filtered signal
			ctx.beginPath();
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 2.5;
			for (let i = 0; i <= numPoints; i++) {
				const t = startTime + (timeWindow * i) / numPoints;
				const x = padding + (plotWidth * i) / numPoints;
				const value = applyMovingAverage(t, window);
				const y = centerY - (plotHeight / 2) * 0.8 * value;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw clean signal (reference)
			ctx.beginPath();
			ctx.strokeStyle = "rgba(34, 197, 94, 0.5)";
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 4]);
			for (let i = 0; i <= numPoints; i++) {
				const t = startTime + (timeWindow * i) / numPoints;
				const x = padding + (plotWidth * i) / numPoints;
				const value = getSignal(t, false);
				const y = centerY - (plotHeight / 2) * 0.8 * value;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();
			ctx.setLineDash([]);

			// Draw averaging window visualization
			const windowCenterX = padding + plotWidth * 0.7;
			const windowWidth = Math.min((window / 60) * (plotWidth / timeWindow), plotWidth * 0.3);
			const windowStartX = windowCenterX - windowWidth;

			// Highlight the averaging window
			ctx.fillStyle = "rgba(249, 115, 22, 0.15)";
			ctx.fillRect(windowStartX, padding, windowWidth, plotHeight);
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 1;
			ctx.strokeRect(windowStartX, padding, windowWidth, plotHeight);

			// Draw sample points being averaged
			const dt = 1 / 60;
			const centerTime = startTime + timeWindow * 0.7;
			ctx.fillStyle = "#f97316";
			for (let i = 0; i < Math.min(window, 15); i++) {
				const sampleTime = centerTime - i * dt;
				const x = padding + ((sampleTime - startTime) / timeWindow) * plotWidth;
				const value = getSignal(sampleTime, true);
				const y = centerY - (plotHeight / 2) * 0.8 * value;
				ctx.beginPath();
				ctx.arc(x, y, 4, 0, Math.PI * 2);
				ctx.fill();
			}

			// Draw weights visualization if enabled
			if (showWeightsPanel) {
				const weightsY = padding + plotHeight + 40;
				const weightsHeight = 60;
				const barWidth = Math.min(20, (plotWidth - 40) / window);
				const totalWidth = barWidth * window;
				const startX = padding + (plotWidth - totalWidth) / 2;

				ctx.fillStyle = "#64748b";
				ctx.font = "12px monospace";
				ctx.textAlign = "center";
				ctx.fillText("Filter Weights (all equal = 1/N)", width / 2, weightsY - 10);

				for (let i = 0; i < window; i++) {
					const x = startX + i * barWidth;
					const barHeight = weightsHeight * 0.8;
					ctx.fillStyle = "#f97316";
					ctx.fillRect(x + 2, weightsY + weightsHeight - barHeight, barWidth - 4, barHeight);
				}

				// Label
				ctx.fillStyle = "#94a3b8";
				ctx.font = "11px monospace";
				ctx.fillText(`1/${window} each`, width / 2, weightsY + weightsHeight + 15);
			}

			// Legend
			const legendY = height - 12;
			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";

			ctx.fillStyle = "rgba(59, 130, 246, 0.6)";
			ctx.fillRect(padding, legendY - 8, 12, 3);
			ctx.fillStyle = "#3b82f6";
			ctx.fillText("Noisy", padding + 16, legendY);

			ctx.fillStyle = "#f97316";
			ctx.fillRect(padding + 70, legendY - 8, 12, 3);
			ctx.fillText("Filtered", padding + 86, legendY);

			ctx.strokeStyle = "rgba(34, 197, 94, 0.6)";
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(padding + 150, legendY - 6);
			ctx.lineTo(padding + 162, legendY - 6);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = "#22c55e";
			ctx.fillText("Original", padding + 168, legendY);
		},
		[getSignal, applyMovingAverage],
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
			draw(ctx, time, windowSize, showWeights);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, windowSize, showWeights]);

	const handleReset = () => {
		setTime(0);
		setWindowSize(initialWindowSize);
	};

	// Calculate delay introduced by the filter
	const delayMs = ((windowSize - 1) / 2 / 60 * 1000).toFixed(1);

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
					<label className="text-sm font-mono text-zinc-400 w-28">Window Size</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-orange-500 rounded-lg"
							style={{ width: `${((windowSize - 1) / 29) * 100}%` }}
						/>
						<input
							type="range"
							min="1"
							max="30"
							step="1"
							value={windowSize}
							onChange={(e) => setWindowSize(parseInt(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-orange-500 rounded-full border-2 border-orange-300 pointer-events-none"
							style={{ left: `calc(${((windowSize - 1) / 29) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-orange-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{windowSize}
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
						<span className="text-zinc-500 text-[10px]">Formula</span>
						<span className="text-orange-400">Σ/N</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px]">Delay</span>
						<span className="text-blue-400">{delayMs}ms</span>
					</div>
					<div className={`px-2 py-1.5 rounded-xl flex flex-col items-center min-w-[70px] ${windowSize > 15 ? "bg-amber-900/30" : "bg-zinc-900"}`}>
						<span className="text-zinc-500 text-[10px]">Smoothing</span>
						<span className={windowSize > 15 ? "text-amber-400" : "text-emerald-400"}>
							{windowSize <= 5 ? "Light" : windowSize <= 15 ? "Medium" : "Heavy"}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

