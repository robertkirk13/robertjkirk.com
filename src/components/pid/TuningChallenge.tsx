import React, { useRef, useEffect, useState, useCallback } from "react";

interface MotorState {
	angle: number;
	angularVelocity: number;
	integral: number;
	prevError: number;
}

interface RunResult {
	challenge: string;
	kp: number;
	kd: number;
	ki: number;
	time: number | null;
}

interface Challenge {
	name: string;
	description: string;
	startAngle: number;
	targetAngle: number;
	mass: number;
	parTime: number;
}

const CHALLENGES: Challenge[] = [
	{
		name: "Basics",
		description: "No mass, simple step",
		startAngle: Math.PI / 2,
		targetAngle: (3 * Math.PI) / 4,
		mass: 0,
		parTime: 1.5,
	},
	{
		name: "Weighted",
		description: "Add mass, fight gravity",
		startAngle: Math.PI / 2,
		targetAngle: (3 * Math.PI) / 4,
		mass: 0.4,
		parTime: 2.5,
	},
	{
		name: "Big Step",
		description: "Large angle change",
		startAngle: Math.PI / 4 + 0.1,
		targetAngle: (3 * Math.PI) / 4 - 0.1,
		mass: 0.2,
		parTime: 2.0,
	},
	{
		name: "Heavy",
		description: "Maximum mass",
		startAngle: Math.PI / 2,
		targetAngle: (2 * Math.PI) / 3,
		mass: 0.8,
		parTime: 3.5,
	},
];

const MOMENT_OF_INERTIA = 0.12;
const FRICTION = 0.3;
const MAX_TORQUE = 2;
const DT = 1 / 60;
const DPR =
	typeof window !== "undefined"
		? Math.min(window.devicePixelRatio || 1, 2)
		: 2;
const CANVAS_WIDTH = 260;
const CANVAS_HEIGHT = 260;

const STABILIZE_THRESHOLD = 0.02;
const STABILIZE_TIME = 0.5;
const MAX_TIME = 15;

