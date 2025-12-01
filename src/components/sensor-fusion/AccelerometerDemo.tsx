import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 350;

export default function AccelerometerDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [trueAngle, setTrueAngle] = useState(0);
	const [targetAngle, setTargetAngle] = useState(0);
	const [vibrationEnabled, setVibrationEnabled] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const animationRef = useRef<number>();

	// Smooth angle following
	const angleVelocityRef = useRef(0);

	const getAccelerometerReading = useCallback(
		(angle: number, t: number, vibration: boolean) => {
			// Accelerometer measures gravity projection
			let accelAngle = angle;

			// Add vibration noise if enabled
			if (vibration) {
				const vibNoise =
					Math.sin(t * 50) * 0.15 +
					Math.sin(t * 73) * 0.1 +
					Math.sin(t * 31) * 0.08;
				accelAngle += vibNoise;
			}

			// Add small sensor noise
			accelAngle += (Math.random() - 0.5) * 0.03;

			return accelAngle;
		},
		[],
	);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			angle: number,
			target: number,
			accelReading: number,
			hovering: boolean,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const centerX = width / 2;
			const centerY = height / 2 - 20;
			const radius = 100;

			// Draw reference circle
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius + 20, 0, Math.PI * 2);
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Draw angle arc (showing tilt range)
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius + 20, -Math.PI / 2, Math.PI / 2);
			ctx.strokeStyle = "#334155";
			ctx.lineWidth = 4;
			ctx.stroke();

			// Draw target indicator
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate(target);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(radius + 35, 0);
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 2;
			ctx.setLineDash([6, 6]);
			ctx.stroke();
			ctx.setLineDash([]);

			// Target handle
			const handleSize = hovering ? 10 : 8;
			ctx.beginPath();
			ctx.arc(radius + 35, 0, handleSize, 0, Math.PI * 2);
			ctx.fillStyle = "#f97316";
			ctx.fill();
			ctx.strokeStyle = "#fdba74";
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.restore();

			// Draw device body
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate(angle);

			// Device rectangle
			const deviceWidth = 120;
			const deviceHeight = 60;
			ctx.fillStyle = "#1e293b";
			ctx.beginPath();
			ctx.roundRect(
				-deviceWidth / 2,
				-deviceHeight / 2,
				deviceWidth,
				deviceHeight,
				8,
			);
			ctx.fill();
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Accelerometer chip indicator
			ctx.fillStyle = "#3b82f6";
			ctx.fillRect(-15, -15, 30, 30);
			ctx.fillStyle = "#60a5fa";
			ctx.font = "bold 10px monospace";
			ctx.textAlign = "center";
			ctx.fillText("ACC", 0, 4);

			// Gravity arrow (always points down in world frame, so opposite of rotation)
			ctx.restore();

			// Draw gravity vector from device perspective
			ctx.save();
			ctx.translate(centerX, centerY);
			const gravityLength = 50;
			const gravityX = Math.sin(-angle) * gravityLength;
			const gravityY = Math.cos(-angle) * gravityLength;

			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(gravityX, gravityY);
			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 3;
			ctx.stroke();

			// Arrow head
			const arrowAngle = Math.atan2(gravityY, gravityX);
			ctx.beginPath();
			ctx.moveTo(gravityX, gravityY);
			ctx.lineTo(
				gravityX - 10 * Math.cos(arrowAngle - 0.4),
				gravityY - 10 * Math.sin(arrowAngle - 0.4),
			);
			ctx.lineTo(
				gravityX - 10 * Math.cos(arrowAngle + 0.4),
				gravityY - 10 * Math.sin(arrowAngle + 0.4),
			);
			ctx.closePath();
			ctx.fillStyle = "#22c55e";
			ctx.fill();

			ctx.fillStyle = "#22c55e";
			ctx.font = "12px sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("gravity", gravityX + 10, gravityY);
			ctx.restore();

			// Draw accelerometer reading indicator (what the sensor thinks)
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate(accelReading);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(radius, 0);
			ctx.strokeStyle = "#60a5fa";
			ctx.lineWidth = 4;
			ctx.lineCap = "round";
			ctx.stroke();

			// Tip
			ctx.beginPath();
			ctx.arc(radius, 0, 6, 0, Math.PI * 2);
			ctx.fillStyle = "#93c5fd";
			ctx.fill();
			ctx.restore();

			// Labels
			ctx.fillStyle = "#64748b";
			ctx.font = "12px monospace";
			ctx.textAlign = "center";
			ctx.fillText("−90°", centerX - radius - 40, centerY);
			ctx.fillText("+90°", centerX + radius + 40, centerY);
			ctx.fillText("0°", centerX, centerY - radius - 30);

			// Info display at bottom
			const infoY = height - 50;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText(
				`True angle: ${((angle * 180) / Math.PI).toFixed(1)}°`,
				30,
				infoY,
			);
			ctx.fillStyle = "#60a5fa";
			ctx.fillText(
				`Accel reading: ${((accelReading * 180) / Math.PI).toFixed(1)}°`,
				30,
				infoY + 20,
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
				setTime((t) => t + 1 / 60);

				// Smooth angle following with spring physics
				const angleDiff = targetAngle - trueAngle;
				angleVelocityRef.current += angleDiff * 0.1;
				angleVelocityRef.current *= 0.85; // Damping
				setTrueAngle((a) => a + angleVelocityRef.current * 0.1);
			}

			const accelReading = getAccelerometerReading(
				trueAngle,
				time,
				vibrationEnabled,
			);
			draw(ctx, trueAngle, targetAngle, accelReading, isDragging);
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
		trueAngle,
		targetAngle,
		vibrationEnabled,
		isDragging,
		getAccelerometerReading,
	]);

	const getAngleFromMouse = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			if (!canvas) return 0;
			const rect = canvas.getBoundingClientRect();
			const scaleX = CANVAS_WIDTH / rect.width;
			const scaleY = CANVAS_HEIGHT / rect.height;
			const x = (e.clientX - rect.left) * scaleX - CANVAS_WIDTH / 2;
			const y = (e.clientY - rect.top) * scaleY - (CANVAS_HEIGHT / 2 - 20);
			return Math.atan2(x, -y);
		},
		[],
	);

	const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		setIsDragging(true);
		const angle = getAngleFromMouse(e);
		setTargetAngle(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, angle)));
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isDragging) {
			const angle = getAngleFromMouse(e);
			setTargetAngle(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, angle)));
		}
	};

	const handleReset = () => {
		setTime(0);
		setTrueAngle(0);
		setTargetAngle(0);
		angleVelocityRef.current = 0;
		setVibrationEnabled(false);
	};

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl"
		>
			<div className="flex flex-col items-center">
				<span className="text-xs font-mono mb-2 text-zinc-500">
					Drag to tilt the device
				</span>
				<canvas
					ref={canvasRef}
					width={CANVAS_WIDTH * DPR}
					height={CANVAS_HEIGHT * DPR}
					className="w-full max-w-[500px] rounded-xl cursor-grab active:cursor-grabbing"
					style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={() => setIsDragging(false)}
					onMouseLeave={() => setIsDragging(false)}
				/>
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
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px]">True</span>
						<span
							className="text-emerald-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{((trueAngle * 180) / Math.PI).toFixed(1)}°
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px]">Reading</span>
						<span
							className="text-blue-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{(
								(getAccelerometerReading(trueAngle, time, vibrationEnabled) *
									180) /
								Math.PI
							).toFixed(1)}
							°
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

