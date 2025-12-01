import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 300;

export default function NoisySensorDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [noiseLevel, setNoiseLevel] = useState(0.15);
	const animationRef = useRef<number>();
	const measurementsRef = useRef<{ t: number; value: number; noise: number }[]>(
		[],
	);

	// True position function (smooth sinusoidal motion)
	const getTruePosition = useCallback((t: number) => {
		return 0.5 + 0.3 * Math.sin(t * 0.8) + 0.1 * Math.sin(t * 2.1);
	}, []);

	// Generate noisy measurement
	const getNoisyMeasurement = useCallback(
		(t: number, noise: number) => {
			const truePos = getTruePosition(t);
			return truePos + (Math.random() - 0.5) * 2 * noise;
		},
		[getTruePosition],
	);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			measurements: { t: number; value: number; noise: number }[],
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;
			const plotHeight = height - 2 * padding;

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

			// Y-axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "12px monospace";
			ctx.textAlign = "right";
			ctx.fillText("1.0", padding - 8, padding + 6);
			ctx.fillText("0.5", padding - 8, padding + plotHeight / 2 + 6);
			ctx.fillText("0.0", padding - 8, padding + plotHeight + 6);

			// Title
			ctx.fillStyle = "#94a3b8";
			ctx.font = "14px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Position over time", padding, 22);

			// Time window for display
			const timeWindow = 8;
			const startTime = Math.max(0, currentTime - timeWindow);

			// Draw true position line
			ctx.beginPath();
			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 3;
			for (let i = 0; i <= 200; i++) {
				const t = startTime + (timeWindow * i) / 200;
				const x = padding + (plotWidth * i) / 200;
				const y = padding + plotHeight * (1 - getTruePosition(t));
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw noisy measurements as dots
			const visibleMeasurements = measurements.filter(
				(m) => m.t >= startTime && m.t <= currentTime,
			);
			ctx.fillStyle = "#3b82f6";
			for (const m of visibleMeasurements) {
				const x = padding + ((m.t - startTime) / timeWindow) * plotWidth;
				const y = padding + plotHeight * (1 - m.value);
				ctx.beginPath();
				ctx.arc(x, y, 4, 0, Math.PI * 2);
				ctx.fill();
			}

			// Legend
			const legendY = height - 15;
			ctx.fillStyle = "#22c55e";
			ctx.fillRect(padding, legendY - 8, 12, 3);
			ctx.font = "12px sans-serif";
			ctx.fillStyle = "#22c55e";
			ctx.textAlign = "left";
			ctx.fillText("True position", padding + 18, legendY);

			ctx.fillStyle = "#3b82f6";
			ctx.beginPath();
			ctx.arc(padding + 130, legendY - 6, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#3b82f6";
			ctx.fillText("Sensor reading", padding + 140, legendY);
		},
		[getTruePosition],
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

		let lastMeasurementTime = time;

		const loop = () => {
			if (isRunning) {
				setTime((t) => {
					const newTime = t + 1 / 60;

					// Add measurement every ~0.1 seconds
					if (newTime - lastMeasurementTime > 0.1) {
						const measurement = getNoisyMeasurement(newTime, noiseLevel);
						measurementsRef.current.push({
							t: newTime,
							value: measurement,
							noise: noiseLevel,
						});
						// Keep only recent measurements
						if (measurementsRef.current.length > 100) {
							measurementsRef.current.shift();
						}
						lastMeasurementTime = newTime;
					}

					return newTime;
				});
			}
			draw(ctx, time, measurementsRef.current);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, noiseLevel, getNoisyMeasurement]);

	const handleReset = () => {
		setTime(0);
		measurementsRef.current = [];
		setNoiseLevel(0.15);
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
					<label className="text-sm font-mono text-zinc-400 w-16">Noise</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-red-500 rounded-lg"
							style={{ width: `${(noiseLevel / 0.4) * 100}%` }}
						/>
						<input
							type="range"
							min="0.02"
							max="0.4"
							step="0.01"
							value={noiseLevel}
							onChange={(e) => setNoiseLevel(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-red-500 rounded-full border-2 border-red-300 pointer-events-none"
							style={{ left: `calc(${(noiseLevel / 0.4) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-red-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{noiseLevel.toFixed(2)}
					</span>
				</div>
			</div>

			<div className="flex justify-between items-center">
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
				<div className="flex gap-2 font-mono text-xs">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[60px]">
						<span className="text-zinc-500 text-[10px]">Time</span>
						<span
							className="text-zinc-300"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{time.toFixed(1)}s
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

