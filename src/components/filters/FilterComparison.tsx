import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 450;

export default function FilterComparison() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [cutoff, setCutoff] = useState(0.15);
	const [showImpulse, setShowImpulse] = useState(false);
	const animationRef = useRef<number>();
	const noiseRef = useRef<number[]>([]);

	// Generate stable noise
	useEffect(() => {
		noiseRef.current = Array.from({ length: 2000 }, () => Math.random() * 2 - 1);
	}, []);

	const getNoise = useCallback((index: number) => {
		return noiseRef.current[Math.abs(Math.floor(index)) % noiseRef.current.length];
	}, []);

	// FIR filter (7-tap Hamming windowed sinc)
	const getFIRCoeffs = useCallback((fc: number) => {
		const taps = 15;
		const coeffs: number[] = [];
		const M = taps - 1;
		let sum = 0;
		for (let n = 0; n <= M; n++) {
			const sincArg = n - M / 2;
			let h = sincArg === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * sincArg) / (Math.PI * sincArg);
			const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / M);
			coeffs.push(h * w);
			sum += h * w;
		}
		return coeffs.map((c) => c / sum);
	}, []);

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

	// IIR filter (first-order, matched cutoff)
	const applyIIR = useCallback((signal: number[], fc: number) => {
		const alpha = 2 * Math.PI * fc / (2 * Math.PI * fc + 1); // Bilinear approximation
		const result: number[] = [];
		let y = 0;
		for (let i = 0; i < signal.length; i++) {
			y = alpha * signal[i] + (1 - alpha) * y;
			result.push(y);
		}
		return result;
	}, []);

	// Frequency responses
	const getFIRResponse = useCallback((coeffs: number[], numPoints: number = 100) => {
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

	const getIIRResponse = useCallback((fc: number, numPoints: number = 100) => {
		const alpha = 2 * Math.PI * fc / (2 * Math.PI * fc + 1);
		const response: number[] = [];
		for (let i = 0; i < numPoints; i++) {
			const freq = (i / numPoints) * 0.5;
			const omega = 2 * Math.PI * freq;
			const realDen = 1 - (1 - alpha) * Math.cos(omega);
			const imagDen = (1 - alpha) * Math.sin(omega);
			const mag = alpha / Math.sqrt(realDen * realDen + imagDen * imagDen);
			response.push(mag);
		}
		return response;
	}, []);

	const draw = useCallback(
		(ctx: CanvasRenderingContext2D, currentTime: number, fc: number, impulse: boolean) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const firCoeffs = getFIRCoeffs(fc);
			const firResponse = getFIRResponse(firCoeffs);
			const iirResponse = getIIRResponse(fc);

			const sectionHeight = (height - 80) / 3;

			// Section 1: Frequency Response Comparison
			const sec1Y = 30;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Frequency Response: FIR vs IIR", padding, sec1Y);

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

			// Cutoff line
			const cutoffX = padding + (fc / 0.5) * plotWidth;
			ctx.strokeStyle = "rgba(251, 146, 60, 0.4)";
			ctx.setLineDash([5, 5]);
			ctx.beginPath();
			ctx.moveTo(cutoffX, freqPlotY);
			ctx.lineTo(cutoffX, freqPlotY + freqPlotHeight);
			ctx.stroke();
			ctx.setLineDash([]);

			// FIR response
			ctx.beginPath();
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			for (let i = 0; i < firResponse.length; i++) {
				const x = padding + (i / firResponse.length) * plotWidth;
				const y = freqPlotY + freqPlotHeight - firResponse[i] * freqPlotHeight;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// IIR response
			ctx.beginPath();
			ctx.strokeStyle = "#a855f7";
			ctx.lineWidth = 2;
			for (let i = 0; i < iirResponse.length; i++) {
				const x = padding + (i / iirResponse.length) * plotWidth;
				const y = freqPlotY + freqPlotHeight - Math.min(iirResponse[i], 1.2) * freqPlotHeight * 0.8;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			ctx.fillText("0", padding, freqPlotY + freqPlotHeight + 12);
			ctx.fillText("fc", cutoffX, freqPlotY + freqPlotHeight + 12);
			ctx.fillText("0.5", width - padding, freqPlotY + freqPlotHeight + 12);

			// Section 2: Impulse or Step Response
			const sec2Y = sec1Y + sectionHeight + 15;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText(impulse ? "Impulse Response" : "Step Response", padding, sec2Y);

			const respPlotY = sec2Y + 15;
			const respPlotHeight = sectionHeight - 20;
			const respCenterY = respPlotY + respPlotHeight / 2;

			// Generate impulse or step input
			const testSignal: number[] = [];
			const numSamples = 100;
			for (let i = 0; i < numSamples; i++) {
				if (impulse) {
					testSignal.push(i === 10 ? 1 : 0);
				} else {
					testSignal.push(i >= 10 ? 1 : 0);
				}
			}

			const firOutput = applyFIR(testSignal, firCoeffs);
			const iirOutput = applyIIR(testSignal, fc);

			// Scale factor
			const maxVal = Math.max(
				...firOutput.map(Math.abs),
				...iirOutput.map(Math.abs),
				impulse ? 0.5 : 1
			);
			const scale = (respPlotHeight * 0.4) / maxVal;

			// Draw zero line
			ctx.strokeStyle = "#334155";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(padding, respCenterY);
			ctx.lineTo(width - padding, respCenterY);
			ctx.stroke();

			// Draw input (faded)
			ctx.beginPath();
			ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
			ctx.lineWidth = 1;
			for (let i = 0; i < testSignal.length; i++) {
				const x = padding + (i / testSignal.length) * plotWidth;
				const y = respCenterY - testSignal[i] * scale;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// FIR output
			ctx.beginPath();
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			for (let i = 0; i < firOutput.length; i++) {
				const x = padding + (i / firOutput.length) * plotWidth;
				const y = respCenterY - firOutput[i] * scale;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// IIR output
			ctx.beginPath();
			ctx.strokeStyle = "#a855f7";
			ctx.lineWidth = 2;
			for (let i = 0; i < iirOutput.length; i++) {
				const x = padding + (i / iirOutput.length) * plotWidth;
				const y = respCenterY - iirOutput[i] * scale;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Section 3: Real-time filtering
			const sec3Y = sec2Y + sectionHeight + 15;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Live Signal Processing", padding, sec3Y);

			const sigPlotY = sec3Y + 15;
			const sigPlotHeight = sectionHeight - 25;
			const sigCenterY = sigPlotY + sigPlotHeight / 2;

			// Generate live signal
			const signal: number[] = [];
			const livesamples = 200;
			for (let i = 0; i < livesamples; i++) {
				const t = i / 60;
				const lowFreq = Math.sin(2 * Math.PI * 1.5 * (currentTime + t));
				const highFreq = 0.4 * Math.sin(2 * Math.PI * 15 * (currentTime + t));
				const noise = 0.2 * getNoise(Math.floor((currentTime * 60 + i) % 2000));
				signal.push(lowFreq + highFreq + noise);
			}

			const firFiltered = applyFIR(signal, firCoeffs);
			const iirFiltered = applyIIR(signal, fc);

			// Draw original
			ctx.beginPath();
			ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
			ctx.lineWidth = 1;
			for (let i = 0; i < signal.length; i++) {
				const x = padding + (i / signal.length) * plotWidth;
				const y = sigCenterY - signal[i] * (sigPlotHeight * 0.3);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw FIR filtered
			ctx.beginPath();
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			for (let i = 0; i < firFiltered.length; i++) {
				const x = padding + (i / firFiltered.length) * plotWidth;
				const y = sigCenterY - firFiltered[i] * (sigPlotHeight * 0.3);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw IIR filtered
			ctx.beginPath();
			ctx.strokeStyle = "#a855f7";
			ctx.lineWidth = 2;
			for (let i = 0; i < iirFiltered.length; i++) {
				const x = padding + (i / iirFiltered.length) * plotWidth;
				const y = sigCenterY - iirFiltered[i] * (sigPlotHeight * 0.3);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Legend
			const legendY = height - 8;
			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";

			ctx.fillStyle = "#3b82f6";
			ctx.fillRect(padding, legendY - 8, 12, 3);
			ctx.fillText("FIR (15 taps)", padding + 16, legendY);

			ctx.fillStyle = "#a855f7";
			ctx.fillRect(padding + 120, legendY - 8, 12, 3);
			ctx.fillText("IIR (1st order)", padding + 136, legendY);

			ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
			ctx.fillRect(padding + 250, legendY - 8, 12, 3);
			ctx.fillText("Input", padding + 266, legendY);
		},
		[getFIRCoeffs, getFIRResponse, getIIRResponse, applyFIR, applyIIR, getNoise],
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
			draw(ctx, time, cutoff, showImpulse);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, cutoff, showImpulse]);

	const handleReset = () => {
		setTime(0);
		setCutoff(0.15);
		setShowImpulse(false);
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
							max="0.4"
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
					<button
						type="button"
						onClick={() => setShowImpulse(false)}
						className={`px-3 py-1.5 rounded-xl text-sm font-mono transition-all ${
							!showImpulse
								? "bg-emerald-600/30 text-emerald-400"
								: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
						}`}
					>
						Step
					</button>
					<button
						type="button"
						onClick={() => setShowImpulse(true)}
						className={`px-3 py-1.5 rounded-xl text-sm font-mono transition-all ${
							showImpulse
								? "bg-emerald-600/30 text-emerald-400"
								: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
						}`}
					>
						Impulse
					</button>
				</div>
			</div>
		</div>
	);
}

