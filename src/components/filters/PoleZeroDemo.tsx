import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 350;

export default function PoleZeroDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isVisible, setIsVisible] = useState(true);
	const [poleRadius, setPoleRadius] = useState(0.8);
	const [poleAngle, setPoleAngle] = useState(Math.PI / 4);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const animationRef = useRef<number>();

	// Compute frequency response from pole location
	const getFrequencyResponse = useCallback(
		(radius: number, angle: number, numPoints: number = 100) => {
			const response: number[] = [];
			// Simple two-pole conjugate pair filter
			for (let i = 0; i < numPoints; i++) {
				const freq = (i / numPoints) * Math.PI;
				const z_real = Math.cos(freq);
				const z_imag = Math.sin(freq);

				// Distance from z to poles (conjugate pair)
				const p1_real = radius * Math.cos(angle);
				const p1_imag = radius * Math.sin(angle);

				// |z - p1| and |z - p1*|
				const d1_real = z_real - p1_real;
				const d1_imag = z_imag - p1_imag;
				const d2_real = z_real - p1_real;
				const d2_imag = z_imag + p1_imag; // conjugate

				const dist1 = Math.sqrt(d1_real * d1_real + d1_imag * d1_imag);
				const dist2 = Math.sqrt(d2_real * d2_real + d2_imag * d2_imag);

				// Frequency response magnitude is inversely proportional to distance from poles
				const gain = 1 / (dist1 * dist2);
				response.push(Math.min(gain, 5));
			}

			// Normalize
			const maxGain = Math.max(...response);
			return response.map((g) => g / maxGain);
		},
		[],
	);

	// Apply the filter to a signal
	const applyFilter = useCallback((signal: number[], radius: number, angle: number) => {
		const output: number[] = [];
		const a1 = -2 * radius * Math.cos(angle);
		const a2 = radius * radius;

		let y1 = 0, y2 = 0;
		for (let i = 0; i < signal.length; i++) {
			const y = signal[i] - a1 * y1 - a2 * y2;
			output.push(y);
			y2 = y1;
			y1 = y;
		}

		// Normalize output
		const maxOut = Math.max(...output.map(Math.abs));
		return output.map((y) => y / maxOut);
	}, []);

	const draw = useCallback(
		(ctx: CanvasRenderingContext2D, radius: number, angle: number, currentTime: number) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 40;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Left side: Z-plane (pole-zero plot)
			const zPlaneSize = Math.min(height - 2 * padding - 30, (width - 3 * padding) / 2);
			const zPlaneX = padding + zPlaneSize / 2;
			const zPlaneY = padding + zPlaneSize / 2 + 20;

			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Z-Plane (Pole-Zero Plot)", padding, 22);

			// Draw unit circle
			ctx.strokeStyle = "#334155";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(zPlaneX, zPlaneY, zPlaneSize / 2, 0, Math.PI * 2);
			ctx.stroke();

			// Draw axes
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(zPlaneX - zPlaneSize / 2 - 10, zPlaneY);
			ctx.lineTo(zPlaneX + zPlaneSize / 2 + 10, zPlaneY);
			ctx.moveTo(zPlaneX, zPlaneY - zPlaneSize / 2 - 10);
			ctx.lineTo(zPlaneX, zPlaneY + zPlaneSize / 2 + 10);
			ctx.stroke();

			// Labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			ctx.fillText("Re", zPlaneX + zPlaneSize / 2 + 15, zPlaneY + 4);
			ctx.fillText("Im", zPlaneX, zPlaneY - zPlaneSize / 2 - 15);
			ctx.fillText("1", zPlaneX + zPlaneSize / 2, zPlaneY + 15);
			ctx.fillText("-1", zPlaneX - zPlaneSize / 2, zPlaneY + 15);

			// Draw poles (× markers)
			const poleX = zPlaneX + (radius * Math.cos(angle)) * (zPlaneSize / 2);
			const poleY = zPlaneY - (radius * Math.sin(angle)) * (zPlaneSize / 2);
			const poleX2 = zPlaneX + (radius * Math.cos(-angle)) * (zPlaneSize / 2);
			const poleY2 = zPlaneY - (radius * Math.sin(-angle)) * (zPlaneSize / 2);

			ctx.strokeStyle = "#ef4444";
			ctx.lineWidth = 2;
			const crossSize = 8;

			// Pole 1
			ctx.beginPath();
			ctx.moveTo(poleX - crossSize, poleY - crossSize);
			ctx.lineTo(poleX + crossSize, poleY + crossSize);
			ctx.moveTo(poleX + crossSize, poleY - crossSize);
			ctx.lineTo(poleX - crossSize, poleY + crossSize);
			ctx.stroke();

			// Pole 2 (conjugate)
			ctx.beginPath();
			ctx.moveTo(poleX2 - crossSize, poleY2 - crossSize);
			ctx.lineTo(poleX2 + crossSize, poleY2 + crossSize);
			ctx.moveTo(poleX2 + crossSize, poleY2 - crossSize);
			ctx.lineTo(poleX2 - crossSize, poleY2 + crossSize);
			ctx.stroke();

			// Draw stability region indicator
			if (radius >= 1) {
				ctx.fillStyle = "rgba(239, 68, 68, 0.2)";
				ctx.beginPath();
				ctx.arc(zPlaneX, zPlaneY, zPlaneSize / 2, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = "#ef4444";
				ctx.font = "11px monospace";
				ctx.textAlign = "center";
				ctx.fillText("UNSTABLE!", zPlaneX, zPlaneY + zPlaneSize / 2 + 20);
			}

			// Right side: Frequency response
			const freqX = padding + zPlaneSize + padding;
			const freqWidth = width - freqX - padding;
			const freqHeight = (height - 2 * padding - 40) / 2;

			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Frequency Response", freqX, 22);

			const freqPlotY = padding + 20;
			const response = getFrequencyResponse(radius, angle);

			// Grid
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 4; i++) {
				const y = freqPlotY + (freqHeight * i) / 4;
				ctx.beginPath();
				ctx.moveTo(freqX, y);
				ctx.lineTo(freqX + freqWidth, y);
				ctx.stroke();
			}

			// Draw response
			ctx.beginPath();
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 2;
			for (let i = 0; i < response.length; i++) {
				const x = freqX + (i / response.length) * freqWidth;
				const y = freqPlotY + freqHeight - response[i] * freqHeight * 0.9;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Mark resonant frequency
			const resonantFreq = angle / Math.PI;
			const resonantX = freqX + resonantFreq * freqWidth;
			ctx.strokeStyle = "rgba(249, 115, 22, 0.4)";
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(resonantX, freqPlotY);
			ctx.lineTo(resonantX, freqPlotY + freqHeight);
			ctx.stroke();
			ctx.setLineDash([]);

			// Labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			ctx.fillText("0", freqX, freqPlotY + freqHeight + 12);
			ctx.fillText("π", freqX + freqWidth, freqPlotY + freqHeight + 12);

			// Signal filtering demo
			const sigPlotY = freqPlotY + freqHeight + 35;
			const sigHeight = freqHeight - 20;
			const sigCenterY = sigPlotY + sigHeight / 2;

			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Filter Output", freqX, sigPlotY - 12);

			// Generate test signal (sweep)
			const signal: number[] = [];
			const numSamples = 100;
			for (let i = 0; i < numSamples; i++) {
				const t = i / numSamples;
				// Chirp signal
				const freq = 0.1 + t * 0.4;
				signal.push(Math.sin(2 * Math.PI * freq * i * 0.5 + currentTime));
			}

			const filtered = applyFilter(signal, radius, angle);

			// Draw filtered
			ctx.beginPath();
			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 2;
			for (let i = 0; i < filtered.length; i++) {
				const x = freqX + (i / filtered.length) * freqWidth;
				const y = sigCenterY - filtered[i] * (sigHeight * 0.4);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Legend
			const legendY = height - 10;
			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";

			ctx.strokeStyle = "#ef4444";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(padding, legendY - 5);
			ctx.lineTo(padding + 8, legendY + 3);
			ctx.moveTo(padding + 8, legendY - 5);
			ctx.lineTo(padding, legendY + 3);
			ctx.stroke();
			ctx.fillStyle = "#ef4444";
			ctx.fillText("Poles", padding + 14, legendY);

			ctx.fillStyle = "#f97316";
			ctx.fillRect(padding + 70, legendY - 6, 12, 3);
			ctx.fillText("Response", padding + 86, legendY);

			ctx.fillStyle = "#22c55e";
			ctx.fillRect(padding + 170, legendY - 6, 12, 3);
			ctx.fillText("Output", padding + 186, legendY);
		},
		[getFrequencyResponse, applyFilter],
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
				setTime((t) => t + 0.05);
			}
			draw(ctx, poleRadius, poleAngle, time);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isVisible, poleRadius, poleAngle, time, isRunning]);

	const handleReset = () => {
		setPoleRadius(0.8);
		setPoleAngle(Math.PI / 4);
		setTime(0);
	};

	const isUnstable = poleRadius >= 1;

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
					<label className="text-sm font-mono text-zinc-400 w-28">Pole Radius</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className={`absolute left-0 top-0 h-full rounded-lg ${isUnstable ? "bg-red-500" : "bg-orange-500"}`}
							style={{ width: `${(poleRadius / 1.2) * 100}%` }}
						/>
						<input
							type="range"
							min="0.1"
							max="1.2"
							step="0.01"
							value={poleRadius}
							onChange={(e) => setPoleRadius(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 pointer-events-none ${isUnstable ? "bg-red-500 border-red-300" : "bg-orange-500 border-orange-300"}`}
							style={{ left: `calc(${(poleRadius / 1.2) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className={`text-sm font-mono w-12 text-right ${isUnstable ? "text-red-400" : "text-orange-400"}`}
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{poleRadius.toFixed(2)}
					</span>
				</div>

				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-28">Pole Angle</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-purple-500 rounded-lg"
							style={{ width: `${(poleAngle / Math.PI) * 100}%` }}
						/>
						<input
							type="range"
							min="0.1"
							max={Math.PI - 0.1}
							step="0.01"
							value={poleAngle}
							onChange={(e) => setPoleAngle(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-full border-2 border-purple-300 pointer-events-none"
							style={{ left: `calc(${(poleAngle / Math.PI) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-purple-400 w-16 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{((poleAngle / Math.PI) * 180).toFixed(0)}°
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
					<div className={`px-2 py-1.5 rounded-xl flex flex-col items-center min-w-[80px] ${isUnstable ? "bg-red-900/30" : "bg-zinc-900"}`}>
						<span className="text-zinc-500 text-[10px]">Stability</span>
						<span className={isUnstable ? "text-red-400" : "text-emerald-400"}>
							{isUnstable ? "Unstable" : "Stable"}
						</span>
					</div>
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[80px]">
						<span className="text-zinc-500 text-[10px]">Resonance</span>
						<span className="text-purple-400">
							{((poleAngle / Math.PI) * 0.5).toFixed(2)} × π
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

