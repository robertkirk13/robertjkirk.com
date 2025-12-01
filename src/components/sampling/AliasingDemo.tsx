import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 380;

export default function AliasingDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [sampleRate, setSampleRate] = useState(10);
	const [trueFrequency, setTrueFrequency] = useState(2);
	const animationRef = useRef<number>();

	// Calculate aliased frequency
	const getAliasedFrequency = useCallback((freq: number, fs: number) => {
		// Aliasing formula: folding around fs/2
		const nyquist = fs / 2;
		if (freq <= nyquist) return freq;

		// Fold the frequency
		let aliased = freq;
		while (aliased > nyquist) {
			aliased = fs - aliased;
			if (aliased < 0) aliased = -aliased;
		}
		return Math.abs(aliased);
	}, []);

	const draw = useCallback(
		(ctx: CanvasRenderingContext2D, currentTime: number, fs: number, freq: number) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;
			const plotHeight = (height - 3 * padding) / 2;
			const topCenterY = padding + plotHeight / 2;
			const bottomCenterY = 2 * padding + plotHeight + plotHeight / 2;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const nyquist = fs / 2;
			const aliasedFreq = getAliasedFrequency(freq, fs);
			const isAliasing = freq > nyquist;

			// === TOP PLOT: True signal and samples ===
			// Grid
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 2; i++) {
				const y = padding + (plotHeight * i) / 2;
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - padding, y);
				ctx.stroke();
			}

			// Center line
			ctx.strokeStyle = "#334155";
			ctx.beginPath();
			ctx.moveTo(padding, topCenterY);
			ctx.lineTo(width - padding, topCenterY);
			ctx.stroke();

			// Title
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText(`True signal: ${freq.toFixed(1)} Hz`, padding, padding - 28);

			const timeWindow = 2;
			const startTime = currentTime;

			// Draw true signal (continuous)
			ctx.beginPath();
			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 2;
			for (let i = 0; i <= 400; i++) {
				const t = startTime + (timeWindow * i) / 400;
				const x = padding + (plotWidth * i) / 400;
				const y = topCenterY - (plotHeight / 2) * 0.8 * Math.sin(2 * Math.PI * freq * t);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw sample points on true signal
			const samplePeriod = 1 / fs;
			const firstSampleIndex = Math.ceil(startTime / samplePeriod);
			const lastSampleIndex = Math.floor((startTime + timeWindow) / samplePeriod);

			ctx.fillStyle = "#3b82f6";
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			for (let i = firstSampleIndex; i <= lastSampleIndex; i++) {
				const t = i * samplePeriod;
				const x = padding + ((t - startTime) / timeWindow) * plotWidth;
				const y = topCenterY - (plotHeight / 2) * 0.8 * Math.sin(2 * Math.PI * freq * t);

				// Stem
				ctx.beginPath();
				ctx.moveTo(x, topCenterY);
				ctx.lineTo(x, y);
				ctx.stroke();

				// Point
				ctx.beginPath();
				ctx.arc(x, y, 4, 0, Math.PI * 2);
				ctx.fill();
			}

			// === BOTTOM PLOT: What the sampled signal looks like (aliased) ===
			// Grid
			for (let i = 0; i <= 2; i++) {
				const y = 2 * padding + plotHeight + (plotHeight * i) / 2;
				ctx.strokeStyle = "#1e293b";
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - padding, y);
				ctx.stroke();
			}

			// Center line
			ctx.strokeStyle = "#334155";
			ctx.beginPath();
			ctx.moveTo(padding, bottomCenterY);
			ctx.lineTo(width - padding, bottomCenterY);
			ctx.stroke();

			// Title
			ctx.fillStyle = isAliasing ? "#ef4444" : "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			const aliasText = isAliasing 
				? `Perceived signal: ${aliasedFreq.toFixed(1)} Hz (aliased!)` 
				: `Perceived signal: ${aliasedFreq.toFixed(1)} Hz`;
			ctx.fillText(aliasText, padding, 2 * padding + plotHeight - 28);

			// Draw what appears to be the signal (aliased frequency)
			ctx.beginPath();
			ctx.strokeStyle = isAliasing ? "#f97316" : "#22c55e";
			ctx.lineWidth = 2;
			for (let i = 0; i <= 400; i++) {
				const t = startTime + (timeWindow * i) / 400;
				const x = padding + (plotWidth * i) / 400;
				// Note: We need to match phase with the samples
				const phase = 2 * Math.PI * freq * startTime; // Original phase at startTime
				const aliasPhase = 2 * Math.PI * aliasedFreq * startTime;
				const y = bottomCenterY - (plotHeight / 2) * 0.8 * Math.sin(2 * Math.PI * aliasedFreq * t + (phase - aliasPhase));
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw the same sample points on bottom (they match!)
			ctx.fillStyle = "#3b82f6";
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			for (let i = firstSampleIndex; i <= lastSampleIndex; i++) {
				const t = i * samplePeriod;
				const x = padding + ((t - startTime) / timeWindow) * plotWidth;
				// Sample value is the same as the true signal
				const y = bottomCenterY - (plotHeight / 2) * 0.8 * Math.sin(2 * Math.PI * freq * t);

				// Stem
				ctx.beginPath();
				ctx.moveTo(x, bottomCenterY);
				ctx.lineTo(x, y);
				ctx.stroke();

				// Point
				ctx.beginPath();
				ctx.arc(x, y, 4, 0, Math.PI * 2);
				ctx.fill();
			}

			// Y-axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "right";
			ctx.fillText("+1", padding - 6, padding + 4);
			ctx.fillText("-1", padding - 6, padding + plotHeight + 4);
			ctx.fillText("+1", padding - 6, 2 * padding + plotHeight + 4);
			ctx.fillText("-1", padding - 6, 2 * padding + 2 * plotHeight + 4);

			// Info box
			if (isAliasing) {
				ctx.fillStyle = "rgba(239, 68, 68, 0.1)";
				ctx.fillRect(width - padding - 180, padding - 35, 180, 48);
				ctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
				ctx.lineWidth = 1;
				ctx.strokeRect(width - padding - 180, padding - 35, 180, 48);
				
				ctx.fillStyle = "#ef4444";
				ctx.font = "11px sans-serif";
				ctx.textAlign = "left";
				ctx.fillText("The samples are identical!", width - padding - 172, padding - 18);
				ctx.fillText(`${freq.toFixed(1)} Hz → ${aliasedFreq.toFixed(1)} Hz`, width - padding - 172, padding - 3);
			}
		},
		[getAliasedFrequency],
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
			draw(ctx, time, sampleRate, trueFrequency);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, sampleRate, trueFrequency]);

	const handleReset = () => {
		setTime(0);
		setSampleRate(10);
		setTrueFrequency(2);
	};

	const nyquist = sampleRate / 2;
	const aliasedFreq = getAliasedFrequency(trueFrequency, sampleRate);
	const isAliasing = trueFrequency > nyquist;

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
					<label className="text-sm font-mono text-zinc-400 w-24">True freq</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						{/* Nyquist marker */}
						<div
							className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-yellow-500/50"
							style={{ left: `${((nyquist - 0.5) / 14.5) * 100}%` }}
						/>
						<div
							className={`absolute left-0 top-0 h-full rounded-lg ${isAliasing ? "bg-red-500" : "bg-emerald-500"}`}
							style={{ width: `${((trueFrequency - 0.5) / 14.5) * 100}%` }}
						/>
						<input
							type="range"
							min="0.5"
							max="15"
							step="0.1"
							value={trueFrequency}
							onChange={(e) => setTrueFrequency(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 pointer-events-none ${isAliasing ? "bg-red-500 border-red-300" : "bg-emerald-500 border-emerald-300"}`}
							style={{ left: `calc(${((trueFrequency - 0.5) / 14.5) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className={`text-sm font-mono w-16 text-right ${isAliasing ? "text-red-400" : "text-emerald-400"}`}
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{trueFrequency.toFixed(1)} Hz
					</span>
				</div>

				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-24">Sample rate</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${((sampleRate - 4) / 26) * 100}%` }}
						/>
						<input
							type="range"
							min="4"
							max="30"
							step="1"
							value={sampleRate}
							onChange={(e) => setSampleRate(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${((sampleRate - 4) / 26) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-blue-400 w-16 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{sampleRate} Hz
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
				</div>
				<div className="flex gap-2 font-mono text-xs flex-wrap">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px]">Nyquist</span>
						<span
							className="text-yellow-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{nyquist.toFixed(1)} Hz
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px]">Perceived</span>
						<span
							className={isAliasing ? "text-orange-400" : "text-emerald-400"}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{aliasedFreq.toFixed(1)} Hz
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

