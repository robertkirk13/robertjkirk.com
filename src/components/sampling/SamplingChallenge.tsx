import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 280;

interface Challenge {
	name: string;
	description: string;
	signalFreq: number;
	targetSampleRate: { min: number; max: number };
	hint: string;
}

const CHALLENGES: Challenge[] = [
	{
		name: "Audio Basics",
		description: "Sample a 1 kHz audio tone without aliasing",
		signalFreq: 1,
		targetSampleRate: { min: 2.1, max: 100 },
		hint: "Sample rate must be > 2× the signal frequency",
	},
	{
		name: "Music Quality",
		description: "Capture a 5 Hz signal with at least 3× oversampling",
		signalFreq: 5,
		targetSampleRate: { min: 30, max: 100 },
		hint: "Oversampling means fs >> 2×f, try 3× or higher",
	},
	{
		name: "Efficiency",
		description: "Sample a 8 Hz signal with minimal sample rate (within 20% of Nyquist)",
		signalFreq: 8,
		targetSampleRate: { min: 16.1, max: 19.2 }, // Within 20% above Nyquist
		hint: "Just above Nyquist minimizes data but risks quality",
	},
	{
		name: "CD Quality",
		description: "A 10 Hz signal needs CD-like quality (2.2× oversampling)",
		signalFreq: 10,
		targetSampleRate: { min: 44, max: 100 },
		hint: "CDs use 44.1 kHz for 20 kHz audio (≈2.2×)",
	},
];

