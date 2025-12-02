import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;

interface FIRFilterDemoProps {
	initialTaps?: number;
}

export default function FIRFilterDemo({
	initialTaps = 7,
}: FIRFilterDemoProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [numTaps, setNumTaps] = useState(initialTaps);
	const [cutoff, setCutoff] = useState(0.25);
	const [windowType, setWindowType] = useState<"rectangular" | "hamming" | "blackman">("hamming");
	const animationRef = useRef<number>();
	const noiseRef = useRef<number[]>([]);

	// Generate stable noise
	useEffect(() => {
		noiseRef.current = Array.from({ length: 2000 }, () => Math.random() * 2 - 1);
	}, []);

	const getNoise = useCallback((index: number) => {
		return noiseRef.current[Math.abs(Math.floor(index)) % noiseRef.current.length];
	}, []);

	// Window functions
	const getWindow = useCallback((n: number, N: number, type: "rectangular" | "hamming" | "blackman") => {
		switch (type) {
			case "rectangular":
				return 1;
			case "hamming":
				return 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
			case "blackman":
				return 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * n) / (N - 1));
		}
	}, []);

	// Generate FIR coefficients using windowed sinc
	const getFIRCoefficients = useCallback(
		(taps: number, fc: number, winType: "rectangular" | "hamming" | "blackman") => {
			const coeffs: number[] = [];
			const M = taps - 1;
			let sum = 0;

			for (let n = 0; n <= M; n++) {
				const sincArg = n - M / 2;
				let h: number;
				if (sincArg === 0) {
					h = 2 * fc;
				} else {
					h = Math.sin(2 * Math.PI * fc * sincArg) / (Math.PI * sincArg);
				}
				const w = getWindow(n, taps, winType);
				coeffs.push(h * w);
				sum += h * w;
			}

			// Normalize
			return coeffs.map((c) => c / sum);
		},
		[getWindow],
	);

	// Apply FIR filter
	const applyFIR = useCallback(
		(signal: number[], coeffs: number[]) => {
			const result: number[] = [];
			const M = coeffs.length - 1;

			for (let n = 0; n < signal.length; n++) {
				let sum = 0;
				for (let k = 0; k <= M; k++) {
					const idx = n - k;
					if (idx >= 0) {
						sum += coeffs[k] * signal[idx];
					}
				}
				result.push(sum);
			}
			return result;
		},
		[],
	);

	// Compute frequency response
	const getFrequencyResponse = useCallback((coeffs: number[], numPoints: number = 100) => {
		const response: number[] = [];
		for (let i = 0; i < numPoints; i++) {
			const freq = (i / numPoints) * 0.5;
			let real = 0;
			let imag = 0;
			for (let k = 0; k < coeffs.length; k++) {
				real += coeffs[k] * Math.cos(2 * Math.PI * freq * k);
				imag -= coeffs[k] * Math.sin(2 * Math.PI * freq * k);
			}
			response.push(Math.sqrt(real * real + imag * imag));
		}
		return response;
	}, []);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			taps: number,
			fc: number,
			winType: "rectangular" | "hamming" | "blackman",
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const coeffs = getFIRCoefficients(taps, fc, winType);
			const freqResponse = getFrequencyResponse(coeffs);

			// Three sections
			const sectionHeight = (height - 70) / 3;

			// Section 1: Filter coefficients
			const sec1Y = 30;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText(`FIR Coefficients (${taps} taps, ${winType} window)`, padding, sec1Y);

			const coeffCenterY = sec1Y + sectionHeight / 2 + 10;
			const barWidth = Math.min(25, (plotWidth - 40) / taps);
			const totalWidth = barWidth * taps;
			const startX = padding + (plotWidth - totalWidth) / 2;

			// Draw zero line
			ctx.strokeStyle = "#334155";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(startX - 10, coeffCenterY);
			ctx.lineTo(startX + totalWidth + 10, coeffCenterY);
			ctx.stroke();

			// Draw coefficient bars
			const maxCoeff = Math.max(...coeffs.map(Math.abs));
			for (let i = 0; i < coeffs.length; i++) {
				const x = startX + i * barWidth;
				const barHeight = (coeffs[i] / maxCoeff) * (sectionHeight * 0.35);
				const y = coeffs[i] >= 0 ? coeffCenterY - barHeight : coeffCenterY;

				ctx.fillStyle = coeffs[i] >= 0 ? "#3b82f6" : "#ef4444";
				ctx.fillRect(x + 2, y, barWidth - 4, Math.abs(barHeight));
			}

			// Section 2: Frequency response
			const sec2Y = sec1Y + sectionHeight + 10;
			ctx.fillStyle = "#94a3b8";
			ctx.fillText("Frequency Response", padding, sec2Y);

			const freqPlotY = sec2Y + 15;
			const freqPlotHeight = sectionHeight - 25;

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

			// Draw cutoff line
			const cutoffX = padding + (fc / 0.5) * plotWidth;
			ctx.strokeStyle = "rgba(249, 115, 22, 0.5)";
			ctx.setLineDash([5, 5]);
			ctx.beginPath();
			ctx.moveTo(cutoffX, freqPlotY);
			ctx.lineTo(cutoffX, freqPlotY + freqPlotHeight);
			ctx.stroke();
			ctx.setLineDash([]);

			// Draw frequency response
			ctx.beginPath();
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 2;
			for (let i = 0; i < freqResponse.length; i++) {
				const x = padding + (i / freqResponse.length) * plotWidth;
				const y = freqPlotY + freqPlotHeight - freqResponse[i] * freqPlotHeight;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// X-axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			ctx.fillText("0", padding, freqPlotY + freqPlotHeight + 12);
			ctx.fillText("0.5", width - padding, freqPlotY + freqPlotHeight + 12);

			// Section 3: Signal filtering demo
			const sec3Y = sec2Y + sectionHeight + 10;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Signal: Before & After", padding, sec3Y);

			const sigPlotY = sec3Y + 15;
			const sigPlotHeight = sectionHeight - 25;
			const sigCenterY = sigPlotY + sigPlotHeight / 2;

			// Generate test signal
			const signal: number[] = [];
			const numSamples = 200;
			for (let i = 0; i < numSamples; i++) {
				const t = i / 60;
				// Low freq + high freq + noise
				const lowFreq = Math.sin(2 * Math.PI * 2 * t);
				const highFreq = 0.3 * Math.sin(2 * Math.PI * 15 * t);
				const noise = 0.2 * getNoise(Math.floor((currentTime * 60 + i) % 2000));
				signal.push(lowFreq + highFreq + noise);
			}

			const filtered = applyFIR(signal, coeffs);

			// Draw original signal
			ctx.beginPath();
			ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
			ctx.lineWidth = 1.5;
			for (let i = 0; i < signal.length; i++) {
				const x = padding + (i / signal.length) * plotWidth;
				const y = sigCenterY - signal[i] * (sigPlotHeight * 0.35);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw filtered signal
			ctx.beginPath();
			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 2;
			for (let i = 0; i < filtered.length; i++) {
				const x = padding + (i / filtered.length) * plotWidth;
				const y = sigCenterY - filtered[i] * (sigPlotHeight * 0.35);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Legend
			const legendY = height - 8;
			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";

			ctx.fillStyle = "rgba(59, 130, 246, 0.6)";
			ctx.fillRect(padding, legendY - 8, 12, 3);
			ctx.fillStyle = "#3b82f6";
			ctx.fillText("Input", padding + 16, legendY);

			ctx.fillStyle = "#22c55e";
			ctx.fillRect(padding + 70, legendY - 8, 12, 3);
			ctx.fillText("Filtered", padding + 86, legendY);
		},
		[getFIRCoefficients, getFrequencyResponse, applyFIR, getNoise],
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
			draw(ctx, time, numTaps, cutoff, windowType);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, numTaps, cutoff, windowType]);

	const handleReset = () => {
		setTime(0);
		setNumTaps(initialTaps);
		setCutoff(0.25);
		setWindowType("hamming");
	};

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
					<label className="text-sm font-mono text-zinc-400 w-24">Taps</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${((numTaps - 3) / 28) * 100}%` }}
						/>
						<input
							type="range"
							min="3"
							max="31"
							step="2"
							value={numTaps}
							onChange={(e) => setNumTaps(parseInt(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${((numTaps - 3) / 28) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-blue-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{numTaps}
					</span>
				</div>

				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-24">Cutoff</label>
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
					<span
						className="text-sm font-mono text-orange-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{cutoff.toFixed(2)}
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
				<div className="flex gap-2">
					{(["rectangular", "hamming", "blackman"] as const).map((type) => (
						<button
							key={type}
							type="button"
							onClick={() => setWindowType(type)}
							className={`px-3 py-1.5 rounded-xl text-sm font-mono transition-all ${
								windowType === type
									? "bg-blue-600/30 text-blue-400"
									: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
							}`}
						>
							{type.charAt(0).toUpperCase() + type.slice(1)}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