export default function TuningChallenge() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	
	const [challengeIdx, setChallengeIdx] = useState(0);
	const challenge = CHALLENGES[challengeIdx];
	
	const [state, setState] = useState<MotorState>({
		angle: challenge.startAngle,
		angularVelocity: 0,
		integral: 0,
		prevError: 0,
	});
	const stateRef = useRef<MotorState>(state);

	// Start with non-functional values
	const [kp, setKp] = useState(0.5);
	const [kd, setKd] = useState(0);
	const [ki, setKi] = useState(0);

	const [isRunning, setIsRunning] = useState(false);
	const [isVisible, setIsVisible] = useState(true);
	const [elapsedTime, setElapsedTime] = useState(0);
	const [stabilizedAt, setStabilizedAt] = useState<number | null>(null);
	const [stableStartTime, setStableStartTime] = useState<number | null>(null);
	const [results, setResults] = useState<RunResult[]>([]);

	const animationRef = useRef<number>();
	const startTimeRef = useRef<number>(0);

	const simulate = useCallback(
		(currentState: MotorState, target: number, massVal: number): MotorState => {
			const error = target - currentState.angle;
			const newIntegral = Math.max(
				-10,
				Math.min(10, currentState.integral + error * DT),
			);
			const derivative = (error - currentState.prevError) / DT;

			const pTerm = kp * error;
			const iTerm = ki * newIntegral;
			const dTerm = kd * derivative;
			const torque = Math.max(-MAX_TORQUE, Math.min(MAX_TORQUE, pTerm + iTerm + dTerm));

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
		[kp, kd, ki],
	);

	const drawMotor = useCallback(
		(ctx: CanvasRenderingContext2D, angle: number, target: number, massVal: number) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const centerX = width / 2;
			const centerY = height / 2;
			const radius = 95;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#0a0a0a";
			ctx.fillRect(0, 0, width, height);

			// Motor body
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius + 12, 0, Math.PI * 2);
			ctx.fillStyle = "#1e293b";
			ctx.fill();

			// Tick marks
			for (let deg = 0; deg <= 180; deg += 15) {
				const a = (deg * Math.PI) / 180;
				const inner = radius - 5;
				const outer = radius + 6;
				ctx.beginPath();
				ctx.moveTo(centerX + Math.cos(a) * inner, centerY - Math.sin(a) * inner);
				ctx.lineTo(centerX + Math.cos(a) * outer, centerY - Math.sin(a) * outer);
				ctx.strokeStyle = deg % 45 === 0 ? "#64748b" : "#3f3f46";
				ctx.lineWidth = deg % 45 === 0 ? 2 : 1;
				ctx.stroke();
			}

			// Target indicator
			const targetX = centerX + Math.cos(target) * radius;
			const targetY = centerY - Math.sin(target) * radius;
			ctx.beginPath();
			ctx.arc(targetX, targetY, 8, 0, Math.PI * 2);
			ctx.fillStyle = "#f97316";
			ctx.fill();
			ctx.beginPath();
			ctx.arc(targetX, targetY, 3, 0, Math.PI * 2);
			ctx.fillStyle = "#fff";
			ctx.fill();

			// Error arc
			const errorAngle = target - angle;
			if (Math.abs(errorAngle) > 0.02) {
				ctx.beginPath();
				ctx.lineCap = "butt";
				if (errorAngle > 0) {
					ctx.arc(centerX, centerY, radius - 12, -angle, -target, true);
				} else {
					ctx.arc(centerX, centerY, radius - 12, -angle, -target, false);
				}
				ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
				ctx.lineWidth = 3;
				ctx.stroke();
			}

			// Pointer
			const pointerLength = radius - 18;
			const pointerX = centerX + Math.cos(angle) * pointerLength;
			const pointerY = centerY - Math.sin(angle) * pointerLength;

			// Counterweight
			const cwLength = 22;
			const cwX = centerX - Math.cos(angle) * cwLength;
			const cwY = centerY + Math.sin(angle) * cwLength;
			ctx.beginPath();
			ctx.moveTo(centerX, centerY);
			ctx.lineTo(cwX, cwY);
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 5;
			ctx.lineCap = "round";
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(cwX, cwY, 7, 0, Math.PI * 2);
			ctx.fillStyle = "#3b82f6";
			ctx.fill();

			// Main pointer
			ctx.beginPath();
			ctx.moveTo(centerX, centerY);
			ctx.lineTo(pointerX, pointerY);
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 5;
			ctx.lineCap = "round";
			ctx.stroke();

			// Mass on pointer tip (if mass > 0)
			if (massVal > 0) {
				const massSize = 6 + massVal * 10;
				ctx.beginPath();
				ctx.arc(pointerX, pointerY, massSize, 0, Math.PI * 2);
				ctx.fillStyle = "#ef4444";
				ctx.fill();
				ctx.strokeStyle = "#fca5a5";
				ctx.lineWidth = 1.5;
				ctx.stroke();
			}

			// Center hub
			ctx.beginPath();
			ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
			ctx.fillStyle = "#27272a";
			ctx.fill();
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
			if (isRunning && stabilizedAt === null) {
				const now = performance.now();
				const elapsed = (now - startTimeRef.current) / 1000;
				setElapsedTime(elapsed);

				const newState = simulate(stateRef.current, challenge.targetAngle, challenge.mass);
				stateRef.current = newState;
				setState(newState);

				const error = Math.abs(challenge.targetAngle - newState.angle);
				const isStable = error < STABILIZE_THRESHOLD && Math.abs(newState.angularVelocity) < 0.1;

				if (isStable) {
					if (stableStartTime === null) {
						setStableStartTime(elapsed);
					} else if (elapsed - stableStartTime >= STABILIZE_TIME) {
						setStabilizedAt(elapsed);
						setIsRunning(false);
						setResults((prev) => [
							{ challenge: challenge.name, kp, kd, ki, time: elapsed },
							...prev.slice(0, 9),
						]);
					}
				} else {
					setStableStartTime(null);
				}

				if (elapsed > MAX_TIME) {
					setStabilizedAt(-1);
					setIsRunning(false);
					setResults((prev) => [
						{ challenge: challenge.name, kp, kd, ki, time: null },
						...prev.slice(0, 9),
					]);
				}
			}

			drawMotor(ctx, stateRef.current.angle, challenge.targetAngle, challenge.mass);
			animationRef.current = requestAnimationFrame(loop);
		};
		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [simulate, drawMotor, isRunning, isVisible, stabilizedAt, stableStartTime, kp, kd, ki, challenge]);

	const handleStart = () => {
		const initialState = {
			angle: challenge.startAngle,
			angularVelocity: 0,
			integral: 0,
			prevError: 0,
		};
		stateRef.current = initialState;
		setState(initialState);
		setElapsedTime(0);
		setStabilizedAt(null);
		setStableStartTime(null);
		startTimeRef.current = performance.now();
		setIsRunning(true);
	};

	const handleReset = () => {
		const initialState = {
			angle: challenge.startAngle,
			angularVelocity: 0,
			integral: 0,
			prevError: 0,
		};
		stateRef.current = initialState;
		setState(initialState);
		setIsRunning(false);
		setElapsedTime(0);
		setStabilizedAt(null);
		setStableStartTime(null);
	};

	const handleChallengeChange = (idx: number) => {
		setChallengeIdx(idx);
		const newChallenge = CHALLENGES[idx];
		const initialState = {
			angle: newChallenge.startAngle,
			angularVelocity: 0,
			integral: 0,
			prevError: 0,
		};
		stateRef.current = initialState;
		setState(initialState);
		setIsRunning(false);
		setElapsedTime(0);
		setStabilizedAt(null);
		setStableStartTime(null);
	};

	const getStatusColor = () => {
		if (stabilizedAt === null && !isRunning) return "text-zinc-400";
		if (stabilizedAt === -1) return "text-red-400";
		if (stabilizedAt !== null && stabilizedAt <= challenge.parTime) return "text-green-400";
		if (stabilizedAt !== null) return "text-amber-400";
		return "text-blue-400";
	};

	const getStatusText = () => {
		if (stabilizedAt === null && !isRunning) return "Ready";
		if (stabilizedAt === -1) return "Timeout!";
		if (stabilizedAt !== null && stabilizedAt <= challenge.parTime) return "Great!";
		if (stabilizedAt !== null) return "Done";
		return `${elapsedTime.toFixed(1)}s`;
	};

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-5 p-6 bg-zinc-950 w-full rounded-3xl"
		>
			{/* Challenge selector */}
			<div className="flex flex-wrap gap-2 justify-center">
				{CHALLENGES.map((c, idx) => (
					<button
						key={c.name}
						type="button"
						onClick={() => handleChallengeChange(idx)}
						disabled={isRunning}
						className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
							idx === challengeIdx
								? "bg-orange-600 text-white"
								: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
						} disabled:opacity-50`}
					>
						{c.name}
					</button>
				))}
			</div>

			{/* Challenge description */}
			<div className="text-center">
				<div className="text-zinc-400 text-sm">{challenge.description}</div>
				<div className="text-zinc-600 text-xs mt-1">
					Par time: <span className="text-amber-400">{challenge.parTime}s</span>
					{challenge.mass > 0 && (
						<> · Mass: <span className="text-red-400">{challenge.mass}</span></>
					)}
				</div>
			</div>

			<div className="flex flex-col lg:flex-row gap-6 items-center lg:items-start">
				{/* Motor visualization */}
				<div className="flex flex-col items-center gap-3">
					<canvas
						ref={canvasRef}
						width={CANVAS_WIDTH * DPR}
						height={CANVAS_HEIGHT * DPR}
						className="outline-none border-0 block rounded-xl"
						style={{
							width: CANVAS_WIDTH,
							height: CANVAS_HEIGHT,
						}}
					/>
					{/* Timer and status */}
					<div className="flex items-center gap-3">
						<div className="px-4 py-2 bg-zinc-900 rounded-xl text-center min-w-[90px]">
							<div className="text-[10px] text-zinc-500 uppercase tracking-wide">Time</div>
							<div
								className="font-mono text-2xl text-zinc-100"
								style={{ fontVariantNumeric: "tabular-nums" }}
							>
								{elapsedTime.toFixed(2)}
							</div>
						</div>
						<div className={`px-4 py-2 bg-zinc-900 rounded-xl text-center min-w-[80px]`}>
							<div className="text-[10px] text-zinc-500 uppercase tracking-wide">Status</div>
							<div className={`font-medium text-lg ${getStatusColor()}`}>
								{getStatusText()}
							</div>
						</div>
					</div>
				</div>

				{/* Controls */}
				<div className="flex-1 flex flex-col gap-4 w-full max-w-[320px]">
					{/* Sliders */}
					<div className="flex flex-col gap-4 bg-zinc-900/50 rounded-xl p-4">
						<div className="flex items-center gap-3">
							<label className="text-sm font-mono text-blue-400 w-8">Kp</label>
							<div className="flex-1 relative h-2">
								<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
								<div
									className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
									style={{ width: `${(kp / 15) * 100}%` }}
								/>
								<input
									type="range"
									min="0"
									max="15"
									step="0.1"
									value={kp}
									onChange={(e) => setKp(parseFloat(e.target.value))}
									disabled={isRunning}
									className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
								/>
								<div
									className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
									style={{ left: `calc(${(kp / 15) * 100}% - 8px)` }}
								/>
							</div>
							<span
								className="text-sm font-mono text-blue-400 w-12 text-right"
								style={{ fontVariantNumeric: "tabular-nums" }}
							>
								{kp.toFixed(1)}
							</span>
						</div>
						<div className="flex items-center gap-3">
							<label className="text-sm font-mono text-purple-400 w-8">Kd</label>
							<div className="flex-1 relative h-2">
								<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
								<div
									className="absolute left-0 top-0 h-full bg-purple-500 rounded-lg"
									style={{ width: `${(kd / 5) * 100}%` }}
								/>
								<input
									type="range"
									min="0"
									max="5"
									step="0.05"
									value={kd}
									onChange={(e) => setKd(parseFloat(e.target.value))}
									disabled={isRunning}
									className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
								/>
								<div
									className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-full border-2 border-purple-300 pointer-events-none"
									style={{ left: `calc(${(kd / 5) * 100}% - 8px)` }}
								/>
							</div>
							<span
								className="text-sm font-mono text-purple-400 w-12 text-right"
								style={{ fontVariantNumeric: "tabular-nums" }}
							>
								{kd.toFixed(2)}
							</span>
						</div>
						<div className="flex items-center gap-3">
							<label className="text-sm font-mono text-green-400 w-8">Ki</label>
							<div className="flex-1 relative h-2">
								<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
								<div
									className="absolute left-0 top-0 h-full bg-green-500 rounded-lg"
									style={{ width: `${(ki / 5) * 100}%` }}
								/>
								<input
									type="range"
									min="0"
									max="5"
									step="0.05"
									value={ki}
									onChange={(e) => setKi(parseFloat(e.target.value))}
									disabled={isRunning}
									className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
								/>
								<div
									className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-green-500 rounded-full border-2 border-green-300 pointer-events-none"
									style={{ left: `calc(${(ki / 5) * 100}% - 8px)` }}
								/>
							</div>
							<span
								className="text-sm font-mono text-green-400 w-12 text-right"
								style={{ fontVariantNumeric: "tabular-nums" }}
							>
								{ki.toFixed(2)}
							</span>
						</div>
					</div>

					{/* Buttons */}
					<div className="flex gap-2">
						<button
							type="button"
							onClick={handleStart}
							disabled={isRunning}
							className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl transition-all font-semibold text-sm"
						>
							{isRunning ? "Running..." : "GO!"}
						</button>
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
					</div>

					{/* Results table */}
					<div className="bg-zinc-900/50 rounded-xl p-3">
						<div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Your Runs</div>
						{results.length === 0 ? (
							<div className="text-zinc-600 text-sm text-center py-4">
								Tune the gains and hit GO!
							</div>
						) : (
							<div className="max-h-[140px] overflow-y-auto">
								<table className="w-full text-xs font-mono">
									<thead className="sticky top-0 bg-zinc-900">
										<tr className="text-zinc-500">
											<th className="text-left py-1 pr-2">Test</th>
											<th className="text-right py-1 px-1">Kp</th>
											<th className="text-right py-1 px-1">Kd</th>
											<th className="text-right py-1 px-1">Ki</th>
											<th className="text-right py-1 pl-2">Time</th>
										</tr>
									</thead>
									<tbody>
										{results.map((r, i) => (
											<tr
												key={i}
												className={i === 0 ? "text-zinc-200" : "text-zinc-500"}
											>
												<td className="py-1 pr-2 text-zinc-400">{r.challenge}</td>
												<td className="py-1 px-1 text-right text-blue-400">{r.kp.toFixed(1)}</td>
												<td className="py-1 px-1 text-right text-purple-400">{r.kd.toFixed(1)}</td>
												<td className="py-1 px-1 text-right text-green-400">{r.ki.toFixed(1)}</td>
												<td
													className={`py-1 pl-2 text-right ${
														r.time === null
															? "text-red-400"
															: r.time <= CHALLENGES.find(c => c.name === r.challenge)!.parTime
																? "text-green-400"
																: "text-amber-400"
													}`}
												>
													{r.time === null ? "Fail" : `${r.time.toFixed(2)}s`}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			</div>

			<p className="text-xs text-zinc-500 text-center">
				Hold within 1° of the <span className="text-orange-400">target</span> for 0.5s to complete
			</p>
		</div>
	);
}
