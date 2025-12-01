import React, { useRef, useEffect, useState, useCallback } from "react";

interface OvenState {
	temperature: number;
	integral: number;
	prevError: number;
}

const THERMAL_MASS = 50;
const HEAT_LOSS_COEFF = 0.02;
const HEATER_POWER = 100;
const DT = 1 / 30;
const AMBIENT_TEMP = 70;
const DPR =
	typeof window !== "undefined"
		? Math.min(window.devicePixelRatio || 1, 2)
		: 2;
const OVEN_WIDTH = 320;
const OVEN_HEIGHT = 280;
const PLOT_WIDTH = 400;
const PLOT_HEIGHT = 280;
const DEFAULT_KP = 5;
const DEFAULT_KI = 0.5;
const DEFAULT_TARGET_TEMP = 350;

export default function OvenController() {
	const containerRef = useRef<HTMLDivElement>(null);
	const ovenCanvasRef = useRef<HTMLCanvasElement>(null);
	const plotCanvasRef = useRef<HTMLCanvasElement>(null);
	const [state, setState] = useState<OvenState>({
		temperature: AMBIENT_TEMP,
		integral: 0,
		prevError: 0,
	});
	const stateRef = useRef<OvenState>(state);
	const [targetTemp, setTargetTemp] = useState(DEFAULT_TARGET_TEMP);
	const [kp, setKp] = useState(DEFAULT_KP);
	const [ki, setKi] = useState(DEFAULT_KI);
	const [doorOpen, setDoorOpen] = useState(false);
	const [conditionalI, setConditionalI] = useState(false);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [heaterPower, setHeaterPower] = useState(0);
	const [pOutput, setPOutput] = useState(0);
	const [iOutput, setIOutput] = useState(0);
	const historyRef = useRef<{ temp: number; target: number }[]>([]);
	const animationRef = useRef<number>();

	const simulate = useCallback(
		(
			currentState: OvenState,
			target: number,
			kpVal: number,
			kiVal: number,
			isDoorOpen: boolean,
			useConditionalI: boolean,
		) => {
			const error = target - currentState.temperature;
			
			// Conditional integration: only accumulate integral when close to target (within 50°)
			const shouldAccumulateI = !useConditionalI || Math.abs(error) < 50;
			const newIntegral = shouldAccumulateI
				? Math.max(-1000, Math.min(1000, currentState.integral + error * DT))
				: currentState.integral;

			const pTerm = kpVal * error;
			const iTerm = kiVal * newIntegral;
			const heaterOutput = Math.max(0, Math.min(100, (pTerm + iTerm) / 2));

			setPOutput(pTerm);
			setIOutput(iTerm);
			setHeaterPower(heaterOutput);

			const heatInput = (heaterOutput / 100) * HEATER_POWER;
			const heatLoss =
				HEAT_LOSS_COEFF *
				(currentState.temperature - AMBIENT_TEMP) *
				(isDoorOpen ? 5 : 1);
			const tempChange = (heatInput - heatLoss) / THERMAL_MASS;
			const newTemp = currentState.temperature + tempChange * DT * 60;

			return { temperature: newTemp, integral: newIntegral, prevError: error };
		},
		[],
	);

	const drawOven = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			temp: number,
			target: number,
			power: number,
			isDoorOpen: boolean,
		) => {
			const width = OVEN_WIDTH;
			const height = OVEN_HEIGHT;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const ovenX = 30;
			const ovenY = 30;
			const ovenW = 180;
			const ovenH = 140;
			const glowIntensity = Math.min((temp - AMBIENT_TEMP) / 400, 1);

			// Oven body
			ctx.fillStyle = "#1e293b";
			ctx.fillRect(ovenX, ovenY, ovenW, ovenH);
			ctx.strokeStyle = "#475569";
			ctx.lineWidth = 3;
			ctx.strokeRect(ovenX, ovenY, ovenW, ovenH);

			// Interior
			const interiorColor = `rgb(${Math.min(255, 50 + glowIntensity * 200)}, ${Math.max(30, 50 - glowIntensity * 20)}, ${Math.max(20, 30 - glowIntensity * 10)})`;
			ctx.fillStyle = interiorColor;
			ctx.fillRect(ovenX + 8, ovenY + 8, ovenW - 16, ovenH - 16);

			// Heating element
			if (power > 10) {
				ctx.strokeStyle = `rgba(255, ${255 - power * 2}, 0, ${power / 100})`;
				ctx.lineWidth = 3;
				ctx.beginPath();
				for (let i = 0; i < 4; i++) {
					const y = ovenY + ovenH - 20;
					const startX = ovenX + 15 + i * 40;
					ctx.moveTo(startX, y);
					ctx.bezierCurveTo(
						startX + 8,
						y - 8,
						startX + 16,
						y + 8,
						startX + 24,
						y,
					);
				}
				ctx.stroke();
			}

			// Door open overlay
			if (isDoorOpen) {
				ctx.fillStyle = "rgba(100, 200, 255, 0.25)";
				ctx.fillRect(ovenX + 8, ovenY + 8, ovenW - 16, ovenH - 16);
				ctx.fillStyle = "#60a5fa";
				ctx.font = "bold 12px monospace";
				ctx.textAlign = "center";
				ctx.fillText("DOOR OPEN", ovenX + ovenW / 2, ovenY + ovenH / 2);
			}

			// Temperature display
			ctx.fillStyle = "#000";
			ctx.beginPath();
			ctx.roundRect(ovenX + ovenW + 15, ovenY, 80, 50, 8);
			ctx.fill();

			ctx.fillStyle = temp > target + 20 ? "#ef4444" : "#22c55e";
			ctx.font = "bold 22px monospace";
			ctx.textAlign = "center";
			ctx.fillText(
				`${Math.round(temp)}°F`,
				ovenX + ovenW + 55,
				ovenY + 33,
			);

			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.fillText(`Target: ${target}°F`, ovenX + ovenW + 55, ovenY + 65);

			// Heater bar
			const barY = ovenY + ovenH + 20;
			ctx.fillStyle = "#1e293b";
			ctx.beginPath();
			ctx.roundRect(ovenX, barY, ovenW, 14, 4);
			ctx.fill();

			ctx.fillStyle =
				power > 80 ? "#ef4444" : power > 50 ? "#f59e0b" : "#22c55e";
			ctx.beginPath();
			ctx.roundRect(ovenX, barY, ovenW * (power / 100), 14, 4);
			ctx.fill();

			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText(`Heater: ${Math.round(power)}%`, ovenX, barY + 30);
		},
		[],
	);

	const drawPlot = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			history: { temp: number; target: number }[],
		) => {
			const width = PLOT_WIDTH;
			const height = PLOT_HEIGHT;
			const padding = 46;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Grid
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
			ctx.font = "14px monospace";
			ctx.textAlign = "right";
			ctx.fillText("500°", padding - 8, padding + 5);
			ctx.fillText("375°", padding - 8, padding + (height - 2 * padding) / 4 + 5);
			ctx.fillText("250°", padding - 8, height / 2 + 5);
			ctx.fillText("125°", padding - 8, padding + ((height - 2 * padding) * 3) / 4 + 5);
			ctx.fillText("0°", padding - 8, height - padding + 5);

			// Target line
			if (history.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#f97316";
				ctx.lineWidth = 2;
				ctx.setLineDash([5, 5]);
				for (let i = 0; i < history.length; i++) {
					const x =
						padding + ((width - 2 * padding) * i) / (history.length - 1);
					const y =
						padding +
						(height - 2 * padding) * (1 - history[i].target / 500);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
				ctx.setLineDash([]);
			}

			// Temperature line
			if (history.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#ef4444";
				ctx.lineWidth = 2;
				for (let i = 0; i < history.length; i++) {
					const x =
						padding + ((width - 2 * padding) * i) / (history.length - 1);
					const y =
						padding +
						(height - 2 * padding) *
							(1 - Math.min(history[i].temp, 500) / 500);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			}

			// Title
			ctx.fillStyle = "#94a3b8";
			ctx.font = "16px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Temperature over time", padding, 22);

			// Legend
			const legendY = height - 12;
			ctx.fillStyle = "#fb923c";
			ctx.fillRect(padding, legendY - 10, 10, 10);
			ctx.font = "14px monospace";
			ctx.fillStyle = "#fb923c";
			ctx.fillText("Target", padding + 16, legendY);

			ctx.fillStyle = "#ef4444";
			ctx.fillRect(padding + 85, legendY - 10, 10, 10);
			ctx.fillStyle = "#ef4444";
			ctx.fillText("Temp", padding + 101, legendY);
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
		const ovenCanvas = ovenCanvasRef.current;
		const plotCanvas = plotCanvasRef.current;
		if (!ovenCanvas || !plotCanvas) return;
		const ovenCtx = ovenCanvas.getContext("2d");
		const plotCtx = plotCanvas.getContext("2d");
		if (!ovenCtx || !plotCtx || !isVisible) return;

		const loop = () => {
			if (isRunning) {
				const newState = simulate(
					stateRef.current,
					targetTemp,
					kp,
					ki,
					doorOpen,
					conditionalI,
				);
				stateRef.current = newState;
				setState(newState);
				historyRef.current.push({
					temp: newState.temperature,
					target: targetTemp,
				});
				if (historyRef.current.length > 300) historyRef.current.shift();
			}
			drawOven(
				ovenCtx,
				stateRef.current.temperature,
				targetTemp,
				heaterPower,
				doorOpen,
			);
			drawPlot(plotCtx, historyRef.current);
			animationRef.current = requestAnimationFrame(loop);
		};
		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [
		simulate,
		drawOven,
		drawPlot,
		targetTemp,
		isRunning,
		conditionalI,
		isVisible,
		kp,
		ki,
		doorOpen,
		heaterPower,
	]);

	const handleReset = () => {
		const initialState = {
			temperature: AMBIENT_TEMP,
			integral: 0,
			prevError: 0,
		};
		stateRef.current = initialState;
		setState(initialState);
		historyRef.current = [];
		setTargetTemp(DEFAULT_TARGET_TEMP);
		setKp(DEFAULT_KP);
		setKi(DEFAULT_KI);
		setDoorOpen(false);
		setConditionalI(false);
	};

	const presets = [
		{ name: "Baking", temp: 350 },
		{ name: "Broiling", temp: 450 },
		{ name: "Low Heat", temp: 200 },
	];

	const error = targetTemp - state.temperature;

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl"
		>
			<div className="flex flex-col md:flex-row gap-4 items-start w-full">
				<div className="flex-1 flex flex-col items-center min-w-0">
					<canvas
						ref={ovenCanvasRef}
						width={OVEN_WIDTH * DPR}
						height={OVEN_HEIGHT * DPR}
						className="outline-none border-0 block w-full max-w-[320px]"
						style={{ aspectRatio: `${OVEN_WIDTH} / ${OVEN_HEIGHT}` }}
					/>
				</div>
				<div className="flex-1 flex flex-col items-center min-w-0">
					<canvas
						ref={plotCanvasRef}
						width={PLOT_WIDTH * DPR}
						height={PLOT_HEIGHT * DPR}
						className="outline-none border-0 block w-full max-w-[400px]"
						style={{ aspectRatio: `${PLOT_WIDTH} / ${PLOT_HEIGHT}` }}
					/>
				</div>
			</div>

			<div className="flex flex-wrap gap-2 justify-center">
				{presets.map((preset) => (
					<button
						key={preset.name}
						type="button"
						onClick={() => setTargetTemp(preset.temp)}
						className={`px-3 py-1.5 rounded-xl text-sm font-mono transition-colors ${targetTemp === preset.temp ? "bg-orange-600 text-white" : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300"}`}
					>
						{preset.name} ({preset.temp}°F)
					</button>
				))}
			</div>

			<div className="flex flex-col gap-3 px-2 pb-2">
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-8">Kp</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${((kp - 0.1) / 19.9) * 100}%` }}
						/>
						<input
							type="range"
							min="0.1"
							max="20"
							step="0.5"
							value={kp}
							onChange={(e) => setKp(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${((kp - 0.1) / 19.9) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-blue-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{kp.toFixed(1)}
					</span>
				</div>
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-8">Ki</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-green-500 rounded-lg"
							style={{ width: `${(ki / 2) * 100}%` }}
						/>
						<input
							type="range"
							min="0"
							max="2"
							step="0.05"
							value={ki}
							onChange={(e) => setKi(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-green-500 rounded-full border-2 border-green-300 pointer-events-none"
							style={{ left: `calc(${(ki / 2) * 100}% - 8px)` }}
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
						onClick={() => setDoorOpen(!doorOpen)}
						className={`p-2.5 rounded-xl transition-all ${doorOpen ? "bg-cyan-600/20 hover:bg-cyan-600/30" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700"}`}
						title={doorOpen ? "Close Door (reduce heat loss)" : "Open Door (increase heat loss)"}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#22d3ee"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							{doorOpen ? (
								<>
									{/* Open door */}
									<path d="M4 4h6l8 3v14H4z" />
									<path d="M10 4l8 3" />
									<circle cx="8" cy="13" r="1" fill="#22d3ee" />
								</>
							) : (
								<>
									{/* Closed door */}
									<rect x="4" y="4" width="14" height="17" rx="1" />
									<circle cx="15" cy="13" r="1" fill="#22d3ee" />
								</>
							)}
						</svg>
					</button>
					<button
						type="button"
						onClick={() => setConditionalI(!conditionalI)}
						className={`p-2.5 rounded-xl transition-all ${conditionalI ? "bg-green-600/20 hover:bg-green-600/30" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700"}`}
						title={conditionalI ? "Conditional I ON - only accumulates near target" : "Conditional I OFF - always accumulates"}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#4ade80"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="12" cy="12" r="8" />
							<path d="M12 8v4" />
							<path d="M12 16h.01" />
							{conditionalI && <path d="M8 12h8" strokeWidth="2.5" />}
						</svg>
					</button>
				</div>
				<div className="flex gap-2 font-mono text-xs flex-wrap justify-center">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[55px]">
						<span className="text-zinc-500 text-[10px]">Error</span>
						<span
							className="text-red-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{error < 0 ? "−" : ""}
							</span>
							{Math.min(Math.abs(error), 999).toFixed(0)}°
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[55px]">
						<span className="text-zinc-500 text-[10px]">P</span>
						<span
							className="text-blue-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{pOutput < 0 ? "−" : ""}
							</span>
							{Math.min(Math.abs(pOutput), 999).toFixed(0)}
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[55px]">
						<span className="text-zinc-500 text-[10px]">I</span>
						<span
							className="text-green-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{iOutput < 0 ? "−" : ""}
							</span>
							{Math.min(Math.abs(iOutput), 999).toFixed(0)}
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[55px]">
						<span className="text-zinc-500 text-[10px]">Heat</span>
						<span
							className={
								heaterPower > 80
									? "text-red-400"
									: heaterPower > 50
										? "text-amber-400"
										: "text-green-400"
							}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{Math.round(heaterPower)}%
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
