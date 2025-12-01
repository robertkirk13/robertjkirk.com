import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 340;

export default function NyquistDiagram() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isVisible, setIsVisible] = useState(true);
	const [sampleRate, setSampleRate] = useState(20);
	const [hoveredFreq, setHoveredFreq] = useState<number | null>(null);
	const animationRef = useRef<number>();

	const draw = useCallback(
		(ctx: CanvasRenderingContext2D, fs: number, hovered: number | null) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;
			const spectrumHeight = 120;
			const topY = padding;
			const bottomY = padding + spectrumHeight + 80;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const nyquist = fs / 2;
			const maxFreq = fs * 1.5;

			// === FREQUENCY AXIS (Original spectrum) ===
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Original Signal Spectrum", padding, topY - 8);

			// Axis line
			ctx.strokeStyle = "#475569";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(padding, topY + spectrumHeight);
			ctx.lineTo(width - padding, topY + spectrumHeight);
			ctx.stroke();

			// Draw frequency axis labels
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			
			const freqLabels = [0, nyquist / 2, nyquist, fs * 0.75, fs, fs * 1.25, maxFreq];
			for (const f of freqLabels) {
				const x = padding + (f / maxFreq) * plotWidth;
				if (x <= width - padding) {
					ctx.beginPath();
					ctx.moveTo(x, topY + spectrumHeight);
					ctx.lineTo(x, topY + spectrumHeight + 5);
					ctx.stroke();
					ctx.fillText(`${f.toFixed(0)}`, x, topY + spectrumHeight + 18);
				}
			}

			// Nyquist frequency marker
			const nyquistX = padding + (nyquist / maxFreq) * plotWidth;
			ctx.strokeStyle = "#eab308";
			ctx.lineWidth = 2;
			ctx.setLineDash([5, 5]);
			ctx.beginPath();
			ctx.moveTo(nyquistX, topY);
			ctx.lineTo(nyquistX, topY + spectrumHeight);
			ctx.stroke();
			ctx.setLineDash([]);
			
			ctx.fillStyle = "#eab308";
			ctx.font = "11px monospace";
			ctx.textAlign = "center";
			ctx.fillText(`Nyquist = ${nyquist} Hz`, nyquistX, topY - 2);

			// Sample rate marker
			const fsX = padding + (fs / maxFreq) * plotWidth;
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			ctx.setLineDash([5, 5]);
			ctx.beginPath();
			ctx.moveTo(fsX, topY);
			ctx.lineTo(fsX, topY + spectrumHeight);
			ctx.stroke();
			ctx.setLineDash([]);
			
			ctx.fillStyle = "#3b82f6";
			ctx.textAlign = "center";
			ctx.fillText(`fs = ${fs} Hz`, fsX, topY + spectrumHeight + 32);

			// Draw "safe zone" (0 to Nyquist)
			ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
			ctx.fillRect(padding, topY, nyquistX - padding, spectrumHeight);
			
			// Draw "danger zone" (above Nyquist)
			ctx.fillStyle = "rgba(239, 68, 68, 0.1)";
			ctx.fillRect(nyquistX, topY, width - padding - nyquistX, spectrumHeight);

			// Zone labels
			ctx.font = "10px sans-serif";
			ctx.fillStyle = "#22c55e";
			ctx.textAlign = "center";
			ctx.fillText("SAFE", padding + (nyquistX - padding) / 2, topY + 15);
			ctx.fillStyle = "#ef4444";
			ctx.fillText("ALIASING", nyquistX + (width - padding - nyquistX) / 2, topY + 15);

			// Draw example frequency spike
			const exampleFreqs = [3, 7, 12, 18];
			for (const f of exampleFreqs) {
				if (f > maxFreq) continue;
				const x = padding + (f / maxFreq) * plotWidth;
				const isInSafeZone = f <= nyquist;
				const spikeHeight = 60 + Math.random() * 20;
				
				// Calculate aliased position
				let aliased = f;
				while (aliased > nyquist) {
					aliased = fs - aliased;
					if (aliased < 0) aliased = -aliased;
				}
				aliased = Math.abs(aliased);

				ctx.fillStyle = isInSafeZone ? "#22c55e" : "#ef4444";
				ctx.strokeStyle = isInSafeZone ? "#22c55e" : "#ef4444";
				ctx.lineWidth = 3;
				
				// Draw spike
				ctx.beginPath();
				ctx.moveTo(x, topY + spectrumHeight);
				ctx.lineTo(x, topY + spectrumHeight - spikeHeight);
				ctx.stroke();
				
				// Draw dot at top
				ctx.beginPath();
				ctx.arc(x, topY + spectrumHeight - spikeHeight, 4, 0, Math.PI * 2);
				ctx.fill();

				// Label
				ctx.font = "9px monospace";
				ctx.textAlign = "center";
				ctx.fillText(`${f}Hz`, x, topY + spectrumHeight - spikeHeight - 8);

				// Show aliasing arrow for frequencies above Nyquist
				if (!isInSafeZone) {
					const aliasedX = padding + (aliased / maxFreq) * plotWidth;
					
					// Curved arrow showing folding
					ctx.strokeStyle = "rgba(249, 115, 22, 0.6)";
					ctx.lineWidth = 2;
					ctx.setLineDash([4, 4]);
					ctx.beginPath();
					ctx.moveTo(x, topY + spectrumHeight - spikeHeight / 2);
					// Curve over Nyquist
					ctx.quadraticCurveTo(
						nyquistX, 
						topY + spectrumHeight - spikeHeight - 20,
						aliasedX, 
						topY + spectrumHeight - 40
					);
					ctx.stroke();
					ctx.setLineDash([]);
					
					// Arrow head
					ctx.fillStyle = "rgba(249, 115, 22, 0.8)";
					ctx.beginPath();
					ctx.moveTo(aliasedX, topY + spectrumHeight - 35);
					ctx.lineTo(aliasedX - 4, topY + spectrumHeight - 45);
					ctx.lineTo(aliasedX + 4, topY + spectrumHeight - 45);
					ctx.closePath();
					ctx.fill();
				}
			}

			// === BOTTOM: Sampled spectrum (with aliasing) ===
			ctx.fillStyle = "#94a3b8";
			ctx.font = "13px monospace";
			ctx.textAlign = "left";
			ctx.fillText("After Sampling (what we see)", padding, bottomY - 8);

			// Axis line
			ctx.strokeStyle = "#475569";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(padding, bottomY + spectrumHeight);
			ctx.lineTo(width - padding, bottomY + spectrumHeight);
			ctx.stroke();

			// Draw frequency axis labels (only 0 to Nyquist matters)
			ctx.fillStyle = "#64748b";
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			const bottomLabels = [0, nyquist / 4, nyquist / 2, (3 * nyquist) / 4, nyquist];
			for (const f of bottomLabels) {
				const x = padding + (f / nyquist) * plotWidth;
				ctx.beginPath();
				ctx.moveTo(x, bottomY + spectrumHeight);
				ctx.lineTo(x, bottomY + spectrumHeight + 5);
				ctx.stroke();
				ctx.fillText(`${f.toFixed(0)}`, x, bottomY + spectrumHeight + 18);
			}

			ctx.fillStyle = "#64748b";
			ctx.textAlign = "right";
			ctx.fillText("Hz", width - padding + 15, bottomY + spectrumHeight + 18);

			// Draw sampled spectrum (frequencies fold back)
			for (const f of exampleFreqs) {
				let aliased = f;
				while (aliased > nyquist) {
					aliased = fs - aliased;
					if (aliased < 0) aliased = -aliased;
				}
				aliased = Math.abs(aliased);
				
				if (aliased > nyquist) continue;
				
				const x = padding + (aliased / nyquist) * plotWidth;
				const wasAliased = f > nyquist;
				const spikeHeight = 60;
				
				ctx.fillStyle = wasAliased ? "#f97316" : "#22c55e";
				ctx.strokeStyle = wasAliased ? "#f97316" : "#22c55e";
				ctx.lineWidth = 3;
				
				// Draw spike
				ctx.beginPath();
				ctx.moveTo(x, bottomY + spectrumHeight);
				ctx.lineTo(x, bottomY + spectrumHeight - spikeHeight);
				ctx.stroke();
				
				// Draw dot at top
				ctx.beginPath();
				ctx.arc(x, bottomY + spectrumHeight - spikeHeight, 4, 0, Math.PI * 2);
				ctx.fill();

				// Label
				ctx.font = "9px monospace";
				ctx.textAlign = "center";
				if (wasAliased) {
					ctx.fillText(`${f}→${aliased.toFixed(0)}Hz`, x, bottomY + spectrumHeight - spikeHeight - 8);
				} else {
					ctx.fillText(`${aliased.toFixed(0)}Hz`, x, bottomY + spectrumHeight - spikeHeight - 8);
				}
			}

			// Legend
			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";
			
			const legendY = height - 12;
			ctx.fillStyle = "#22c55e";
			ctx.fillRect(padding, legendY - 8, 10, 10);
			ctx.fillText("Below Nyquist (preserved)", padding + 14, legendY);
			
			ctx.fillStyle = "#ef4444";
			ctx.fillRect(padding + 180, legendY - 8, 10, 10);
			ctx.fillText("Above Nyquist (aliased)", padding + 194, legendY);
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
			draw(ctx, sampleRate, hoveredFreq);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isVisible, sampleRate, hoveredFreq]);

	const handleReset = () => {
		setSampleRate(20);
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
					<label className="text-sm font-mono text-zinc-400 w-24">Sample rate</label>
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
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[90px]">
						<span className="text-zinc-500 text-[10px]">Rule</span>
						<span
							className="text-emerald-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							f &lt; {nyquist} Hz
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

