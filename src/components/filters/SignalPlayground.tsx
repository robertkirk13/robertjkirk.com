import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 300;

interface SignalPlaygroundProps {
	showNoise?: boolean;
	initialFrequency?: number;
	initialNoiseLevel?: number;
}

export default function SignalPlayground({
	showNoise = true,
	initialFrequency = 2,
	initialNoiseLevel = 0.3,
}: SignalPlaygroundProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [frequency, setFrequency] = useState(initialFrequency);
	const [noiseLevel, setNoiseLevel] = useState(showNoise ? initialNoiseLevel : 0);
	const [showClean, setShowClean] = useState(true);
	const animationRef = useRef<number>();
	const noiseRef = useRef<number[]>([]);

	// Generate stable noise
	useEffect(() => {
		noiseRef.current = Array.from({ length: 1000 }, () => Math.random() * 2 - 1);
	}, []);

	const getNoise = useCallback((index: number) => {
		return noiseRef.current[Math.abs(Math.floor(index)) % noiseRef.current.length];
	}, []);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			freq: number,
			noise: number,
			showCleanSignal: boolean,
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
			ctx.fillText(noise > 0 ? "Real-World Signals: Clean + Noise" : "Ideal Signal (No Noise)", padding, 22);

			const timeWindow = 2;
			const startTime = currentTime;
			const numPoints = 400;

			// Draw clean signal (faded) if enabled
			if (showCleanSignal) {
				ctx.beginPath();
				ctx.strokeStyle = "rgba(34, 197, 94, 0.4)";
				ctx.lineWidth = 2;
				for (let i = 0; i <= numPoints; i++) {
					const t = startTime + (timeWindow * i) / numPoints;
					const x = padding + (plotWidth * i) / numPoints;
					const cleanValue = Math.sin(2 * Math.PI * freq * t);
					const y = centerY - (plotHeight / 2) * 0.8 * cleanValue;
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			}

			// Draw noisy signal
			ctx.beginPath();
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			for (let i = 0; i <= numPoints; i++) {
				const t = startTime + (timeWindow * i) / numPoints;
				const x = padding + (plotWidth * i) / numPoints;
				const cleanValue = Math.sin(2 * Math.PI * freq * t);
				const noiseValue = getNoise(Math.floor(t * 100)) * noise;
				const y = centerY - (plotHeight / 2) * 0.8 * (cleanValue + noiseValue);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Legend
			const legendY = height - 12;
			ctx.font = "11px sans-serif";

			if (showCleanSignal) {
				ctx.fillStyle = "rgba(34, 197, 94, 0.6)";
				ctx.fillRect(padding, legendY - 8, 12, 3);
				ctx.fillStyle = "#22c55e";
				ctx.textAlign = "left";
				ctx.fillText("Clean signal", padding + 16, legendY);
			}

			ctx.fillStyle = "#3b82f6";
			ctx.fillRect(padding + 110, legendY - 8, 12, 3);
			ctx.fillText("Measured", padding + 126, legendY);
		},
		[getNoise],
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
			draw(ctx, time, frequency, noiseLevel, showClean);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, frequency, noiseLevel, showClean]);

	const handleReset = () => {
		setTime(0);
		setFrequency(initialFrequency);
		setNoiseLevel(showNoise ? initialNoiseLevel : 0);
		setShowClean(true);
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
					<label className="text-sm font-mono text-zinc-400 w-24">Frequency</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-emerald-500 rounded-lg"
							style={{ width: `${((frequency - 0.5) / 4.5) * 100}%` }}
						/>
						<input
							type="range"
							min="0.5"
							max="5"
							step="0.1"
							value={frequency}
							onChange={(e) => setFrequency(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-emerald-500 rounded-full border-2 border-emerald-300 pointer-events-none"
							style={{ left: `calc(${((frequency - 0.5) / 4.5) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-emerald-400 w-16 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{frequency.toFixed(1)} Hz
					</span>
				</div>

				{showNoise && (
					<div className="flex items-center gap-4">
						<label className="text-sm font-mono text-zinc-400 w-24">Noise</label>
						<div className="flex-1 relative h-2">
							<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
							<div
								className="absolute left-0 top-0 h-full bg-red-500 rounded-lg"
								style={{ width: `${noiseLevel * 100}%` }}
							/>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={noiseLevel}
								onChange={(e) => setNoiseLevel(parseFloat(e.target.value))}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							/>
							<div
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-red-500 rounded-full border-2 border-red-300 pointer-events-none"
								style={{ left: `calc(${noiseLevel * 100}% - 8px)` }}
							/>
						</div>
						<span
							className="text-sm font-mono text-red-400 w-16 text-right"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{(noiseLevel * 100).toFixed(0)}%
						</span>
					</div>
				)}
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
						onClick={() => setShowClean(!showClean)}
						className={`p-2.5 rounded-xl transition-all ${showClean ? "bg-emerald-600/20 hover:bg-emerald-600/30" : "bg-zinc-900 hover:bg-zinc-800"}`}
						title={showClean ? "Hide clean signal" : "Show clean signal"}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke={showClean ? "#22c55e" : "#a1a1aa"}
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					</button>
				</div>
				<div className="flex gap-2 font-mono text-xs">
					<div className="px-3 py-1.5 bg-zinc-900 rounded-xl text-center">
						<span className="text-zinc-400">The goal: </span>
						<span className="text-emerald-400">recover the clean signal</span>
					</div>
				</div>
			</div>
		</div>
	);
}

