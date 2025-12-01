import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;

// Simple DFT implementation for educational purposes
function computeDFT(samples: number[], maxFreqBins: number): number[] {
	const N = samples.length;
	const magnitudes: number[] = [];
	
	for (let k = 0; k < maxFreqBins; k++) {
		let real = 0;
		let imag = 0;
		
		for (let n = 0; n < N; n++) {
			const angle = (2 * Math.PI * k * n) / N;
			real += samples[n] * Math.cos(angle);
			imag -= samples[n] * Math.sin(angle);
		}
		
		// Magnitude (normalized)
		const magnitude = Math.sqrt(real * real + imag * imag) / N;
		magnitudes.push(magnitude);
	}
	
	return magnitudes;
}

export default function FrequencySpectrumDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [frequency1, setFrequency1] = useState(3);
	const [frequency2, setFrequency2] = useState(0);
	const [sampleRate, setSampleRate] = useState(32);
	const animationRef = useRef<number>();

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			f1: number,
			f2: number,
			fs: number,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;
			const timeHeight = 130;
			const spectrumHeight = 130;
			const topY = padding;
			const bottomY = padding + timeHeight + 70;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const nyquist = fs / 2;
			const timeWindow = 1.5;
			const numSamples = Math.floor(fs * timeWindow);

			// Generate samples
			const samples: number[] = [];
			const samplePeriod = 1 / fs;
			for (let i = 0; i < numSamples; i++) {
				const t = currentTime + i * samplePeriod;
				let value = Math.sin(2 * Math.PI * f1 * t);
				if (f2 > 0) {
					value += 0.5 * Math.sin(2 * Math.PI * f2 * t);
					value /= 1.5; // Normalize
				}
				samples.push(value);
			}

			// === TOP: Time domain ===
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Time Domain (Signal)", padding, topY - 8);

			// Grid
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 2; i++) {
				const y = topY + (timeHeight * i) / 2;
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - padding, y);
				ctx.stroke();
			}

			// Center line
			const timeCenterY = topY + timeHeight / 2;
			ctx.strokeStyle = "#334155";
			ctx.beginPath();
			ctx.moveTo(padding, timeCenterY);
			ctx.lineTo(width - padding, timeCenterY);
			ctx.stroke();

			// Y-axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "right";
			ctx.fillText("+1", padding - 6, topY + 4);
			ctx.fillText("0", padding - 6, timeCenterY + 4);
			ctx.fillText("-1", padding - 6, topY + timeHeight + 4);

			// Draw continuous signal
			ctx.beginPath();
			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 2;
			for (let i = 0; i <= 400; i++) {
				const t = currentTime + (timeWindow * i) / 400;
				const x = padding + (plotWidth * i) / 400;
				let value = Math.sin(2 * Math.PI * f1 * t);
				if (f2 > 0) {
					value += 0.5 * Math.sin(2 * Math.PI * f2 * t);
					value /= 1.5;
				}
				const y = timeCenterY - (timeHeight / 2) * 0.85 * value;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw sample points
			ctx.fillStyle = "#3b82f6";
			for (let i = 0; i < numSamples && i < 60; i++) {
				const x = padding + (plotWidth * i) / numSamples;
				const y = timeCenterY - (timeHeight / 2) * 0.85 * samples[i];
				ctx.beginPath();
				ctx.arc(x, y, 3, 0, Math.PI * 2);
				ctx.fill();
			}

			// === BOTTOM: Frequency domain ===
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Frequency Domain (DFT)", padding, bottomY - 8);

			// Compute DFT
			const maxBins = Math.min(numSamples / 2, 64);
			const magnitudes = computeDFT(samples, maxBins);

			// Find max magnitude for scaling
			const maxMag = Math.max(...magnitudes, 0.1);

			// Draw frequency axis
			ctx.strokeStyle = "#475569";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(padding, bottomY + spectrumHeight);
			ctx.lineTo(width - padding, bottomY + spectrumHeight);
			ctx.stroke();

			// Frequency labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			const freqStep = nyquist / 4;
			for (let f = 0; f <= nyquist; f += freqStep) {
				const x = padding + (f / nyquist) * plotWidth;
				ctx.beginPath();
				ctx.moveTo(x, bottomY + spectrumHeight);
				ctx.lineTo(x, bottomY + spectrumHeight + 5);
				ctx.stroke();
				ctx.fillText(`${f.toFixed(0)}`, x, bottomY + spectrumHeight + 18);
			}
			ctx.textAlign = "right";
			ctx.fillText("Hz", width - padding + 15, bottomY + spectrumHeight + 18);

			// Draw Nyquist marker
			ctx.strokeStyle = "#eab308";
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(width - padding, bottomY);
			ctx.lineTo(width - padding, bottomY + spectrumHeight);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = "#eab308";
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			ctx.fillText("Nyquist", width - padding, bottomY - 2);

			// Draw spectrum bars
			const barWidth = plotWidth / maxBins * 0.7;
			for (let k = 0; k < maxBins; k++) {
				const freqOfBin = (k / numSamples) * fs;
				const x = padding + (freqOfBin / nyquist) * plotWidth;
				const barHeight = (magnitudes[k] / maxMag) * spectrumHeight * 0.9;
				
				// Color based on which frequency component
				let color = "#6366f1"; // Default purple
				if (f1 > 0 && Math.abs(freqOfBin - f1) < fs / numSamples) {
					color = "#22c55e"; // Green for f1
				} else if (f2 > 0 && Math.abs(freqOfBin - f2) < fs / numSamples) {
					color = "#f97316"; // Orange for f2
				}
				
				// Check for aliased components
				const isAliased = (f1 > nyquist && Math.abs(freqOfBin - (fs - f1)) < fs / numSamples) ||
								  (f2 > nyquist && Math.abs(freqOfBin - (fs - f2)) < fs / numSamples);
				if (isAliased) {
					color = "#ef4444"; // Red for aliased
				}
				
				if (barHeight > 2) {
					ctx.fillStyle = color;
					ctx.fillRect(
						x - barWidth / 2,
						bottomY + spectrumHeight - barHeight,
						barWidth,
						barHeight
					);
				}
			}

			// Mark expected frequencies
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			
			if (f1 > 0 && f1 <= nyquist) {
				const x1 = padding + (f1 / nyquist) * plotWidth;
				ctx.fillStyle = "#22c55e";
				ctx.beginPath();
				ctx.moveTo(x1, bottomY + spectrumHeight + 25);
				ctx.lineTo(x1 - 4, bottomY + spectrumHeight + 33);
				ctx.lineTo(x1 + 4, bottomY + spectrumHeight + 33);
				ctx.closePath();
				ctx.fill();
				ctx.fillText(`f₁=${f1}Hz`, x1, bottomY + spectrumHeight + 45);
			}
			
			if (f2 > 0 && f2 <= nyquist) {
				const x2 = padding + (f2 / nyquist) * plotWidth;
				ctx.fillStyle = "#f97316";
				ctx.beginPath();
				ctx.moveTo(x2, bottomY + spectrumHeight + 25);
				ctx.lineTo(x2 - 4, bottomY + spectrumHeight + 33);
				ctx.lineTo(x2 + 4, bottomY + spectrumHeight + 33);
				ctx.closePath();
				ctx.fill();
				ctx.fillText(`f₂=${f2}Hz`, x2, bottomY + spectrumHeight + 45);
			}

			// Aliasing warning
			if (f1 > nyquist || (f2 > 0 && f2 > nyquist)) {
				ctx.fillStyle = "#ef4444";
				ctx.font = "11px monospace";
				ctx.textAlign = "right";
				ctx.fillText("⚠ Frequencies above Nyquist!", width - padding, bottomY - 2);
			}

			// Legend
			const legendY = height - 10;
			ctx.font = "10px sans-serif";
			ctx.textAlign = "left";
			
			ctx.fillStyle = "#22c55e";
			ctx.fillRect(padding, legendY - 8, 8, 8);
			ctx.fillText("f₁", padding + 12, legendY);
			
			if (f2 > 0) {
				ctx.fillStyle = "#f97316";
				ctx.fillRect(padding + 45, legendY - 8, 8, 8);
				ctx.fillText("f₂", padding + 57, legendY);
			}
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
			}
			draw(ctx, time, frequency1, frequency2, sampleRate);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, frequency1, frequency2, sampleRate]);

	const handleReset = () => {
		setTime(0);
		setFrequency1(3);
		setFrequency2(0);
		setSampleRate(32);
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
					<label className="text-sm font-mono text-zinc-400 w-12">f₁</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className={`absolute left-0 top-0 h-full rounded-lg ${frequency1 > nyquist ? "bg-red-500" : "bg-emerald-500"}`}
							style={{ width: `${(frequency1 / 20) * 100}%` }}
						/>
						<input
							type="range"
							min="1"
							max="20"
							step="0.5"
							value={frequency1}
							onChange={(e) => setFrequency1(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 pointer-events-none ${frequency1 > nyquist ? "bg-red-500 border-red-300" : "bg-emerald-500 border-emerald-300"}`}
							style={{ left: `calc(${(frequency1 / 20) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className={`text-sm font-mono w-14 text-right ${frequency1 > nyquist ? "text-red-400" : "text-emerald-400"}`}
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{frequency1.toFixed(1)} Hz
					</span>
				</div>

				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-12">f₂</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className={`absolute left-0 top-0 h-full rounded-lg ${frequency2 > nyquist && frequency2 > 0 ? "bg-red-500" : "bg-orange-500"}`}
							style={{ width: `${(frequency2 / 20) * 100}%` }}
						/>
						<input
							type="range"
							min="0"
							max="20"
							step="0.5"
							value={frequency2}
							onChange={(e) => setFrequency2(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 pointer-events-none ${frequency2 > nyquist && frequency2 > 0 ? "bg-red-500 border-red-300" : "bg-orange-500 border-orange-300"}`}
							style={{ left: `calc(${(frequency2 / 20) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className={`text-sm font-mono w-14 text-right ${frequency2 > nyquist && frequency2 > 0 ? "text-red-400" : "text-orange-400"}`}
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{frequency2 === 0 ? "OFF" : `${frequency2.toFixed(1)} Hz`}
					</span>
				</div>

				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-12">fs</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${((sampleRate - 8) / 56) * 100}%` }}
						/>
						<input
							type="range"
							min="8"
							max="64"
							step="2"
							value={sampleRate}
							onChange={(e) => setSampleRate(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${((sampleRate - 8) / 56) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-blue-400 w-14 text-right"
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
							{nyquist} Hz
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

