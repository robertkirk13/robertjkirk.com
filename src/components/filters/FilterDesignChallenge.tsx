import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 320;

interface Challenge {
	id: string;
	name: string;
	description: string;
	targetType: "lowpass" | "highpass" | "bandpass";
	targetCutoff: number;
	signalFreqs: number[];
	noiseFreqs: number[];
	tolerance: number;
}

const CHALLENGES: Challenge[] = [
	{
		id: "remove-hum",
		name: "Remove Power Line Hum",
		description: "A 50Hz hum is contaminating your 10Hz sensor signal. Design a low-pass filter to remove it.",
		targetType: "lowpass",
		targetCutoff: 0.3,
		signalFreqs: [0.1],
		noiseFreqs: [0.5],
		tolerance: 0.15,
	},
	{
		id: "extract-carrier",
		name: "Extract High Frequency",
		description: "Extract the high-frequency carrier signal from a low-frequency envelope.",
		targetType: "highpass",
		targetCutoff: 0.35,
		signalFreqs: [0.4],
		noiseFreqs: [0.1],
		tolerance: 0.15,
	},
	{
		id: "isolate-band",
		name: "Isolate Frequency Band",
		description: "Isolate the mid-frequency component from both low and high frequency interference.",
		targetType: "bandpass",
		targetCutoff: 0.25,
		signalFreqs: [0.25],
		noiseFreqs: [0.05, 0.45],
		tolerance: 0.1,
	},
];

