import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 300;

type ChallengeType = "basic" | "vibration" | "drift" | "combined";

const CHALLENGES: {
	id: ChallengeType;
	name: string;
	description: string;
	vibration: boolean;
	gyroBias: number;
	targetError: number;
}[] = [
	{
		id: "basic",
		name: "Basics",
		description: "Low noise, minimal drift",
		vibration: false,
		gyroBias: 0.1,
		targetError: 2,
	},
	{
		id: "vibration",
		name: "Vibration",
		description: "High accelerometer noise",
		vibration: true,
		gyroBias: 0.1,
		targetError: 3,
	},
	{
		id: "drift",
		name: "Drift",
		description: "High gyroscope drift",
		vibration: false,
		gyroBias: 0.8,
		targetError: 3,
	},
	{
		id: "combined",
		name: "Combined",
		description: "Both challenges at once",
		vibration: true,
		gyroBias: 0.5,
		targetError: 4,
	},
];

export default function FusionChallenge() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [challenge, setChallenge] = useState<ChallengeType>("basic");
	const [alpha, setAlpha] = useState(0.98);
	const [processNoise, setProcessNoise] = useState(0.1);
	const [measurementNoise, setMeasurementNoise] = useState(0.5);
	const [filterType, setFilterType] = useState<"comp" | "kalman">("comp");
	const animationRef = useRef<number>();

	// Get current challenge config
	const currentChallenge = CHALLENGES.find((c) => c.id === challenge)!;

	// State refs
	const trueAngleRef = useRef(0);
	const filterAngleRef = useRef(0);
	const uncertaintyRef = useRef(1);
	const errorHistoryRef = useRef<number[]>([]);

	// Target angle changes periodically
	const targetAngleRef = useRef(0);
	const nextTargetTimeRef = useRef(3);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			trueAngle: number,
			filterAngle: number,
			avgError: number,
			targetError: number,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const centerX = width / 2;
			const centerY = height / 2 + 20;
			const radius = 100;

			// Draw reference circle
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Draw target indicator
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate((targetAngleRef.current * Math.PI) / 180);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(radius + 25, 0);
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 2;
			ctx.setLineDash([6, 6]);
			ctx.stroke();
			ctx.setLineDash([]);

			ctx.beginPath();
			ctx.arc(radius + 25, 0, 8, 0, Math.PI * 2);
			ctx.fillStyle = "#f97316";
			ctx.fill();
			ctx.restore();

			// Draw true angle (green)
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate((trueAngle * Math.PI) / 180);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(radius - 10, 0);
			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 4;
			ctx.lineCap = "round";
			ctx.stroke();
			ctx.restore();

			// Draw filter estimate (pink)
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate((filterAngle * Math.PI) / 180);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(radius, 0);
			ctx.strokeStyle = "#e879f9";
			ctx.lineWidth = 6;
			ctx.lineCap = "round";
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(radius, 0, 6, 0, Math.PI * 2);
			ctx.fillStyle = "#f0abfc";
			ctx.fill();
			ctx.restore();

			// Center pivot
			ctx.beginPath();
			ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
			ctx.fillStyle = "#3f3f46";
			ctx.fill();

			// Error indicator
			const errorAngle = Math.abs(filterAngle - trueAngle);
			const errorColor =
				avgError <= targetError
					? "#22c55e"
					: avgError <= targetError * 1.5
						? "#f59e0b"
						: "#ef4444";

			// Score display
			ctx.fillStyle = "#94a3b8";
			ctx.font = "14px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Average Error", 20, 30);

			ctx.fillStyle = errorColor;
			ctx.font = "bold 28px monospace";
			ctx.fillText(`${avgError.toFixed(1)}°`, 20, 60);

			ctx.fillStyle = "#64748b";
			ctx.font = "12px monospace";
			ctx.fillText(`Target: < ${targetError}°`, 20, 80);

			// Pass/Fail indicator
			if (errorHistoryRef.current.length > 100) {
				const passed = avgError <= targetError;
				ctx.fillStyle = passed ? "#22c55e" : "#ef4444";
				ctx.font = "bold 16px sans-serif";
				ctx.textAlign = "right";
				ctx.fillText(passed ? "PASS" : "TUNING NEEDED", width - 20, 30);
			}

			// Legend
			ctx.font = "12px sans-serif";
			ctx.textAlign = "left";
			ctx.fillStyle = "#22c55e";
			ctx.fillText("● True", 20, height - 25);
			ctx.fillStyle = "#e879f9";
			ctx.fillText("● Estimate", 80, height - 25);
			ctx.fillStyle = "#f97316";
			ctx.fillText("○ Target", 160, height - 25);
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

					// Change target periodically
					if (newTime > nextTargetTimeRef.current) {
						targetAngleRef.current = (Math.random() - 0.5) * 80;
						nextTargetTimeRef.current = newTime + 3 + Math.random() * 2;
					}

					// True angle follows target with some lag
					const angleDiff = targetAngleRef.current - trueAngleRef.current;
					trueAngleRef.current += angleDiff * 0.03;

					// Accelerometer reading
					let accelAngle = trueAngleRef.current;
					if (currentChallenge.vibration) {
						accelAngle +=
							Math.sin(newTime * 50) * 8 +
							Math.sin(newTime * 73) * 5 +
							Math.sin(newTime * 31) * 4;
					}
					accelAngle += (Math.random() - 0.5) * 2;

					// Gyroscope reading
					const trueRate = angleDiff * 0.03 / dt;
					const gyroRate =
						trueRate +
						currentChallenge.gyroBias * 60 +
						(Math.random() - 0.5) * 5;

					// Apply selected filter
					if (filterType === "comp") {
						const gyroContrib = filterAngleRef.current + gyroRate * dt;
						filterAngleRef.current =
							alpha * gyroContrib + (1 - alpha) * accelAngle;
					} else {
						// Kalman filter
						const pred = filterAngleRef.current + gyroRate * dt;
						const predP = uncertaintyRef.current + processNoise;
						const K = predP / (predP + measurementNoise);
						filterAngleRef.current = pred + K * (accelAngle - pred);
						uncertaintyRef.current = (1 - K) * predP;
					}

					// Track error
					const error = Math.abs(
						filterAngleRef.current - trueAngleRef.current,
					);
					errorHistoryRef.current.push(error);
					if (errorHistoryRef.current.length > 300) {
						errorHistoryRef.current.shift();
					}

					return newTime;
				});
			}

			const avgError =
				errorHistoryRef.current.length > 0
					? errorHistoryRef.current.reduce((a, b) => a + b, 0) /
						errorHistoryRef.current.length
					: 0;

			draw(
				ctx,
				trueAngleRef.current,
				filterAngleRef.current,
				avgError,
				currentChallenge.targetError,
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
		challenge,
		alpha,
		processNoise,
		measurementNoise,
		filterType,
		currentChallenge,
	]);

	const handleReset = () => {
		setTime(0);
		trueAngleRef.current = 0;
		filterAngleRef.current = 0;
		uncertaintyRef.current = 1;
		targetAngleRef.current = 0;
		nextTargetTimeRef.current = 3;
		errorHistoryRef.current = [];
	};

	const handleChallengeChange = (newChallenge: ChallengeType) => {
		setChallenge(newChallenge);
		handleReset();
	};

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl"
		>
			{/* Challenge selector */}
			<div className="flex gap-2 flex-wrap">
				{CHALLENGES.map((c) => (
					<button
						key={c.id}
						type="button"
						onClick={() => handleChallengeChange(c.id)}
						className={`px-3 py-2 rounded-xl text-sm transition-all ${
							challenge === c.id
								? "bg-purple-600 text-white"
								: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
						}`}
					>
						{c.name}
					</button>
				))}
			</div>

			<p className="text-xs text-zinc-500">{currentChallenge.description}</p>

			<canvas
				ref={canvasRef}
				width={CANVAS_WIDTH * DPR}
				height={CANVAS_HEIGHT * DPR}
				className="w-full rounded-xl"
				style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
			/>

			{/* Filter type selector */}
			<div className="flex gap-2">
				<button
					type="button"
					onClick={() => {
						setFilterType("comp");
						handleReset();
					}}
					className={`px-3 py-2 rounded-xl text-sm transition-all ${
						filterType === "comp"
							? "bg-amber-600 text-white"
							: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
					}`}
				>
					Complementary
				</button>
				<button
					type="button"
					onClick={() => {
						setFilterType("kalman");
						handleReset();
					}}
					className={`px-3 py-2 rounded-xl text-sm transition-all ${
						filterType === "kalman"
							? "bg-pink-600 text-white"
							: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
					}`}
				>
					Kalman
				</button>
			</div>

			{/* Filter parameters */}
			<div className="flex flex-col gap-3 px-2">
				{filterType === "comp" ? (
					<div className="flex items-center gap-4">
						<label className="text-sm font-mono text-amber-400 w-8">α</label>
						<div className="flex-1 relative h-2">
							<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
							<div
								className="absolute left-0 top-0 h-full bg-amber-500 rounded-lg"
								style={{ width: `${((alpha - 0.8) / 0.2) * 100}%` }}
							/>
							<input
								type="range"
								min="0.8"
								max="1"
								step="0.005"
								value={alpha}
								onChange={(e) => setAlpha(parseFloat(e.target.value))}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							/>
							<div
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-amber-500 rounded-full border-2 border-amber-300 pointer-events-none"
								style={{ left: `calc(${((alpha - 0.8) / 0.2) * 100}% - 8px)` }}
							/>
						</div>
						<span
							className="text-sm font-mono text-amber-400 w-14 text-right"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{alpha.toFixed(3)}
						</span>
					</div>
				) : (
					<>
						<div className="flex items-center gap-4">
							<label className="text-sm font-mono text-orange-400 w-8">Q</label>
							<div className="flex-1 relative h-2">
								<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
								<div
									className="absolute left-0 top-0 h-full bg-orange-500 rounded-lg"
									style={{ width: `${(processNoise / 1) * 100}%` }}
								/>
								<input
									type="range"
									min="0.01"
									max="1"
									step="0.01"
									value={processNoise}
									onChange={(e) => setProcessNoise(parseFloat(e.target.value))}
									className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
								/>
								<div
									className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-orange-500 rounded-full border-2 border-orange-300 pointer-events-none"
									style={{ left: `calc(${(processNoise / 1) * 100}% - 8px)` }}
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
							<label className="text-sm font-mono text-blue-400 w-8">R</label>
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
									onChange={(e) =>
										setMeasurementNoise(parseFloat(e.target.value))
									}
									className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
								/>
								<div
									className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
									style={{
										left: `calc(${(measurementNoise / 2) * 100}% - 8px)`,
									}}
								/>
							</div>
							<span
								className="text-sm font-mono text-blue-400 w-12 text-right"
								style={{ fontVariantNumeric: "tabular-nums" }}
							>
								{measurementNoise.toFixed(2)}
							</span>
						</div>
					</>
				)}
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
			</div>
		</div>
	);
}

