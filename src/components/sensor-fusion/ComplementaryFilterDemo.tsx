import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 350;

export default function ComplementaryFilterDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [alpha, setAlpha] = useState(0.98);
	const [vibrationEnabled, setVibrationEnabled] = useState(false);
	const [targetAngle, setTargetAngle] = useState(0);
	const [isDragging, setIsDragging] = useState(false);
	const animationRef = useRef<number>();

	// State refs
	const trueAngleRef = useRef(0);
	const filteredAngleRef = useRef(0);
	const gyroAngleRef = useRef(0);
	const historyRef = useRef<
		{
			t: number;
			trueAngle: number;
			accelAngle: number;
			gyroAngle: number;
			filteredAngle: number;
		}[]
	>([]);

	// Gyro bias
	const gyroBiasRef = useRef(0.5); // deg/s

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			history: {
				t: number;
				trueAngle: number;
				accelAngle: number;
				gyroAngle: number;
				filteredAngle: number;
			}[],
			target: number,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Plot area
			const plotX = 45;
			const plotY = 40;
			const plotWidth = width - 80;
			const plotHeight = height - 100;

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
			ctx.fillText("Complementary filter fusion", plotX, 22);

			// Y-axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "11px monospace";
			ctx.textAlign = "right";
			ctx.fillText("+60°", plotX - 5, plotY + 6);
			ctx.fillText("0°", plotX - 5, plotY + plotHeight / 2 + 4);
			ctx.fillText("−60°", plotX - 5, plotY + plotHeight + 4);

			// Time window
			const timeWindow = 10;
			const startTime = Math.max(0, currentTime - timeWindow);

			// Filter visible history
			const visibleHistory = history.filter(
				(h) => h.t >= startTime && h.t <= currentTime,
			);

			// Helper to draw a line
			const drawLine = (
				data: { t: number; value: number }[],
				color: string,
				lineWidth: number = 2,
				dashed: boolean = false,
			) => {
				if (data.length < 2) return;
				ctx.beginPath();
				ctx.strokeStyle = color;
				ctx.lineWidth = lineWidth;
				if (dashed) ctx.setLineDash([4, 4]);
				for (let i = 0; i < data.length; i++) {
					const d = data[i];
					const x = plotX + ((d.t - startTime) / timeWindow) * plotWidth;
					const y =
						plotY + plotHeight / 2 - (d.value / 60) * (plotHeight / 2);
					const clampedY = Math.max(plotY, Math.min(plotY + plotHeight, y));
					if (i === 0) ctx.moveTo(x, clampedY);
					else ctx.lineTo(x, clampedY);
				}
				ctx.stroke();
				ctx.setLineDash([]);
			};

			// Draw accelerometer (noisy, blue, thin)
			drawLine(
				visibleHistory.map((h) => ({ t: h.t, value: h.accelAngle })),
				"#3b82f6",
				1.5,
			);

			// Draw gyro integrated (drifting, purple, thin dashed)
			drawLine(
				visibleHistory.map((h) => ({ t: h.t, value: h.gyroAngle })),
				"#a855f7",
				1.5,
				true,
			);

			// Draw true angle (green)
			drawLine(
				visibleHistory.map((h) => ({ t: h.t, value: h.trueAngle })),
				"#22c55e",
				2.5,
			);

			// Draw filtered output (pink/magenta, thick)
			drawLine(
				visibleHistory.map((h) => ({ t: h.t, value: h.filteredAngle })),
				"#e879f9",
				3,
			);

			// Target indicator on right side
			const targetY =
				plotY + plotHeight / 2 - (target / 60) * (plotHeight / 2);
			ctx.beginPath();
			ctx.arc(plotX + plotWidth + 15, targetY, 6, 0, Math.PI * 2);
			ctx.fillStyle = "#f97316";
			ctx.fill();
			ctx.strokeStyle = "#fdba74";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Legend
			const legendY = height - 25;
			const legendSpacing = 120;

			ctx.font = "11px sans-serif";

			// True
			ctx.fillStyle = "#22c55e";
			ctx.fillRect(plotX, legendY - 6, 10, 3);
			ctx.textAlign = "left";
			ctx.fillText("True", plotX + 14, legendY);

			// Accel
			ctx.fillStyle = "#3b82f6";
			ctx.fillRect(plotX + legendSpacing * 0.6, legendY - 6, 10, 3);
			ctx.fillText("Accel", plotX + legendSpacing * 0.6 + 14, legendY);

			// Gyro
			ctx.strokeStyle = "#a855f7";
			ctx.setLineDash([3, 3]);
			ctx.beginPath();
			ctx.moveTo(plotX + legendSpacing * 1.2, legendY - 4);
			ctx.lineTo(plotX + legendSpacing * 1.2 + 10, legendY - 4);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = "#a855f7";
			ctx.fillText("Gyro", plotX + legendSpacing * 1.2 + 14, legendY);

			// Filtered
			ctx.fillStyle = "#e879f9";
			ctx.fillRect(plotX + legendSpacing * 1.8, legendY - 6, 10, 3);
			ctx.fillText("Filtered", plotX + legendSpacing * 1.8 + 14, legendY);
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

					// Smooth true angle following target
					const angleDiff = targetAngle - trueAngleRef.current;
					trueAngleRef.current += angleDiff * 0.05;

					// Accelerometer reading (true + vibration noise)
					let accelAngle = trueAngleRef.current;
					if (vibrationEnabled) {
						accelAngle +=
							Math.sin(newTime * 50) * 8 +
							Math.sin(newTime * 73) * 5 +
							Math.sin(newTime * 31) * 4;
					}
					accelAngle += (Math.random() - 0.5) * 2;

					// Gyroscope reading (true rate + bias + noise)
					const trueRate = angleDiff * 0.05 / dt; // Approximate true rate
					const gyroRate =
						trueRate + gyroBiasRef.current + (Math.random() - 0.5) * 5;

					// Integrate gyro (with drift)
					gyroAngleRef.current += gyroRate * dt;

					// Complementary filter
					const gyroContribution =
						filteredAngleRef.current + gyroRate * dt;
					const accelContribution = accelAngle;
					filteredAngleRef.current =
						alpha * gyroContribution + (1 - alpha) * accelContribution;

					// Store history
					historyRef.current.push({
						t: newTime,
						trueAngle: trueAngleRef.current,
						accelAngle: accelAngle,
						gyroAngle: gyroAngleRef.current,
						filteredAngle: filteredAngleRef.current,
					});

					// Trim history
					if (historyRef.current.length > 800) {
						historyRef.current.shift();
					}

					return newTime;
				});
			}

			draw(ctx, time, historyRef.current, targetAngle);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, alpha, vibrationEnabled, targetAngle]);

	const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		setIsDragging(true);
		updateTargetFromMouse(e);
	};

	const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isDragging) {
			updateTargetFromMouse(e);
		}
	};

	const updateTargetFromMouse = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const scaleY = CANVAS_HEIGHT / rect.height;
		const y = (e.clientY - rect.top) * scaleY;

		// Map y to angle (-60 to +60)
		const plotY = 40;
		const plotHeight = CANVAS_HEIGHT - 100;
		const normalizedY = (y - plotY - plotHeight / 2) / (plotHeight / 2);
		const angle = -normalizedY * 60;
		setTargetAngle(Math.max(-60, Math.min(60, angle)));
	};

	const handleReset = () => {
		setTime(0);
		trueAngleRef.current = 0;
		filteredAngleRef.current = 0;
		gyroAngleRef.current = 0;
		historyRef.current = [];
		setTargetAngle(0);
		setAlpha(0.98);
		setVibrationEnabled(false);
	};

	const error = Math.abs(filteredAngleRef.current - trueAngleRef.current);

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl"
		>
			<div className="flex flex-col items-center">
				<span className="text-xs font-mono mb-2 text-zinc-500">
					Click/drag to set target angle
				</span>
				<canvas
					ref={canvasRef}
					width={CANVAS_WIDTH * DPR}
					height={CANVAS_HEIGHT * DPR}
					className="w-full rounded-xl cursor-crosshair"
					style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
					onMouseDown={handleCanvasMouseDown}
					onMouseMove={handleCanvasMouseMove}
					onMouseUp={() => setIsDragging(false)}
					onMouseLeave={() => setIsDragging(false)}
				/>
			</div>

			<div className="flex flex-col gap-3 px-2">
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-purple-400 w-8">α</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-purple-500 rounded-lg"
							style={{ width: `${((alpha - 0.5) / 0.5) * 100}%` }}
						/>
						<input
							type="range"
							min="0.5"
							max="1"
							step="0.01"
							value={alpha}
							onChange={(e) => setAlpha(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-full border-2 border-purple-300 pointer-events-none"
							style={{ left: `calc(${((alpha - 0.5) / 0.5) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-purple-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{alpha.toFixed(2)}
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
						onClick={() => setVibrationEnabled(!vibrationEnabled)}
						className={`p-2.5 rounded-xl transition-all ${vibrationEnabled ? "bg-red-600/20 hover:bg-red-600/30" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700"}`}
						title={vibrationEnabled ? "Vibration ON" : "Vibration OFF"}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#f87171"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M2 12h2l2-7 3 14 3-7 2 3h8" />
						</svg>
					</button>
				</div>
				<div className="flex gap-2 font-mono text-xs">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[60px]">
						<span className="text-zinc-500 text-[10px]">Target</span>
						<span
							className="text-orange-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{targetAngle.toFixed(0)}°
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[60px]">
						<span className="text-zinc-500 text-[10px]">Error</span>
						<span
							className={error > 5 ? "text-red-400" : "text-emerald-400"}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{error.toFixed(1)}°
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

