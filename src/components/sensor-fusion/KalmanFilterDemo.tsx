import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 380;

export default function KalmanFilterDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [processNoise, setProcessNoise] = useState(0.1); // Q
	const [measurementNoise, setMeasurementNoise] = useState(0.5); // R
	const animationRef = useRef<number>();

	// Kalman filter state
	const estimateRef = useRef(0);
	const uncertaintyRef = useRef(1);
	const trueStateRef = useRef(0);

	// History for plotting
	const historyRef = useRef<
		{
			t: number;
			trueState: number;
			measurement: number;
			estimate: number;
			uncertainty: number;
		}[]
	>([]);

	// Motion model
	const motionRef = useRef({
		phase: Math.random() * Math.PI * 2,
		freq: 0.2 + Math.random() * 0.1,
	});

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			history: {
				t: number;
				trueState: number;
				measurement: number;
				estimate: number;
				uncertainty: number;
			}[],
			kalmanGain: number,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Plot area
			const plotX = 50;
			const plotY = 45;
			const plotWidth = width - 80;
			const plotHeight = height - 120;

			// Grid
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 4; i++) {
				const y = plotY + (plotHeight * i) / 4;
				ctx.beginPath();
				ctx.moveTo(plotX, y);
				ctx.lineTo(plotX + plotWidth, y);
				ctx.stroke();
			}

			// Title
			ctx.fillStyle = "#94a3b8";
			ctx.font = "14px monospace";
			ctx.textAlign = "left";
			ctx.fillText("1D Kalman Filter", plotX, 22);

			// Y-axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "11px monospace";
			ctx.textAlign = "right";
			ctx.fillText("1.0", plotX - 5, plotY + 6);
			ctx.fillText("0.5", plotX - 5, plotY + plotHeight / 2 + 4);
			ctx.fillText("0.0", plotX - 5, plotY + plotHeight + 4);

			// Time window
			const timeWindow = 12;
			const startTime = Math.max(0, currentTime - timeWindow);

			// Filter visible history
			const visibleHistory = history.filter(
				(h) => h.t >= startTime && h.t <= currentTime,
			);

			// Draw uncertainty band
			if (visibleHistory.length > 1) {
				ctx.beginPath();
				ctx.fillStyle = "rgba(34, 197, 94, 0.15)";

				// Upper bound
				for (let i = 0; i < visibleHistory.length; i++) {
					const h = visibleHistory[i];
					const x = plotX + ((h.t - startTime) / timeWindow) * plotWidth;
					const y =
						plotY +
						plotHeight * (1 - (h.estimate + h.uncertainty * 2));
					const clampedY = Math.max(plotY, Math.min(plotY + plotHeight, y));
					if (i === 0) ctx.moveTo(x, clampedY);
					else ctx.lineTo(x, clampedY);
				}

				// Lower bound (reverse)
				for (let i = visibleHistory.length - 1; i >= 0; i--) {
					const h = visibleHistory[i];
					const x = plotX + ((h.t - startTime) / timeWindow) * plotWidth;
					const y =
						plotY +
						plotHeight * (1 - (h.estimate - h.uncertainty * 2));
					const clampedY = Math.max(plotY, Math.min(plotY + plotHeight, y));
					ctx.lineTo(x, clampedY);
				}

				ctx.closePath();
				ctx.fill();
			}

			// Draw true state
			if (visibleHistory.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#22c55e";
				ctx.lineWidth = 2.5;
				for (let i = 0; i < visibleHistory.length; i++) {
					const h = visibleHistory[i];
					const x = plotX + ((h.t - startTime) / timeWindow) * plotWidth;
					const y = plotY + plotHeight * (1 - h.trueState);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			}

			// Draw measurements as dots
			ctx.fillStyle = "#3b82f6";
			for (const h of visibleHistory) {
				const x = plotX + ((h.t - startTime) / timeWindow) * plotWidth;
				const y = plotY + plotHeight * (1 - h.measurement);
				const clampedY = Math.max(plotY, Math.min(plotY + plotHeight, y));
				ctx.beginPath();
				ctx.arc(x, clampedY, 3, 0, Math.PI * 2);
				ctx.fill();
			}

			// Draw Kalman estimate
			if (visibleHistory.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#e879f9";
				ctx.lineWidth = 3;
				for (let i = 0; i < visibleHistory.length; i++) {
					const h = visibleHistory[i];
					const x = plotX + ((h.t - startTime) / timeWindow) * plotWidth;
					const y = plotY + plotHeight * (1 - h.estimate);
					const clampedY = Math.max(plotY, Math.min(plotY + plotHeight, y));
					if (i === 0) ctx.moveTo(x, clampedY);
					else ctx.lineTo(x, clampedY);
				}
				ctx.stroke();
			}

			// Legend
			const legendY = height - 45;
			const legendSpacing = 130;

			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";

			// True
			ctx.fillStyle = "#22c55e";
			ctx.fillRect(plotX, legendY - 6, 12, 3);
			ctx.fillText("True state", plotX + 16, legendY);

			// Measurement
			ctx.fillStyle = "#3b82f6";
			ctx.beginPath();
			ctx.arc(plotX + legendSpacing, legendY - 4, 3, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillText("Measurement", plotX + legendSpacing + 8, legendY);

			// Estimate
			ctx.fillStyle = "#e879f9";
			ctx.fillRect(plotX + legendSpacing * 2, legendY - 6, 12, 3);
			ctx.fillText("Kalman estimate", plotX + legendSpacing * 2 + 16, legendY);

			// Uncertainty band
			ctx.fillStyle = "rgba(34, 197, 94, 0.3)";
			ctx.fillRect(plotX + legendSpacing * 3.2, legendY - 8, 12, 10);
			ctx.fillStyle = "#22c55e";
			ctx.fillText("±2σ", plotX + legendSpacing * 3.2 + 16, legendY);

			// Kalman gain display
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "right";
			ctx.fillText(`Kalman Gain K = ${kalmanGain.toFixed(3)}`, width - 20, 22);
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

	// Calculate Kalman gain
	const kalmanGain =
		uncertaintyRef.current /
		(uncertaintyRef.current + measurementNoise);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx || !isVisible) return;

		const loop = () => {
			if (isRunning) {
				setTime((t) => {
					const dt = 1 / 60;
					const newTime = t + dt;

					// True state (smooth sinusoidal)
					const motion = motionRef.current;
					trueStateRef.current =
						0.5 +
						0.3 * Math.sin(motion.freq * newTime + motion.phase) +
						0.1 * Math.sin(motion.freq * 2.3 * newTime);

					// Take measurement every ~0.2 seconds
					const shouldMeasure = Math.floor(newTime / 0.15) > Math.floor(t / 0.15);

					if (shouldMeasure) {
						// Noisy measurement
						const measurement =
							trueStateRef.current +
							(Math.random() - 0.5) * 2 * Math.sqrt(measurementNoise);

						// Kalman predict step
						// In 1D with constant velocity model: x_pred = x_prev
						const predictedEstimate = estimateRef.current;
						const predictedUncertainty =
							uncertaintyRef.current + processNoise;

						// Kalman update step
						const K =
							predictedUncertainty /
							(predictedUncertainty + measurementNoise);
						estimateRef.current =
							predictedEstimate + K * (measurement - predictedEstimate);
						uncertaintyRef.current = (1 - K) * predictedUncertainty;

						// Store history
						historyRef.current.push({
							t: newTime,
							trueState: trueStateRef.current,
							measurement: measurement,
							estimate: estimateRef.current,
							uncertainty: Math.sqrt(uncertaintyRef.current),
						});

						// Trim history
						if (historyRef.current.length > 500) {
							historyRef.current.shift();
						}
					}

					return newTime;
				});
			}

			draw(ctx, time, historyRef.current, kalmanGain);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [
		draw,
		isRunning,
		isVisible,
		time,
		processNoise,
		measurementNoise,
		kalmanGain,
	]);

	const handleReset = () => {
		setTime(0);
		estimateRef.current = 0.5;
		uncertaintyRef.current = 1;
		trueStateRef.current = 0.5;
		historyRef.current = [];
		motionRef.current = {
			phase: Math.random() * Math.PI * 2,
			freq: 0.2 + Math.random() * 0.1,
		};
	};

	const currentError = Math.abs(
		estimateRef.current - trueStateRef.current,
	);

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
					<label className="text-sm font-mono text-orange-400 w-20">
						Q (proc)
					</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-orange-500 rounded-lg"
							style={{ width: `${(processNoise / 0.5) * 100}%` }}
						/>
						<input
							type="range"
							min="0.01"
							max="0.5"
							step="0.01"
							value={processNoise}
							onChange={(e) => setProcessNoise(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-orange-500 rounded-full border-2 border-orange-300 pointer-events-none"
							style={{ left: `calc(${(processNoise / 0.5) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-orange-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{processNoise.toFixed(2)}
					</span>
				</div>

				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-blue-400 w-20">
						R (meas)
					</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${(measurementNoise / 2) * 100}%` }}
						/>
						<input
							type="range"
							min="0.05"
							max="2"
							step="0.05"
							value={measurementNoise}
							onChange={(e) => setMeasurementNoise(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${(measurementNoise / 2) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-blue-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{measurementNoise.toFixed(2)}
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
				<div className="flex gap-2 font-mono text-xs">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[60px]">
						<span className="text-zinc-500 text-[10px]">Gain K</span>
						<span
							className="text-emerald-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{kalmanGain.toFixed(2)}
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[60px]">
						<span className="text-zinc-500 text-[10px]">Error</span>
						<span
							className={currentError > 0.1 ? "text-amber-400" : "text-emerald-400"}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{currentError.toFixed(3)}
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[60px]">
						<span className="text-zinc-500 text-[10px]">σ</span>
						<span
							className="text-purple-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{Math.sqrt(uncertaintyRef.current).toFixed(3)}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

