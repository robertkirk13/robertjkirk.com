import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 280;

export default function ContinuousSignalDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [frequency, setFrequency] = useState(1.0);
	const [showZoom, setShowZoom] = useState(false);
	const animationRef = useRef<number>();

	const draw = useCallback(
		(ctx: CanvasRenderingContext2D, currentTime: number, freq: number, zoom: boolean) => {
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

			// Center line (zero)
			ctx.strokeStyle = "#334155";
			ctx.lineWidth = 1;
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
			ctx.fillText("Continuous Signal", padding, 22);

			// Time window
			const timeWindow = zoom ? 0.5 : 3;
			const startTime = currentTime;

			// Draw continuous sine wave with many points (simulating "infinite" resolution)
			const numPoints = zoom ? 1000 : 500;
			ctx.beginPath();
			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 2.5;

			for (let i = 0; i <= numPoints; i++) {
				const t = startTime + (timeWindow * i) / numPoints;
				const x = padding + (plotWidth * i) / numPoints;
				const y = centerY - (plotHeight / 2) * 0.8 * Math.sin(2 * Math.PI * freq * t);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw "infinite points" indicator when zoomed
			if (zoom) {
				ctx.fillStyle = "#22c55e";
				const dotSpacing = plotWidth / 40;
				for (let i = 0; i <= 40; i++) {
					const t = startTime + (timeWindow * i) / 40;
					const x = padding + dotSpacing * i;
					const y = centerY - (plotHeight / 2) * 0.8 * Math.sin(2 * Math.PI * freq * t);
					ctx.beginPath();
					ctx.arc(x, y, 3, 0, Math.PI * 2);
					ctx.fill();
				}
				
				// Show that there are infinite points between any two
				ctx.fillStyle = "#94a3b8";
				ctx.font = "11px sans-serif";
				ctx.textAlign = "center";
				ctx.fillText("Every point has a defined value", width / 2, height - 8);
			}

			// Legend
			if (!zoom) {
				const legendY = height - 15;
				ctx.fillStyle = "#22c55e";
				ctx.fillRect(padding, legendY - 8, 12, 3);
				ctx.font = "12px sans-serif";
				ctx.fillStyle = "#22c55e";
				ctx.textAlign = "left";
				ctx.fillText(`sin(2π · ${freq.toFixed(1)} · t)`, padding + 18, legendY);
			}
		},
		[],
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
			draw(ctx, time, frequency, showZoom);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, frequency, showZoom]);

	const handleReset = () => {
		setTime(0);
		setFrequency(1.0);
		setShowZoom(false);
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
					<label className="text-sm font-mono text-zinc-400 w-20">Frequency</label>
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
					<button
						type="button"
						onClick={() => setShowZoom(!showZoom)}
						className={`p-2.5 rounded-xl transition-all ${showZoom ? "bg-emerald-600/20 hover:bg-emerald-600/30" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700"}`}
						title={showZoom ? "Zoom Out" : "Zoom In"}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke={showZoom ? "#22c55e" : "#a1a1aa"}
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="11" cy="11" r="8" />
							<path d="m21 21-4.3-4.3" />
							{showZoom ? (
								<path d="M8 11h6" />
							) : (
								<>
									<path d="M11 8v6" />
									<path d="M8 11h6" />
								</>
							)}
						</svg>
					</button>
				</div>
				<div className="flex gap-2 font-mono text-xs">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[60px]">
						<span className="text-zinc-500 text-[10px]">Period</span>
						<span
							className="text-emerald-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{(1 / frequency).toFixed(2)}s
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

