import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;

export default function IIRFilterDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [alpha, setAlpha] = useState(0.2); // Smoothing factor
	const [order, setOrder] = useState(1); // Filter order (1 or 2)
	const [showFeedback, setShowFeedback] = useState(true);
	const animationRef = useRef<number>();
	const noiseRef = useRef<number[]>([]);
	const iirStateRef = useRef<number[]>([0, 0, 0]);

	// Generate stable noise
	useEffect(() => {
		noiseRef.current = Array.from({ length: 2000 }, () => Math.random() * 2 - 1);
	}, []);

	const getNoise = useCallback((index: number) => {
		return noiseRef.current[Math.abs(Math.floor(index)) % noiseRef.current.length];
	}, []);

	// First-order IIR (exponential moving average)
	const applyIIR1 = useCallback((input: number[], a: number) => {
		const output: number[] = [];
		let y = 0;
		for (let i = 0; i < input.length; i++) {
			y = a * input[i] + (1 - a) * y;
			output.push(y);
		}
		return output;
	}, []);

	// Second-order IIR (Butterworth-like)
	const applyIIR2 = useCallback((input: number[], a: number) => {
		const output: number[] = [];
		let y1 = 0, y2 = 0;
		// Coefficients for second-order
		const b0 = a * a;
		const a1 = 2 * (1 - a);
		const a2 = (1 - a) * (1 - a);
		
		for (let i = 0; i < input.length; i++) {
			const y = b0 * input[i] + a1 * y1 - a2 * y2;
			y2 = y1;
			y1 = y;
			output.push(y);
		}
		return output;
	}, []);

	// Compute frequency response for first-order IIR
	const getFrequencyResponse = useCallback((a: number, ord: number, numPoints: number = 100) => {
		const response: number[] = [];
		for (let i = 0; i < numPoints; i++) {
			const freq = (i / numPoints) * 0.5;
			const omega = 2 * Math.PI * freq;
			
			if (ord === 1) {
				// H(z) = a / (1 - (1-a)z^-1)
				const realNum = a;
				const imagNum = 0;
				const realDen = 1 - (1 - a) * Math.cos(omega);
				const imagDen = (1 - a) * Math.sin(omega);
				const magNum = Math.sqrt(realNum * realNum + imagNum * imagNum);
				const magDen = Math.sqrt(realDen * realDen + imagDen * imagDen);
				response.push(magNum / magDen);
			} else {
				// Second order response
				const b0 = a * a;
				const a1 = 2 * (1 - a);
				const a2 = (1 - a) * (1 - a);
				
				const realNum = b0;
				const imagNum = 0;
				const realDen = 1 - a1 * Math.cos(omega) + a2 * Math.cos(2 * omega);
				const imagDen = a1 * Math.sin(omega) - a2 * Math.sin(2 * omega);
				const magNum = Math.sqrt(realNum * realNum + imagNum * imagNum);
				const magDen = Math.sqrt(realDen * realDen + imagDen * imagDen);
				response.push(Math.min(magNum / magDen, 1.5));
			}
		}
		return response;
	}, []);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			currentTime: number,
			a: number,
			ord: number,
			showFB: boolean,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const freqResponse = getFrequencyResponse(a, ord);

			// Three sections
			const sectionHeight = (height - 70) / 3;

			// Section 1: Block diagram
			const sec1Y = 30;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText(`IIR Filter (Order ${ord}) - Recursive Structure`, padding, sec1Y);

			const diagramY = sec1Y + sectionHeight / 2;
			const boxWidth = 50;
			const boxHeight = 30;

			// Draw simplified block diagram
			const startX = padding + 30;
			const sumX = startX + 70;
			const gainX = sumX + 80;
			const delayX = gainX + 80;
			const outputX = delayX + 80;

			// Input arrow
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(startX, diagramY);
			ctx.lineTo(sumX - 15, diagramY);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(sumX - 20, diagramY - 5);
			ctx.lineTo(sumX - 15, diagramY);
			ctx.lineTo(sumX - 20, diagramY + 5);
			ctx.fill();

			ctx.fillStyle = "#3b82f6";
			ctx.font = "12px monospace";
			ctx.textAlign = "center";
			ctx.fillText("x[n]", startX - 10, diagramY - 10);

			// Sum block
			ctx.beginPath();
			ctx.arc(sumX, diagramY, 15, 0, Math.PI * 2);
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.fillStyle = "#f97316";
			ctx.font = "16px sans-serif";
			ctx.fillText("Σ", sumX, diagramY + 5);

			// Arrow from sum to gain
			ctx.strokeStyle = "#94a3b8";
			ctx.beginPath();
			ctx.moveTo(sumX + 15, diagramY);
			ctx.lineTo(gainX - boxWidth / 2, diagramY);
			ctx.stroke();

			// Gain block
			ctx.fillStyle = "#1e293b";
			ctx.fillRect(gainX - boxWidth / 2, diagramY - boxHeight / 2, boxWidth, boxHeight);
			ctx.strokeStyle = "#60a5fa";
			ctx.strokeRect(gainX - boxWidth / 2, diagramY - boxHeight / 2, boxWidth, boxHeight);
			ctx.fillStyle = "#60a5fa";
			ctx.font = "14px monospace";
			ctx.textAlign = "center";
			ctx.fillText(`α=${a.toFixed(2)}`, gainX, diagramY + 5);

			// Arrow from gain to output
			ctx.strokeStyle = "#94a3b8";
			ctx.beginPath();
			ctx.moveTo(gainX + boxWidth / 2, diagramY);
			ctx.lineTo(outputX, diagramY);
			ctx.stroke();

			ctx.fillStyle = "#22c55e";
			ctx.font = "12px monospace";
			ctx.fillText("y[n]", outputX + 20, diagramY - 10);

			// Feedback path (if enabled)
			if (showFB) {
				const feedbackY = diagramY + 50;
				
				// Down from output
				ctx.strokeStyle = "#a855f7";
				ctx.setLineDash([4, 4]);
				ctx.beginPath();
				ctx.moveTo(delayX, diagramY);
				ctx.lineTo(delayX, feedbackY);
				ctx.lineTo(sumX, feedbackY);
				ctx.lineTo(sumX, diagramY + 15);
				ctx.stroke();
				ctx.setLineDash([]);

				// Delay block
				ctx.fillStyle = "#1e293b";
				ctx.fillRect(delayX - 25, feedbackY - 12, 50, 24);
				ctx.strokeStyle = "#a855f7";
				ctx.strokeRect(delayX - 25, feedbackY - 12, 50, 24);
				ctx.fillStyle = "#a855f7";
				ctx.font = "12px monospace";
				ctx.fillText("z⁻¹", delayX, feedbackY + 4);

				// Feedback gain label
				ctx.fillStyle = "#a855f7";
				ctx.font = "11px monospace";
				ctx.fillText(`× (1-α)`, sumX - 40, feedbackY + 4);
			}

			// Section 2: Frequency response
			const sec2Y = sec1Y + sectionHeight + 10;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
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

			// Draw frequency response
			ctx.beginPath();
			ctx.strokeStyle = "#a855f7";
			ctx.lineWidth = 2;
			for (let i = 0; i < freqResponse.length; i++) {
				const x = padding + (i / freqResponse.length) * plotWidth;
				const y = freqPlotY + freqPlotHeight - Math.min(freqResponse[i], 1.2) * freqPlotHeight * 0.8;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			ctx.fillText("0", padding, freqPlotY + freqPlotHeight + 12);
			ctx.fillText("0.5 (Nyquist)", width - padding, freqPlotY + freqPlotHeight + 12);

			// Section 3: Signal filtering
			const sec3Y = sec2Y + sectionHeight + 10;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Signal Processing", padding, sec3Y);

			const sigPlotY = sec3Y + 15;
			const sigPlotHeight = sectionHeight - 25;
			const sigCenterY = sigPlotY + sigPlotHeight / 2;

			// Generate test signal
			const signal: number[] = [];
			const numSamples = 200;
			for (let i = 0; i < numSamples; i++) {
				const t = i / 60;
				const lowFreq = Math.sin(2 * Math.PI * 1.5 * t);
				const highFreq = 0.4 * Math.sin(2 * Math.PI * 12 * t);
				const noise = 0.25 * getNoise(Math.floor((currentTime * 60 + i) % 2000));
				signal.push(lowFreq + highFreq + noise);
			}

			const filtered = ord === 1 ? applyIIR1(signal, a) : applyIIR2(signal, a);

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
			ctx.fillText("Output", padding + 86, legendY);

			ctx.fillStyle = "#a855f7";
			ctx.fillRect(padding + 150, legendY - 8, 12, 3);
			ctx.fillText("Response", padding + 166, legendY);
		},
		[getFrequencyResponse, applyIIR1, applyIIR2, getNoise],
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
			draw(ctx, time, alpha, order, showFeedback);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, alpha, order, showFeedback]);

	const handleReset = () => {
		setTime(0);
		setAlpha(0.2);
		setOrder(1);
		setShowFeedback(true);
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
					<label className="text-sm font-mono text-zinc-400 w-24">Alpha (α)</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-purple-500 rounded-lg"
							style={{ width: `${alpha * 100}%` }}
						/>
						<input
							type="range"
							min="0.01"
							max="0.99"
							step="0.01"
							value={alpha}
							onChange={(e) => setAlpha(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-full border-2 border-purple-300 pointer-events-none"
							style={{ left: `calc(${alpha * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-purple-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{alpha.toFixed(2)}
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
						onClick={() => setShowFeedback(!showFeedback)}
						className={`p-2.5 rounded-xl transition-all ${showFeedback ? "bg-purple-600/20 hover:bg-purple-600/30" : "bg-zinc-900 hover:bg-zinc-800"}`}
						title="Toggle feedback visualization"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke={showFeedback ? "#a855f7" : "#a1a1aa"}
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M17 2.1l4 4-4 4" />
							<path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8" />
							<path d="M7 21.9l-4-4 4-4" />
							<path d="M21 11.8v2a4 4 0 0 1-4 4H4.2" />
						</svg>
					</button>
				</div>
				<div className="flex gap-2">
					{([1, 2] as const).map((o) => (
						<button
							key={o}
							type="button"
							onClick={() => setOrder(o)}
							className={`px-3 py-1.5 rounded-xl text-sm font-mono transition-all ${
								order === o
									? "bg-purple-600/30 text-purple-400"
									: "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
							}`}
						>
							{o === 1 ? "1st Order" : "2nd Order"}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

