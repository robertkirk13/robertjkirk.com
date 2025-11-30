import React, { useRef, useEffect, useState, useCallback } from "react";

interface MotorState {
	angle: number;
	angularVelocity: number;
	integral: number;
	prevError: number;
}

interface ControllerConfig {
	name: string;
	kp: number;
	ki: number;
	kd: number;
	color: string;
}

const MOMENT_OF_INERTIA = 0.12;
const FRICTION = 0.3;
const MAX_TORQUE = 2;
const DT = 1 / 60;
const DPR =
	typeof window !== "undefined"
		? Math.min(window.devicePixelRatio || 1, 2)
		: 2;
const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 280;

const controllerConfigs: ControllerConfig[] = [
	{ name: "P", kp: 2.0, ki: 0, kd: 0, color: "#3b82f6" },
	{ name: "PD", kp: 2.0, ki: 0, kd: 0.8, color: "#a855f7" },
	{ name: "PI", kp: 2.0, ki: 0.5, kd: 0, color: "#f59e0b" },
	{ name: "PID", kp: 2.0, ki: 0.5, kd: 0.8, color: "#22c55e" },
];

export default function ComparisonPlayground() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [states, setStates] = useState<MotorState[]>(
		controllerConfigs.map(() => ({
			angle: Math.PI / 2,
			angularVelocity: 0,
			integral: 0,
			prevError: 0,
		})),
	);
	const statesRef = useRef<MotorState[]>(states);
	const [targetAngle, setTargetAngle] = useState<number>((3 * Math.PI) / 4);
	const [mass, setMass] = useState(0.3);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const historiesRef = useRef<number[][]>(controllerConfigs.map(() => []));
	const targetHistoryRef = useRef<number[]>([]);
	const animationRef = useRef<number>();

	const simulate = useCallback(
		(
			currentState: MotorState,
			target: number,
			config: ControllerConfig,
			massVal: number,
		): MotorState => {
			const error = target - currentState.angle;
			const newIntegral = Math.max(
				-10,
				Math.min(10, currentState.integral + error * DT),
			);
			const derivative = (error - currentState.prevError) / DT;

			const pTerm = config.kp * error;
			const iTerm = config.ki * newIntegral;
			const dTerm = config.kd * derivative;
			const torque = Math.max(-MAX_TORQUE, Math.min(MAX_TORQUE, pTerm + iTerm + dTerm));

			// Mass creates gravitational torque
			const gravityTorque = -massVal * Math.cos(currentState.angle);

			const angularAcceleration =
				(torque + gravityTorque - FRICTION * currentState.angularVelocity) /
				MOMENT_OF_INERTIA;
			const newVelocity =
				currentState.angularVelocity + angularAcceleration * DT;
			const newAngle = currentState.angle + newVelocity * DT;

			return {
				angle: newAngle,
				angularVelocity: newVelocity,
				integral: newIntegral,
				prevError: error,
			};
		},
		[],
	);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentStates: MotorState[],
			target: number,
			histories: number[][],
			targetHistory: number[],
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 46;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Grid lines
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 4; i++) {
				const y = padding + ((height - 2 * padding) * i) / 4;
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - padding, y);
				ctx.stroke();
			}

			// Y-axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "11px monospace";
			ctx.textAlign = "right";
			ctx.fillText("180°", padding - 8, padding + 4);
			ctx.fillText("135°", padding - 8, padding + (height - 2 * padding) / 4 + 4);
			ctx.fillText("90°", padding - 8, padding + (height - 2 * padding) / 2 + 4);
			ctx.fillText("45°", padding - 8, padding + ((height - 2 * padding) * 3) / 4 + 4);
			ctx.fillText("0°", padding - 8, height - padding + 4);

			// Map angle to Y (0° at bottom, 180° at top)
			const angleToY = (angle: number) =>
				padding + (height - 2 * padding) * (1 - angle / Math.PI);

			// Target line
			if (targetHistory.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#f97316";
				ctx.lineWidth = 2;
				ctx.setLineDash([6, 6]);
				for (let i = 0; i < targetHistory.length; i++) {
					const x =
						padding +
						((width - 2 * padding) * i) / (targetHistory.length - 1);
					const y = angleToY(targetHistory[i]);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
				ctx.setLineDash([]);
			}

			// Controller traces
			histories.forEach((history, idx) => {
				if (history.length < 2) return;
				ctx.beginPath();
				ctx.strokeStyle = controllerConfigs[idx].color;
				ctx.lineWidth = 2.5;
				for (let i = 0; i < history.length; i++) {
					const x =
						padding + ((width - 2 * padding) * i) / (history.length - 1);
					const y = angleToY(history[i]);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			});

			// Title
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Position over time", padding, 22);

			// Legend (top-left, inside graph area)
			const legendX = padding + 10;
			let legendY = padding + 18;
			
			// Background for legend
			ctx.fillStyle = "rgba(10, 10, 10, 0.85)";
			ctx.beginPath();
			ctx.roundRect(legendX - 6, legendY - 14, 75, 88, 6);
			ctx.fill();
			
			controllerConfigs.forEach((config) => {
				ctx.fillStyle = config.color;
				ctx.beginPath();
				ctx.arc(legendX + 4, legendY - 3, 4, 0, Math.PI * 2);
				ctx.fill();
				ctx.font = "11px monospace";
				ctx.textAlign = "left";
				ctx.fillText(config.name, legendX + 14, legendY + 1);
				legendY += 18;
			});

			// Target in legend
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 2;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(legendX - 2, legendY - 3);
			ctx.lineTo(legendX + 10, legendY - 3);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = "#f97316";
			ctx.fillText("Target", legendX + 14, legendY + 1);
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
				const newStates = statesRef.current.map((state, idx) =>
					simulate(state, targetAngle, controllerConfigs[idx], mass),
				);
				statesRef.current = newStates;
				setStates(newStates);
				newStates.forEach((state, idx) => {
					historiesRef.current[idx].push(state.angle);
					if (historiesRef.current[idx].length > 200)
						historiesRef.current[idx].shift();
				});
				targetHistoryRef.current.push(targetAngle);
				if (targetHistoryRef.current.length > 200) targetHistoryRef.current.shift();
			}
			draw(
				ctx,
				statesRef.current,
				targetAngle,
				historiesRef.current,
				targetHistoryRef.current,
			);
			animationRef.current = requestAnimationFrame(loop);
		};
		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [simulate, draw, targetAngle, isRunning, isVisible, mass]);

	const handleReset = () => {
		const initialStates = controllerConfigs.map(() => ({
			angle: Math.PI / 2,
			angularVelocity: 0,
			integral: 0,
			prevError: 0,
		}));
		statesRef.current = initialStates;
		setStates(initialStates);
		historiesRef.current = controllerConfigs.map(() => []);
		targetHistoryRef.current = [];
		setTargetAngle((3 * Math.PI) / 4);
		setMass(0.3);
	};

	const handleRandomTarget = () => {
		// Random angle between 45° and 135° (π/4 to 3π/4)
		const newTarget = Math.PI / 4 + Math.random() * Math.PI / 2;
		setTargetAngle(newTarget);
	};

	// Calculate current errors
	const errors = states.map((state, idx) => ({
		name: controllerConfigs[idx].name,
		error: Math.abs(targetAngle - state.angle) * (180 / Math.PI),
		color: controllerConfigs[idx].color,
	}));

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl"
		>
			<div className="flex flex-col items-center min-w-0">
				<canvas
					ref={canvasRef}
					width={CANVAS_WIDTH * DPR}
					height={CANVAS_HEIGHT * DPR}
					className="outline-none border-0 block w-full max-w-[500px]"
					style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
				/>
			</div>

			{/* Error stats */}
			<div className="flex justify-center gap-4">
				{errors.map((e) => (
					<div
						key={e.name}
						className="px-3 py-2 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]"
					>
						<span className="text-[10px] text-zinc-500">{e.name} Error</span>
						<span
							className="font-mono text-sm"
							style={{
								color: e.color,
								fontVariantNumeric: "tabular-nums",
							}}
						>
							{e.error.toFixed(1)}°
						</span>
					</div>
				))}
			</div>

			{/* Sliders */}
			<div className="flex flex-col gap-3 px-2 pb-2">
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-12">Target</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-orange-500 rounded-lg"
							style={{
								width: `${((targetAngle - Math.PI / 4) / (Math.PI / 2)) * 100}%`,
							}}
						/>
						<input
							type="range"
							min={Math.PI / 4}
							max={(3 * Math.PI) / 4}
							step={0.01}
							value={targetAngle}
							onChange={(e) => setTargetAngle(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-orange-500 rounded-full border-2 border-orange-300 pointer-events-none"
							style={{
								left: `calc(${((targetAngle - Math.PI / 4) / (Math.PI / 2)) * 100}% - 8px)`,
							}}
						/>
					</div>
					<span
						className="text-sm font-mono text-orange-400 w-10 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{Math.round((targetAngle * 180) / Math.PI)}°
					</span>
				</div>
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-12">Mass</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-red-500 rounded-lg"
							style={{ width: `${(mass / 1) * 100}%` }}
						/>
						<input
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={mass}
							onChange={(e) => setMass(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-red-500 rounded-full border-2 border-red-300 pointer-events-none"
							style={{ left: `calc(${(mass / 1) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-red-400 w-10 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{mass.toFixed(2)}
					</span>
				</div>
			</div>

			{/* Buttons */}
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
						className={`p-2.5 rounded-xl transition-all ${isRunning ? "bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-white" : "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 text-white"}`}
						title={isRunning ? "Pause" : "Play"}
					>
						{isRunning ? (
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
								<rect x="6" y="4" width="4" height="16" rx="1" />
								<rect x="14" y="4" width="4" height="16" rx="1" />
							</svg>
						) : (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
							</svg>
						)}
					</button>
					<button
						type="button"
						onClick={handleRandomTarget}
						className="p-2.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-400 text-white rounded-xl transition-all"
						title="Random Target"
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
							<rect x="2" y="2" width="20" height="20" rx="2" />
							<circle cx="8" cy="8" r="1.5" fill="currentColor" />
							<circle cx="16" cy="8" r="1.5" fill="currentColor" />
							<circle cx="8" cy="16" r="1.5" fill="currentColor" />
							<circle cx="16" cy="16" r="1.5" fill="currentColor" />
							<circle cx="12" cy="12" r="1.5" fill="currentColor" />
						</svg>
					</button>
				</div>
				<p className="text-xs text-zinc-500">
					Compare P, PD, and PID responses
				</p>
			</div>
		</div>
	);
}