export default function SamplingChallenge() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [challengeIndex, setChallengeIndex] = useState(0);
	const [sampleRate, setSampleRate] = useState(10);
	const [showHint, setShowHint] = useState(false);
	const [completed, setCompleted] = useState<boolean[]>([false, false, false, false]);
	const animationRef = useRef<number>();

	const challenge = CHALLENGES[challengeIndex];

	// Check if current sample rate meets challenge requirements
	const checkSolution = useCallback(() => {
		const { targetSampleRate } = challenge;
		return sampleRate >= targetSampleRate.min && sampleRate <= targetSampleRate.max;
	}, [challenge, sampleRate]);

	const isCorrect = checkSolution();
	const nyquist = sampleRate / 2;
	const isAliasing = challenge.signalFreq > nyquist;

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			freq: number,
			fs: number,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;
			const plotHeight = height - 2 * padding;
			const centerY = padding + plotHeight / 2;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Grid
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 4; i++) {
				const y = padding + (plotHeight * i) / 4;
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - padding, y);
				ctx.stroke();
			}

			// Center line
			ctx.strokeStyle = "#334155";
			ctx.beginPath();
			ctx.moveTo(padding, centerY);
			ctx.lineTo(width - padding, centerY);
			ctx.stroke();

			const timeWindow = 2;

			// Draw original signal
			ctx.beginPath();
			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 2;
			for (let i = 0; i <= 400; i++) {
				const t = currentTime + (timeWindow * i) / 400;
				const x = padding + (plotWidth * i) / 400;
				const y = centerY - (plotHeight / 2) * 0.8 * Math.sin(2 * Math.PI * freq * t);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Generate and draw samples
			const samplePeriod = 1 / fs;
			const firstIdx = Math.ceil(currentTime / samplePeriod);
			const lastIdx = Math.floor((currentTime + timeWindow) / samplePeriod);
			const samples: { t: number; value: number }[] = [];

			for (let i = firstIdx; i <= lastIdx; i++) {
				const t = i * samplePeriod;
				samples.push({ t, value: Math.sin(2 * Math.PI * freq * t) });
			}

			// Draw reconstructed signal
			if (samples.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = isAliasing ? "#ef4444" : "#f97316";
				ctx.lineWidth = 2;
				for (let i = 0; i <= 400; i++) {
					const t = currentTime + (timeWindow * i) / 400;
					const x = padding + (plotWidth * i) / 400;

					// Linear interpolation
					let value = 0;
					for (let j = 0; j < samples.length - 1; j++) {
						if (t >= samples[j].t && t <= samples[j + 1].t) {
							const alpha = (t - samples[j].t) / (samples[j + 1].t - samples[j].t);
							value = samples[j].value * (1 - alpha) + samples[j + 1].value * alpha;
							break;
						}
					}

					const y = centerY - (plotHeight / 2) * 0.8 * value;
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			}

			// Draw sample points
			ctx.fillStyle = "#3b82f6";
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			for (const sample of samples) {
				const x = padding + ((sample.t - currentTime) / timeWindow) * plotWidth;
				const y = centerY - (plotHeight / 2) * 0.8 * sample.value;

				ctx.beginPath();
				ctx.moveTo(x, centerY);
				ctx.lineTo(x, y);
				ctx.stroke();

				ctx.beginPath();
				ctx.arc(x, y, 4, 0, Math.PI * 2);
				ctx.fill();
			}

			// Title
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText(`Signal: ${freq} Hz`, padding, padding - 12);

			// Status indicator
			if (isAliasing) {
				ctx.fillStyle = "#ef4444";
				ctx.textAlign = "right";
				ctx.fillText("⚠ ALIASING!", width - padding, padding - 12);
			}

			// Legend
			const legendY = height - 12;
			ctx.font = "10px sans-serif";
			ctx.textAlign = "left";

			ctx.fillStyle = "#22c55e";
			ctx.fillRect(padding, legendY - 8, 10, 3);
			ctx.fillText("Original", padding + 14, legendY);

			ctx.fillStyle = isAliasing ? "#ef4444" : "#f97316";
			ctx.fillRect(padding + 80, legendY - 8, 10, 3);
			ctx.fillText("Sampled", padding + 94, legendY);
		},
		[isAliasing],
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
			draw(ctx, time, challenge.signalFreq, sampleRate);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, challenge.signalFreq, sampleRate]);

	const handleNextChallenge = () => {
		if (isCorrect) {
			const newCompleted = [...completed];
			newCompleted[challengeIndex] = true;
			setCompleted(newCompleted);
		}
		setChallengeIndex((i) => (i + 1) % CHALLENGES.length);
		setShowHint(false);
		setTime(0);
	};

	const handlePrevChallenge = () => {
		setChallengeIndex((i) => (i - 1 + CHALLENGES.length) % CHALLENGES.length);
		setShowHint(false);
		setTime(0);
	};

	const handleReset = () => {
		setTime(0);
		setSampleRate(10);
		setShowHint(false);
	};

	const completedCount = completed.filter(Boolean).length;

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl"
		>
			{/* Challenge header */}
			<div className="flex justify-between items-start gap-4">
				<div>
					<div className="flex items-center gap-2">
						<span className="text-xs font-mono text-zinc-500">
							Challenge {challengeIndex + 1}/{CHALLENGES.length}
						</span>
						{completed[challengeIndex] && (
							<span className="text-xs bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded">
								✓ Completed
							</span>
						)}
					</div>
					<h3 className="text-lg font-semibold text-zinc-200 mt-1">{challenge.name}</h3>
					<p className="text-sm text-zinc-400 mt-1">{challenge.description}</p>
				</div>
				<div className="text-right">
					<div className="text-xs text-zinc-500">Progress</div>
					<div className="text-lg font-mono text-emerald-400">
						{completedCount}/{CHALLENGES.length}
					</div>
				</div>
			</div>

			<canvas
				ref={canvasRef}
				width={CANVAS_WIDTH * DPR}
				height={CANVAS_HEIGHT * DPR}
				className="w-full rounded-xl"
				style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
			/>

			{/* Hint box */}
			{showHint && (
				<div className="px-3 py-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-sm text-yellow-400">
					💡 {challenge.hint}
				</div>
			)}

			{/* Success/failure feedback */}
			<div
				className={`px-3 py-2 rounded-lg text-sm ${
					isCorrect
						? "bg-emerald-900/20 border border-emerald-700/30 text-emerald-400"
						: isAliasing
							? "bg-red-900/20 border border-red-700/30 text-red-400"
							: "bg-zinc-800/50 border border-zinc-700/30 text-zinc-400"
				}`}
			>
				{isCorrect ? (
					<>✓ Perfect! Your sample rate of {sampleRate} Hz meets the requirements.</>
				) : isAliasing ? (
					<>✗ Aliasing detected! Sample rate too low (need fs &gt; {(challenge.signalFreq * 2).toFixed(0)} Hz)</>
				) : (
					<>Adjust the sample rate to meet the challenge requirements</>
				)}
			</div>

			<div className="flex flex-col gap-3 px-2">
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-24">Sample rate</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						{/* Target zone indicator */}
						<div
							className="absolute top-0 h-full bg-emerald-500/20 rounded"
							style={{
								left: `${((challenge.targetSampleRate.min - 1) / 99) * 100}%`,
								width: `${((challenge.targetSampleRate.max - challenge.targetSampleRate.min) / 99) * 100}%`,
							}}
						/>
						{/* Nyquist marker */}
						<div
							className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-yellow-500/70"
							style={{ left: `${((challenge.signalFreq * 2 - 1) / 99) * 100}%` }}
						/>
						<div
							className={`absolute left-0 top-0 h-full rounded-lg ${isCorrect ? "bg-emerald-500" : isAliasing ? "bg-red-500" : "bg-blue-500"}`}
							style={{ width: `${((sampleRate - 1) / 99) * 100}%` }}
						/>
						<input
							type="range"
							min="1"
							max="100"
							step="0.5"
							value={sampleRate}
							onChange={(e) => setSampleRate(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 pointer-events-none ${isCorrect ? "bg-emerald-500 border-emerald-300" : isAliasing ? "bg-red-500 border-red-300" : "bg-blue-500 border-blue-300"}`}
							style={{ left: `calc(${((sampleRate - 1) / 99) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className={`text-sm font-mono w-16 text-right ${isCorrect ? "text-emerald-400" : isAliasing ? "text-red-400" : "text-blue-400"}`}
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{sampleRate.toFixed(1)} Hz
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
						onClick={() => setShowHint(!showHint)}
						className={`px-3 py-2 rounded-xl transition-all text-sm ${
							showHint
								? "bg-yellow-600/20 text-yellow-400"
								: "bg-zinc-900 hover:bg-zinc-800 text-zinc-400"
						}`}
					>
						Hint
					</button>
				</div>
				<div className="flex gap-2 items-center">
					<button
						type="button"
						onClick={handlePrevChallenge}
						className="p-2.5 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-400 rounded-xl transition-all"
						title="Previous Challenge"
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
							<path d="m15 18-6-6 6-6" />
						</svg>
					</button>
					<button
						type="button"
						onClick={handleNextChallenge}
						className={`px-4 py-2 rounded-xl transition-all text-sm font-medium ${
							isCorrect
								? "bg-emerald-600 hover:bg-emerald-500 text-white"
								: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
						}`}
					>
						{isCorrect ? "Next →" : "Skip →"}
					</button>
				</div>
			</div>
		</div>
	);
}

