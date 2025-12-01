import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;

interface FilterState {
	angle: number;
	uncertainty: number;
	gyroIntegrated: number;
}

export default function IMUFusionDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [targetAngle, setTargetAngle] = useState(0);
	const [vibrationEnabled, setVibrationEnabled] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const animationRef = useRef<number>();

	// True state
	const trueAngleRef = useRef(0);

	// Filter states
	const compFilterRef = useRef<FilterState>({
		angle: 0,
		uncertainty: 0,
		gyroIntegrated: 0,
	});
	const kalmanFilterRef = useRef<FilterState>({
		angle: 0,
		uncertainty: 1,
		gyroIntegrated: 0,
	});

	// Last accel reading for display
	const lastAccelRef = useRef(0);
	const lastGyroAngleRef = useRef(0);

	// Gyro bias
	const gyroBias = 0.3; // deg/s

	// Filter parameters
	const compAlpha = 0.98;
	const kalmanQ = 0.1;
	const kalmanR = 0.5;

	// History for plotting
	const historyRef = useRef<
		{
			t: number;
			trueAngle: number;
			accelAngle: number;
			gyroAngle: number;
			compAngle: number;
			kalmanAngle: number;
		}[]
	>([]);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			history: {
				t: number;
				trueAngle: number;
				accelAngle: number;
				gyroAngle: number;
				compAngle: number;
				kalmanAngle: number;
			}[],
			target: number,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Plot area
			const plotX = 50;
			const plotY = 40;
			const plotWidth = width - 90;
			const plotHeight = height - 110;

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
			ctx.fillText("IMU Fusion Comparison", plotX, 22);

			// Y-axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "11px monospace";
			ctx.textAlign = "right";
			ctx.fillText("+60°", plotX - 5, plotY + 6);
			ctx.fillText("0°", plotX - 5, plotY + plotHeight / 2 + 4);
			ctx.fillText("−60°", plotX - 5, plotY + plotHeight + 4);

			// Time window
			const timeWindow = 12;
			const startTime = Math.max(0, currentTime - timeWindow);

			// Filter visible history
			const visibleHistory = history.filter(
				(h) => h.t >= startTime && h.t <= currentTime,
			);

			// Helper to draw line
			const drawLine = (
				getValue: (h: (typeof visibleHistory)[0]) => number,
				color: string,
				lineWidth: number = 2,
				dashed: boolean = false,
			) => {
				if (visibleHistory.length < 2) return;
				ctx.beginPath();
				ctx.strokeStyle = color;
				ctx.lineWidth = lineWidth;
				if (dashed) ctx.setLineDash([4, 4]);
				for (let i = 0; i < visibleHistory.length; i++) {
					const h = visibleHistory[i];
					const x = plotX + ((h.t - startTime) / timeWindow) * plotWidth;
					const value = getValue(h);
					const y =
						plotY + plotHeight / 2 - (value / 60) * (plotHeight / 2);
					const clampedY = Math.max(plotY, Math.min(plotY + plotHeight, y));
					if (i === 0) ctx.moveTo(x, clampedY);
					else ctx.lineTo(x, clampedY);
				}
				ctx.stroke();
				ctx.setLineDash([]);
			};

			// Draw lines in order (back to front)
			// Gyro (drifting, thin dashed)
			drawLine((h) => h.gyroAngle, "#a855f7", 1.5, true);

			// Accel (noisy, thin)
			drawLine((h) => h.accelAngle, "#3b82f6", 1.5);

			// True (reference)
			drawLine((h) => h.trueAngle, "#22c55e", 2);

			// Complementary (thick)
			drawLine((h) => h.compAngle, "#f59e0b", 3);

			// Kalman (thick)
			drawLine((h) => h.kalmanAngle, "#e879f9", 3);

			// Target indicator on right
			const targetY = plotY + plotHeight / 2 - (target / 60) * (plotHeight / 2);
			ctx.beginPath();
			ctx.arc(plotX + plotWidth + 15, targetY, 6, 0, Math.PI * 2);
			ctx.fillStyle = "#f97316";
			ctx.fill();
			ctx.strokeStyle = "#fdba74";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Legend (two rows)
			const legendY1 = height - 50;
			const legendY2 = height - 25;
			const legendSpacing = 130;

			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";

			// Row 1: True, Accel, Gyro
			ctx.fillStyle = "#22c55e";
			ctx.fillRect(plotX, legendY1 - 6, 12, 3);
			ctx.fillText("True", plotX + 16, legendY1);

			ctx.fillStyle = "#3b82f6";
			ctx.fillRect(plotX + legendSpacing, legendY1 - 6, 12, 3);
			ctx.fillText("Accel only", plotX + legendSpacing + 16, legendY1);

			ctx.strokeStyle = "#a855f7";
			ctx.setLineDash([3, 3]);
			ctx.beginPath();
			ctx.moveTo(plotX + legendSpacing * 2, legendY1 - 4);
			ctx.lineTo(plotX + legendSpacing * 2 + 12, legendY1 - 4);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = "#a855f7";
			ctx.fillText("Gyro only", plotX + legendSpacing * 2 + 16, legendY1);

			// Row 2: Comp, Kalman
			ctx.fillStyle = "#f59e0b";
			ctx.fillRect(plotX, legendY2 - 6, 12, 3);
			ctx.fillText("Complementary", plotX + 16, legendY2);

			ctx.fillStyle = "#e879f9";
			ctx.fillRect(plotX + legendSpacing, legendY2 - 6, 12, 3);
			ctx.fillText("Kalman", plotX + legendSpacing + 16, legendY2);
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
					trueAngleRef.current += angleDiff * 0.03;

					// Accelerometer reading
					let accelAngle = trueAngleRef.current;
					if (vibrationEnabled) {
						accelAngle +=
							Math.sin(newTime * 50) * 6 +
							Math.sin(newTime * 73) * 4 +
							Math.sin(newTime * 31) * 3;
					}
					accelAngle += (Math.random() - 0.5) * 1.5;
					lastAccelRef.current = accelAngle;

					// Gyroscope reading (rate)
					const trueRate = angleDiff * 0.03 / dt;
					const gyroRate = trueRate + gyroBias + (Math.random() - 0.5) * 3;

					// Pure gyro integration (with drift)
					lastGyroAngleRef.current += gyroRate * dt;

					// Complementary filter
					const compGyroContrib =
						compFilterRef.current.angle + gyroRate * dt;
					compFilterRef.current.angle =
						compAlpha * compGyroContrib + (1 - compAlpha) * accelAngle;

					// Kalman filter (simplified 1D)
					// Predict
					const kalmanPred = kalmanFilterRef.current.angle + gyroRate * dt;
					const kalmanPredP = kalmanFilterRef.current.uncertainty + kalmanQ;

					// Update (every frame with accel)
					const K = kalmanPredP / (kalmanPredP + kalmanR);
					kalmanFilterRef.current.angle =
						kalmanPred + K * (accelAngle - kalmanPred);
					kalmanFilterRef.current.uncertainty = (1 - K) * kalmanPredP;

					// Store history
					historyRef.current.push({
						t: newTime,
						trueAngle: trueAngleRef.current,
						accelAngle: accelAngle,
						gyroAngle: lastGyroAngleRef.current,
						compAngle: compFilterRef.current.angle,
						kalmanAngle: kalmanFilterRef.current.angle,
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
	}, [draw, isRunning, isVisible, time, targetAngle, vibrationEnabled]);

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

		const plotY = 40;
		const plotHeight = CANVAS_HEIGHT - 110;
		const normalizedY = (y - plotY - plotHeight / 2) / (plotHeight / 2);
		const angle = -normalizedY * 60;
		setTargetAngle(Math.max(-60, Math.min(60, angle)));
	};

	const handleReset = () => {
		setTime(0);
		trueAngleRef.current = 0;
		lastAccelRef.current = 0;
		lastGyroAngleRef.current = 0;
		compFilterRef.current = { angle: 0, uncertainty: 0, gyroIntegrated: 0 };
		kalmanFilterRef.current = { angle: 0, uncertainty: 1, gyroIntegrated: 0 };
		historyRef.current = [];
		setTargetAngle(0);
		setVibrationEnabled(false);
	};

	// Calculate errors
	const compError = Math.abs(
		compFilterRef.current.angle - trueAngleRef.current,
	);
	const kalmanError = Math.abs(
		kalmanFilterRef.current.angle - trueAngleRef.current,
	);
	const gyroDrift = Math.abs(
		lastGyroAngleRef.current - trueAngleRef.current,
	);

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl"
		>
			<div className="flex flex-col items-center">
				<span className="text-xs font-mono mb-2 text-zinc-500">
					Click/drag to move target angle
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
					<button
						type="button"
						onClick={() => setTargetAngle((Math.random() - 0.5) * 100)}
						className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 rounded-xl transition-all text-sm"
					>
						Random Target
					</button>
				</div>
				<div className="flex gap-2 font-mono text-xs flex-wrap justify-end">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[60px]">
						<span className="text-zinc-500 text-[10px]">Gyro drift</span>
						<span
							className="text-purple-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{gyroDrift.toFixed(1)}°
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[60px]">
						<span className="text-zinc-500 text-[10px]">Comp err</span>
						<span
							className={compError > 5 ? "text-amber-400" : "text-amber-400"}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{compError.toFixed(1)}°
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[60px]">
						<span className="text-zinc-500 text-[10px]">Kalman err</span>
						<span
							className={kalmanError > 5 ? "text-pink-400" : "text-pink-400"}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{kalmanError.toFixed(1)}°
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

