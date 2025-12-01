import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 320;

export default function GyroscopeDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [gyroBias, setGyroBias] = useState(0.02); // deg/frame bias
	const animationRef = useRef<number>();

	// State for integrated angle and history
	const trueAngleRef = useRef(0);
	const gyroAngleRef = useRef(0);
	const historyRef = useRef<
		{ t: number; trueAngle: number; gyroAngle: number }[]
	>([]);

	// Generate smooth random motion for true angle
	const motionRef = useRef({
		phase1: Math.random() * Math.PI * 2,
		phase2: Math.random() * Math.PI * 2,
		freq1: 0.3 + Math.random() * 0.2,
		freq2: 0.7 + Math.random() * 0.3,
	});

	const getTrueAngle = useCallback((t: number) => {
		const motion = motionRef.current;
		return (
			30 * Math.sin(motion.freq1 * t + motion.phase1) +
			15 * Math.sin(motion.freq2 * t + motion.phase2)
		);
	}, []);

	const getTrueAngularVelocity = useCallback((t: number) => {
		const motion = motionRef.current;
		return (
			30 * motion.freq1 * Math.cos(motion.freq1 * t + motion.phase1) +
			15 * motion.freq2 * Math.cos(motion.freq2 * t + motion.phase2)
		);
	}, []);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			history: { t: number; trueAngle: number; gyroAngle: number }[],
			trueAngle: number,
			gyroAngle: number,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Plot area
			const plotX = 30;
			const plotY = 40;
			const plotWidth = width - 60;
			const plotHeight = height - 90;

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
			ctx.fillText("Angle over time (gyroscope integration drift)", plotX, 22);

			// Y-axis labels (angle range: -90 to +90)
			ctx.fillStyle = "#64748b";
			ctx.font = "11px monospace";
			ctx.textAlign = "right";
			ctx.fillText("+90°", plotX - 5, plotY + 6);
			ctx.fillText("0°", plotX - 5, plotY + plotHeight / 2 + 4);
			ctx.fillText("−90°", plotX - 5, plotY + plotHeight + 4);

			// Time window
			const timeWindow = 15;
			const startTime = Math.max(0, currentTime - timeWindow);

			// Filter history to visible range
			const visibleHistory = history.filter(
				(h) => h.t >= startTime && h.t <= currentTime,
			);

			// Draw true angle line
			if (visibleHistory.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#22c55e";
				ctx.lineWidth = 3;
				for (let i = 0; i < visibleHistory.length; i++) {
					const h = visibleHistory[i];
					const x = plotX + ((h.t - startTime) / timeWindow) * plotWidth;
					const y = plotY + plotHeight / 2 - (h.trueAngle / 90) * (plotHeight / 2);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			}

			// Draw gyro integrated angle line
			if (visibleHistory.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#a855f7";
				ctx.lineWidth = 3;
				for (let i = 0; i < visibleHistory.length; i++) {
					const h = visibleHistory[i];
					const x = plotX + ((h.t - startTime) / timeWindow) * plotWidth;
					const y =
						plotY + plotHeight / 2 - (h.gyroAngle / 90) * (plotHeight / 2);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			}

			// Current values indicator
			const currentX = plotX + plotWidth;

			// True angle indicator
			const trueY =
				plotY + plotHeight / 2 - (trueAngle / 90) * (plotHeight / 2);
			ctx.beginPath();
			ctx.arc(currentX, Math.max(plotY, Math.min(plotY + plotHeight, trueY)), 5, 0, Math.PI * 2);
			ctx.fillStyle = "#22c55e";
			ctx.fill();

			// Gyro angle indicator
			const gyroY =
				plotY + plotHeight / 2 - (gyroAngle / 90) * (plotHeight / 2);
			ctx.beginPath();
			ctx.arc(currentX, Math.max(plotY, Math.min(plotY + plotHeight, gyroY)), 5, 0, Math.PI * 2);
			ctx.fillStyle = "#a855f7";
			ctx.fill();

			// Legend
			const legendY = height - 20;
			ctx.fillStyle = "#22c55e";
			ctx.fillRect(plotX, legendY - 8, 12, 3);
			ctx.font = "12px sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("True angle", plotX + 18, legendY);

			ctx.fillStyle = "#a855f7";
			ctx.fillRect(plotX + 120, legendY - 8, 12, 3);
			ctx.fillStyle = "#a855f7";
			ctx.fillText("Gyro integrated", plotX + 138, legendY);

			// Drift indicator
			const drift = gyroAngle - trueAngle;
			ctx.fillStyle = "#ef4444";
			ctx.font = "12px monospace";
			ctx.textAlign = "right";
			ctx.fillText(
				`Drift: ${drift >= 0 ? "+" : ""}${drift.toFixed(1)}°`,
				width - 20,
				legendY,
			);
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
				setTime((t) => {
					const dt = 1 / 60;
					const newTime = t + dt;

					// Update true angle
					const newTrueAngle = getTrueAngle(newTime);
					trueAngleRef.current = newTrueAngle;

					// Get gyro reading (true angular velocity + bias + noise)
					const trueRate = getTrueAngularVelocity(newTime);
					const gyroRate =
						trueRate + gyroBias * 60 + (Math.random() - 0.5) * 2; // bias in deg/s

					// Integrate gyro to get angle
					gyroAngleRef.current += gyroRate * dt;

					// Store in history
					historyRef.current.push({
						t: newTime,
						trueAngle: newTrueAngle,
						gyroAngle: gyroAngleRef.current,
					});

					// Keep only recent history
					if (historyRef.current.length > 1000) {
						historyRef.current.shift();
					}

					return newTime;
				});
			}

			draw(
				ctx,
				time,
				historyRef.current,
				trueAngleRef.current,
				gyroAngleRef.current,
			);
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
		gyroBias,
		getTrueAngle,
		getTrueAngularVelocity,
	]);

	const handleReset = () => {
		setTime(0);
		trueAngleRef.current = getTrueAngle(0);
		gyroAngleRef.current = getTrueAngle(0);
		historyRef.current = [];
		motionRef.current = {
			phase1: Math.random() * Math.PI * 2,
			phase2: Math.random() * Math.PI * 2,
			freq1: 0.3 + Math.random() * 0.2,
			freq2: 0.7 + Math.random() * 0.3,
		};
	};

	const drift = gyroAngleRef.current - trueAngleRef.current;

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
					<label className="text-sm font-mono text-zinc-400 w-20">
						Gyro Bias
					</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-purple-500 rounded-lg"
							style={{ width: `${(gyroBias / 0.1) * 100}%` }}
						/>
						<input
							type="range"
							min="0"
							max="0.1"
							step="0.005"
							value={gyroBias}
							onChange={(e) => setGyroBias(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-full border-2 border-purple-300 pointer-events-none"
							style={{ left: `calc(${(gyroBias / 0.1) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-purple-400 w-20 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{(gyroBias * 60).toFixed(1)}°/s
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
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px]">Drift</span>
						<span
							className={`${Math.abs(drift) > 20 ? "text-red-400" : "text-amber-400"}`}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{drift >= 0 ? "+" : ""}
							{drift.toFixed(1)}°
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

