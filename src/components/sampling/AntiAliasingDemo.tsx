import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 420;

export default function AntiAliasingDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [sampleRate, setSampleRate] = useState(20);
	const [filterEnabled, setFilterEnabled] = useState(false);
	const [cutoffFreq, setCutoffFreq] = useState(8);
	const animationRef = useRef<number>();

	// Simple low-pass filter simulation (first-order approximation)
	const applyLowPassFilter = useCallback(
		(freq: number, cutoff: number): number => {
			// Simple frequency-domain attenuation
			// At cutoff, attenuation is -3dB (≈0.707)
			// Using a simple roll-off model
			if (freq <= cutoff) {
				return 1.0;
			}
			// -20dB/decade roll-off approximation
			const ratio = freq / cutoff;
			return 1 / Math.sqrt(1 + ratio * ratio);
		},
		[],
	);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			fs: number,
			filterOn: boolean,
			cutoff: number,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;
			const plotHeight = 100;
			const row1Y = padding;
			const row2Y = padding + plotHeight + 50;
			const row3Y = padding + 2 * (plotHeight + 50);

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const nyquist = fs / 2;
			const timeWindow = 1.5;

			// Signal components: a mix of frequencies (some above Nyquist)
			const components = [
				{ freq: 3, amp: 1.0, color: "#22c55e" },
				{ freq: 7, amp: 0.5, color: "#3b82f6" },
				{ freq: 14, amp: 0.4, color: "#f97316" }, // Above Nyquist for fs=20
			];

			// Calculate signal value at time t
			const getSignal = (t: number, useFilter: boolean) => {
				let value = 0;
				for (const comp of components) {
					let amp = comp.amp;
					if (useFilter) {
						amp *= applyLowPassFilter(comp.freq, cutoff);
					}
					value += amp * Math.sin(2 * Math.PI * comp.freq * t);
				}
				return value / 1.5; // Normalize
			};

			// === ROW 1: Original Signal ===
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Original Signal (3 Hz + 7 Hz + 14 Hz)", padding, row1Y - 8);

			// Grid
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			const centerY1 = row1Y + plotHeight / 2;
			ctx.beginPath();
			ctx.moveTo(padding, centerY1);
			ctx.lineTo(width - padding, centerY1);
			ctx.stroke();

			// Draw original signal
			ctx.beginPath();
			ctx.strokeStyle = "#94a3b8";
			ctx.lineWidth = 2;
			for (let i = 0; i <= 400; i++) {
				const t = currentTime + (timeWindow * i) / 400;
				const x = padding + (plotWidth * i) / 400;
				const y = centerY1 - (plotHeight / 2) * 0.85 * getSignal(t, false);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// === ROW 2: After Filter (or same if disabled) ===
			ctx.fillStyle = filterOn ? "#a855f7" : "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			const row2Label = filterOn 
				? `After Low-Pass Filter (cutoff = ${cutoff} Hz)`
				: "No Filter Applied";
			ctx.fillText(row2Label, padding, row2Y - 8);

			const centerY2 = row2Y + plotHeight / 2;
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(padding, centerY2);
			ctx.lineTo(width - padding, centerY2);
			ctx.stroke();

			// Draw filtered signal
			ctx.beginPath();
			ctx.strokeStyle = filterOn ? "#a855f7" : "#94a3b8";
			ctx.lineWidth = 2;
			for (let i = 0; i <= 400; i++) {
				const t = currentTime + (timeWindow * i) / 400;
				const x = padding + (plotWidth * i) / 400;
				const y = centerY2 - (plotHeight / 2) * 0.85 * getSignal(t, filterOn);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw filter frequency response visualization
			if (filterOn) {
				// Small inset showing filter response
				const insetX = width - padding - 100;
				const insetY = row2Y + 5;
				const insetW = 90;
				const insetH = 40;

				ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
				ctx.fillRect(insetX, insetY, insetW, insetH);
				ctx.strokeStyle = "#475569";
				ctx.lineWidth = 1;
				ctx.strokeRect(insetX, insetY, insetW, insetH);

				// Draw filter response curve
				ctx.beginPath();
				ctx.strokeStyle = "#a855f7";
				ctx.lineWidth = 1.5;
				for (let i = 0; i <= 50; i++) {
					const f = (i / 50) * nyquist * 1.5;
					const response = applyLowPassFilter(f, cutoff);
					const x = insetX + (i / 50) * insetW;
					const y = insetY + insetH - response * (insetH - 5);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();

				// Cutoff marker
				const cutoffX = insetX + (cutoff / (nyquist * 1.5)) * insetW;
				ctx.strokeStyle = "#eab308";
				ctx.setLineDash([2, 2]);
				ctx.beginPath();
				ctx.moveTo(cutoffX, insetY);
				ctx.lineTo(cutoffX, insetY + insetH);
				ctx.stroke();
				ctx.setLineDash([]);

				ctx.fillStyle = "#64748b";
				ctx.font = "8px monospace";
				ctx.textAlign = "center";
				ctx.fillText("Filter", insetX + insetW / 2, insetY + insetH + 10);
			}

			// === ROW 3: Sampled Result ===
			const aliasedComponents = components.filter(c => {
				if (filterOn) {
					return applyLowPassFilter(c.freq, cutoff) > 0.1;
				}
				return true;
			});
			const hasAliasing = !filterOn && components.some(c => c.freq > nyquist);

			ctx.fillStyle = hasAliasing ? "#ef4444" : "#22c55e";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			const row3Label = hasAliasing 
				? `Sampled at ${fs} Hz — ALIASING!`
				: `Sampled at ${fs} Hz — Clean`;
			ctx.fillText(row3Label, padding, row3Y - 8);

			const centerY3 = row3Y + plotHeight / 2;
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(padding, centerY3);
			ctx.lineTo(width - padding, centerY3);
			ctx.stroke();

			// Generate samples
			const samplePeriod = 1 / fs;
			const firstSampleIndex = Math.ceil(currentTime / samplePeriod);
			const lastSampleIndex = Math.floor((currentTime + timeWindow) / samplePeriod);
			const samples: { t: number; value: number }[] = [];

			for (let i = firstSampleIndex; i <= lastSampleIndex; i++) {
				const t = i * samplePeriod;
				const value = getSignal(t, filterOn);
				samples.push({ t, value });
			}

			// Draw reconstructed signal (what we perceive)
			ctx.beginPath();
			ctx.strokeStyle = hasAliasing ? "#ef4444" : "#22c55e";
			ctx.lineWidth = 2;
			for (let i = 0; i <= 400; i++) {
				const t = currentTime + (timeWindow * i) / 400;
				const x = padding + (plotWidth * i) / 400;
				
				// Simple linear interpolation between samples
				let value = 0;
				for (let j = 0; j < samples.length - 1; j++) {
					if (t >= samples[j].t && t <= samples[j + 1].t) {
						const alpha = (t - samples[j].t) / (samples[j + 1].t - samples[j].t);
						value = samples[j].value * (1 - alpha) + samples[j + 1].value * alpha;
						break;
					}
				}
				if (t < samples[0]?.t) value = samples[0]?.value || 0;
				if (t > samples[samples.length - 1]?.t) value = samples[samples.length - 1]?.value || 0;
				
				const y = centerY3 - (plotHeight / 2) * 0.85 * value;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw sample points
			ctx.fillStyle = "#3b82f6";
			for (const sample of samples) {
				const x = padding + ((sample.t - currentTime) / timeWindow) * plotWidth;
				const y = centerY3 - (plotHeight / 2) * 0.85 * sample.value;
				ctx.beginPath();
				ctx.arc(x, y, 4, 0, Math.PI * 2);
				ctx.fill();
			}

			// Frequency legend at bottom
			const legendY = height - 15;
			ctx.font = "10px sans-serif";
			ctx.textAlign = "left";

			let legendX = padding;
			for (const comp of components) {
				const isFiltered = filterOn && applyLowPassFilter(comp.freq, cutoff) < 0.3;
				const isAboveNyquist = comp.freq > nyquist;
				
				ctx.fillStyle = isFiltered ? "#475569" : comp.color;
				ctx.fillRect(legendX, legendY - 8, 8, 8);
				
				let label = `${comp.freq}Hz`;
				if (isAboveNyquist && !filterOn) {
					label += " (aliases!)";
					ctx.fillStyle = "#ef4444";
				} else if (isFiltered) {
					label += " (filtered)";
					ctx.fillStyle = "#475569";
				} else {
					ctx.fillStyle = comp.color;
				}
				ctx.fillText(label, legendX + 12, legendY);
				legendX += ctx.measureText(label).width + 30;
			}
		},
		[applyLowPassFilter],
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
			draw(ctx, time, sampleRate, filterEnabled, cutoffFreq);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, sampleRate, filterEnabled, cutoffFreq]);

	const handleReset = () => {
		setTime(0);
		setSampleRate(20);
		setFilterEnabled(false);
		setCutoffFreq(8);
	};

	const nyquist = sampleRate / 2;

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
					<label className="text-sm font-mono text-zinc-400 w-20">Sample rate</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${((sampleRate - 10) / 30) * 100}%` }}
						/>
						<input
							type="range"
							min="10"
							max="40"
							step="2"
							value={sampleRate}
							onChange={(e) => setSampleRate(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${((sampleRate - 10) / 30) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-blue-400 w-14 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{sampleRate} Hz
					</span>
				</div>

				{filterEnabled && (
					<div className="flex items-center gap-4">
						<label className="text-sm font-mono text-zinc-400 w-20">Cutoff</label>
						<div className="flex-1 relative h-2">
							<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
							{/* Nyquist marker */}
							<div
								className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-yellow-500/50"
								style={{ left: `${((nyquist - 2) / 18) * 100}%` }}
							/>
							<div
								className="absolute left-0 top-0 h-full bg-purple-500 rounded-lg"
								style={{ width: `${((cutoffFreq - 2) / 18) * 100}%` }}
							/>
							<input
								type="range"
								min="2"
								max="20"
								step="0.5"
								value={cutoffFreq}
								onChange={(e) => setCutoffFreq(parseFloat(e.target.value))}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							/>
							<div
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-full border-2 border-purple-300 pointer-events-none"
								style={{ left: `calc(${((cutoffFreq - 2) / 18) * 100}% - 8px)` }}
							/>
						</div>
						<span
							className="text-sm font-mono text-purple-400 w-14 text-right"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{cutoffFreq.toFixed(1)} Hz
						</span>
					</div>
				)}
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
						onClick={() => setFilterEnabled(!filterEnabled)}
						className={`px-3 py-2 rounded-xl transition-all text-sm font-mono ${
							filterEnabled 
								? "bg-purple-600/20 hover:bg-purple-600/30 text-purple-400" 
								: "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-400"
						}`}
					>
						{filterEnabled ? "Filter ON" : "Filter OFF"}
					</button>
				</div>
				<div className="flex gap-2 font-mono text-xs flex-wrap">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px]">Nyquist</span>
						<span
							className="text-yellow-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{nyquist} Hz
						</span>
					</div>
					<div className={`px-2 py-1.5 rounded-xl flex flex-col items-center min-w-[70px] ${filterEnabled ? "bg-purple-900/30" : "bg-zinc-900"}`}>
						<span className="text-zinc-500 text-[10px]">Filter</span>
						<span
							className={filterEnabled ? "text-purple-400" : "text-zinc-500"}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{filterEnabled ? `${cutoffFreq} Hz` : "OFF"}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