export default function FilterDesignChallenge() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [currentChallenge, setCurrentChallenge] = useState(0);
	const [filterType, setFilterType] = useState<"lowpass" | "highpass" | "bandpass">("lowpass");
	const [cutoff, setCutoff] = useState(0.25);
	const [numTaps, setNumTaps] = useState(15);
	const [completed, setCompleted] = useState<Set<string>>(new Set());
	const animationRef = useRef<number>();

	const challenge = CHALLENGES[currentChallenge];

	// Window function
	const hamming = useCallback((n: number, N: number) => {
		return 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
	}, []);

	// Generate FIR coefficients
	const getFIRCoeffs = useCallback(
		(fc: number, taps: number, type: "lowpass" | "highpass" | "bandpass") => {
			const coeffs: number[] = [];
			const M = taps - 1;
			let sum = 0;

			for (let n = 0; n <= M; n++) {
				const sincArg = n - M / 2;
				let h: number;

				if (type === "lowpass") {
					h = sincArg === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * sincArg) / (Math.PI * sincArg);
				} else if (type === "highpass") {
					const lowH = sincArg === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * sincArg) / (Math.PI * sincArg);
					const delta = sincArg === 0 ? 1 : 0;
					h = delta - lowH;
				} else {
					// Bandpass centered at fc
					const bw = 0.1;
					const fc1 = Math.max(0.01, fc - bw);
					const fc2 = Math.min(0.49, fc + bw);
					const low1 = sincArg === 0 ? 2 * fc1 : Math.sin(2 * Math.PI * fc1 * sincArg) / (Math.PI * sincArg);
					const low2 = sincArg === 0 ? 2 * fc2 : Math.sin(2 * Math.PI * fc2 * sincArg) / (Math.PI * sincArg);
					h = low2 - low1;
				}

				const w = hamming(n, taps);
				coeffs.push(h * w);
				sum += Math.abs(h * w);
			}

			// Normalize
			return coeffs.map((c) => c / sum * (type === "bandpass" ? 2 : 1));
		},
		[hamming],
	);

	// Apply filter
	const applyFIR = useCallback((signal: number[], coeffs: number[]) => {
		const result: number[] = [];
		for (let n = 0; n < signal.length; n++) {
			let sum = 0;
			for (let k = 0; k < coeffs.length; k++) {
				const idx = n - k;
				if (idx >= 0) sum += coeffs[k] * signal[idx];
			}
			result.push(sum);
		}
		return result;
	}, []);

	// Compute frequency response
	const getFrequencyResponse = useCallback((coeffs: number[], numPoints: number = 100) => {
		const response: number[] = [];
		for (let i = 0; i < numPoints; i++) {
			const freq = (i / numPoints) * 0.5;
			let real = 0, imag = 0;
			for (let k = 0; k < coeffs.length; k++) {
				real += coeffs[k] * Math.cos(2 * Math.PI * freq * k);
				imag -= coeffs[k] * Math.sin(2 * Math.PI * freq * k);
			}
			response.push(Math.sqrt(real * real + imag * imag));
		}
		return response;
	}, []);

	// Check if challenge is passed
	const checkChallenge = useCallback(
		(coeffs: number[], ch: Challenge) => {
			const response = getFrequencyResponse(coeffs);

			// Check signal preservation
			for (const freq of ch.signalFreqs) {
				const idx = Math.floor((freq / 0.5) * response.length);
				if (response[idx] < 0.5) return false;
			}

			// Check noise rejection
			for (const freq of ch.noiseFreqs) {
				const idx = Math.floor((freq / 0.5) * response.length);
				if (response[idx] > 0.3) return false;
			}

			return true;
		},
		[getFrequencyResponse],
	);

	const draw = useCallback(
		(ctx: CanvasRenderingContext2D, currentTime: number, fc: number, taps: number, type: "lowpass" | "highpass" | "bandpass", ch: Challenge) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const coeffs = getFIRCoeffs(fc, taps, type);
			const response = getFrequencyResponse(coeffs);
			const isPassing = checkChallenge(coeffs, ch);

			// Update completed set
			if (isPassing && !completed.has(ch.id)) {
				setCompleted((prev) => new Set([...prev, ch.id]));
			}

			const sectionHeight = (height - 60) / 2;

			// Section 1: Frequency response with target zones
			const sec1Y = 25;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText(`Challenge: ${ch.name}`, padding, sec1Y);

			const freqPlotY = sec1Y + 15;
			const freqPlotHeight = sectionHeight - 20;

			// Grid
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 4; i++) {
				const y = freqPlotY + (freqPlotHeight * i) / 4;
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - padding, y);
				ctx.stroke();
			}

			// Draw target zones (where signal should pass)
			ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
			for (const freq of ch.signalFreqs) {
				const x = padding + (freq / 0.5) * plotWidth;
				ctx.fillRect(x - 15, freqPlotY, 30, freqPlotHeight);
			}

			// Draw rejection zones
			ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
			for (const freq of ch.noiseFreqs) {
				const x = padding + (freq / 0.5) * plotWidth;
				ctx.fillRect(x - 15, freqPlotY, 30, freqPlotHeight);
			}

			// Draw frequency response
			ctx.beginPath();
			ctx.strokeStyle = isPassing ? "#22c55e" : "#f97316";
			ctx.lineWidth = 2;
			const maxResp = Math.max(...response);
			for (let i = 0; i < response.length; i++) {
				const x = padding + (i / response.length) * plotWidth;
				const y = freqPlotY + freqPlotHeight - (response[i] / maxResp) * freqPlotHeight * 0.9;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw cutoff line
			const cutoffX = padding + (fc / 0.5) * plotWidth;
			ctx.strokeStyle = "rgba(249, 115, 22, 0.5)";
			ctx.setLineDash([5, 5]);
			ctx.beginPath();
			ctx.moveTo(cutoffX, freqPlotY);
			ctx.lineTo(cutoffX, freqPlotY + freqPlotHeight);
			ctx.stroke();
			ctx.setLineDash([]);

			// Labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			ctx.fillText("0", padding, freqPlotY + freqPlotHeight + 12);
			ctx.fillText("0.5", width - padding, freqPlotY + freqPlotHeight + 12);

			// Section 2: Signal filtering
			const sec2Y = sec1Y + sectionHeight + 15;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Live Signal", padding, sec2Y);

			const sigPlotY = sec2Y + 15;
			const sigPlotHeight = sectionHeight - 25;
			const sigCenterY = sigPlotY + sigPlotHeight / 2;

			// Generate signal
			const signal: number[] = [];
			const numSamples = 200;
			for (let i = 0; i < numSamples; i++) {
				const t = currentTime + i / 60;
				let value = 0;
				for (const freq of ch.signalFreqs) {
					value += 0.5 * Math.sin(2 * Math.PI * freq * t * 30);
				}
				for (const freq of ch.noiseFreqs) {
					value += 0.5 * Math.sin(2 * Math.PI * freq * t * 30);
				}
				signal.push(value);
			}

			const filtered = applyFIR(signal, coeffs);

			// Draw original
			ctx.beginPath();
			ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
			ctx.lineWidth = 1;
			for (let i = 0; i < signal.length; i++) {
				const x = padding + (i / signal.length) * plotWidth;
				const y = sigCenterY - signal[i] * (sigPlotHeight * 0.35);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw filtered
			ctx.beginPath();
			ctx.strokeStyle = isPassing ? "#22c55e" : "#f97316";
			ctx.lineWidth = 2;
			for (let i = 0; i < filtered.length; i++) {
				const x = padding + (i / filtered.length) * plotWidth;
				const y = sigCenterY - filtered[i] * (sigPlotHeight * 0.35);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Status indicator
			if (isPassing) {
				ctx.fillStyle = "#22c55e";
				ctx.font = "bold 14px monospace";
				ctx.textAlign = "right";
				ctx.fillText("✓ PASSED", width - padding, sec1Y);
			}

			// Legend
			const legendY = height - 8;
			ctx.font = "10px sans-serif";
			ctx.textAlign = "left";

			ctx.fillStyle = "rgba(34, 197, 94, 0.4)";
			ctx.fillRect(padding, legendY - 8, 12, 12);
			ctx.fillStyle = "#22c55e";
			ctx.fillText("Pass band", padding + 16, legendY);

			ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
			ctx.fillRect(padding + 90, legendY - 8, 12, 12);
			ctx.fillStyle = "#ef4444";
			ctx.fillText("Stop band", padding + 106, legendY);
		},
		[getFIRCoeffs, getFrequencyResponse, checkChallenge, applyFIR, completed],
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
			draw(ctx, time, cutoff, numTaps, filterType, challenge);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, cutoff, numTaps, filterType, challenge]);

	const handleReset = () => {
		setCutoff(0.25);
		setNumTaps(15);
		setFilterType("lowpass");
	};

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl"
		>
			{/* Challenge selector */}
			<div className="flex gap-2 flex-wrap">
				{CHALLENGES.map((ch, idx) => (
					<button
						key={ch.id}
						type="button"
						onClick={() => {
							setCurrentChallenge(idx);
							handleReset();
						}}
						className={`px-3 py-1.5 rounded-xl text-sm font-mono transition-all flex items-center gap-1.5 ${
							currentChallenge === idx
								? "bg-orange-600/30 text-orange-400"
								: completed.has(ch.id)
									? "bg-emerald-900/30 text-emerald-400"
									: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
						}`}
					>
						{completed.has(ch.id) && <span>✓</span>}
						{ch.name}
					</button>
				))}
			</div>

			<p className="text-sm text-zinc-400 px-1">{challenge.description}</p>

			<canvas
				ref={canvasRef}
				width={CANVAS_WIDTH * DPR}
				height={CANVAS_HEIGHT * DPR}
				className="w-full rounded-xl"
				style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
			/>

			<div className="flex flex-col gap-3 px-2">
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-20">Cutoff</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-orange-500 rounded-lg"
							style={{ width: `${(cutoff / 0.5) * 100}%` }}
						/>
						<input
							type="range"
							min="0.05"
							max="0.45"
							step="0.01"
							value={cutoff}
							onChange={(e) => setCutoff(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-orange-500 rounded-full border-2 border-orange-300 pointer-events-none"
							style={{ left: `calc(${(cutoff / 0.5) * 100}% - 8px)` }}
						/>
					</div>
					<span className="text-sm font-mono text-orange-400 w-12 text-right">{cutoff.toFixed(2)}</span>
				</div>

				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-20">Taps</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${((numTaps - 5) / 46) * 100}%` }}
						/>
						<input
							type="range"
							min="5"
							max="51"
							step="2"
							value={numTaps}
							onChange={(e) => setNumTaps(parseInt(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${((numTaps - 5) / 46) * 100}% - 8px)` }}
						/>
					</div>
					<span className="text-sm font-mono text-blue-400 w-12 text-right">{numTaps}</span>
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
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<rect x="6" y="4" width="4" height="16" rx="1" />
								<rect x="14" y="4" width="4" height="16" rx="1" />
							</svg>
						) : (
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#a1a1aa" stroke="#a1a1aa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<polygon points="5 3 19 12 5 21 5 3" />
							</svg>
						)}
					</button>
				</div>
				<div className="flex gap-2">
					{(["lowpass", "highpass", "bandpass"] as const).map((type) => (
						<button
							key={type}
							type="button"
							onClick={() => setFilterType(type)}
							className={`px-3 py-1.5 rounded-xl text-sm font-mono transition-all ${
								filterType === type
									? "bg-purple-600/30 text-purple-400"
									: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
							}`}
						>
							{type === "lowpass" ? "LP" : type === "highpass" ? "HP" : "BP"}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

