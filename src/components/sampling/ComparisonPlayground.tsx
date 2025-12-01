import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 450;

export default function ComparisonPlayground() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [frequency, setFrequency] = useState(3);
	const animationRef = useRef<number>();

	// Four different sample rates to compare
	const sampleRates = [4, 8, 16, 32];

	const draw = useCallback(
		(ctx: CanvasRenderingContext2D, currentTime: number, freq: number) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 40;
			const plotWidth = width - 2 * padding;
			const plotHeight = (height - 5 * padding) / 4;
			const timeWindow = 2;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Draw each sample rate comparison
			sampleRates.forEach((fs, index) => {
				const rowY = padding + index * (plotHeight + padding * 0.5);
				const centerY = rowY + plotHeight / 2;
				const nyquist = fs / 2;
				const isAliasing = freq > nyquist;

				// Grid/center line
				ctx.strokeStyle = "#1e293b";
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(padding, centerY);
				ctx.lineTo(width - padding, centerY);
				ctx.stroke();

				// Draw original signal (faded)
				ctx.beginPath();
				ctx.strokeStyle = "rgba(34, 197, 94, 0.2)";
				ctx.lineWidth = 1.5;
				for (let i = 0; i <= 300; i++) {
					const t = currentTime + (timeWindow * i) / 300;
					const x = padding + (plotWidth * i) / 300;
					const y = centerY - (plotHeight / 2) * 0.8 * Math.sin(2 * Math.PI * freq * t);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();

				// Generate samples
				const samplePeriod = 1 / fs;
				const firstIdx = Math.ceil(currentTime / samplePeriod);
				const lastIdx = Math.floor((currentTime + timeWindow) / samplePeriod);
				const samples: { t: number; value: number }[] = [];

				for (let i = firstIdx; i <= lastIdx; i++) {
					const t = i * samplePeriod;
					samples.push({ t, value: Math.sin(2 * Math.PI * freq * t) });
				}

				// Draw reconstructed (linear interpolation)
				if (samples.length > 1) {
					ctx.beginPath();
					ctx.strokeStyle = isAliasing ? "#ef4444" : "#3b82f6";
					ctx.lineWidth = 2;
					for (let i = 0; i <= 300; i++) {
						const t = currentTime + (timeWindow * i) / 300;
						const x = padding + (plotWidth * i) / 300;

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
				ctx.fillStyle = isAliasing ? "#ef4444" : "#3b82f6";
				for (const sample of samples) {
					const x = padding + ((sample.t - currentTime) / timeWindow) * plotWidth;
					const y = centerY - (plotHeight / 2) * 0.8 * sample.value;
					ctx.beginPath();
					ctx.arc(x, y, 3, 0, Math.PI * 2);
					ctx.fill();
				}

				// Labels
				ctx.fillStyle = isAliasing ? "#ef4444" : "#94a3b8";
				ctx.font = "12px monospace";
				ctx.textAlign = "left";
				ctx.fillText(`fs = ${fs} Hz`, padding, rowY - 4);

				// Status badge
				const ratio = fs / (2 * freq);
				let status: string;
				let statusColor: string;

				if (isAliasing) {
					status = "ALIASING";
					statusColor = "#ef4444";
				} else if (ratio < 1.5) {
					status = "Marginal";
					statusColor = "#f97316";
				} else if (ratio < 3) {
					status = "Good";
					statusColor = "#3b82f6";
				} else {
					status = "Excellent";
					statusColor = "#22c55e";
				}

				ctx.fillStyle = statusColor;
				ctx.font = "10px monospace";
				ctx.textAlign = "right";
				ctx.fillText(status, width - padding, rowY - 4);

				// Nyquist info
				ctx.fillStyle = "#64748b";
				ctx.font = "10px monospace";
				ctx.textAlign = "center";
				ctx.fillText(`Nyquist: ${nyquist} Hz`, width / 2, rowY - 4);
			});

			// Bottom info
			ctx.fillStyle = "#94a3b8";
			ctx.font = "11px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText(
				`Signal frequency: ${freq.toFixed(1)} Hz — Minimum sample rate: ${(freq * 2).toFixed(1)} Hz`,
				width / 2,
				height - 12
			);
		},
		[sampleRates],
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
			draw(ctx, time, frequency);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isRunning, isVisible, time, frequency]);

	const handleReset = () => {
		setTime(0);
		setFrequency(3);
	};

	const handleRandomize = () => {
		setFrequency(Math.round((1 + Math.random() * 9) * 10) / 10);
	};

	// Calculate status for each sample rate
	const getStatusCounts = () => {
		let aliasing = 0;
		let marginal = 0;
		let good = 0;
		let excellent = 0;

		for (const fs of sampleRates) {
			const nyquist = fs / 2;
			const ratio = fs / (2 * frequency);
			if (frequency > nyquist) {
				aliasing++;
			} else if (ratio < 1.5) {
				marginal++;
			} else if (ratio < 3) {
				good++;
			} else {
				excellent++;
			}
		}

		return { aliasing, marginal, good, excellent };
	};

	const counts = getStatusCounts();

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
					<label className="text-sm font-mono text-zinc-400 w-20">Signal freq</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-emerald-500 rounded-lg"
							style={{ width: `${((frequency - 0.5) / 14.5) * 100}%` }}
						/>
						<input
							type="range"
							min="0.5"
							max="15"
							step="0.1"
							value={frequency}
							onChange={(e) => setFrequency(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-emerald-500 rounded-full border-2 border-emerald-300 pointer-events-none"
							style={{ left: `calc(${((frequency - 0.5) / 14.5) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-emerald-400 w-16 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{frequency.toFixed(1)} Hz
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
						onClick={handleRandomize}
						className="px-3 py-2 rounded-xl transition-all bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 text-sm"
					>
						Randomize
					</button>
				</div>
				<div className="flex gap-2 font-mono text-xs flex-wrap">
					{counts.aliasing > 0 && (
						<div className="px-2 py-1.5 bg-red-900/30 rounded-xl flex flex-col items-center min-w-[60px]">
							<span className="text-zinc-500 text-[10px]">Aliasing</span>
							<span className="text-red-400">{counts.aliasing}</span>
						</div>
					)}
					{counts.marginal > 0 && (
						<div className="px-2 py-1.5 bg-orange-900/30 rounded-xl flex flex-col items-center min-w-[60px]">
							<span className="text-zinc-500 text-[10px]">Marginal</span>
							<span className="text-orange-400">{counts.marginal}</span>
						</div>
					)}
					{counts.good > 0 && (
						<div className="px-2 py-1.5 bg-blue-900/30 rounded-xl flex flex-col items-center min-w-[60px]">
							<span className="text-zinc-500 text-[10px]">Good</span>
							<span className="text-blue-400">{counts.good}</span>
						</div>
					)}
					{counts.excellent > 0 && (
						<div className="px-2 py-1.5 bg-emerald-900/30 rounded-xl flex flex-col items-center min-w-[60px]">
							<span className="text-zinc-500 text-[10px]">Excellent</span>
							<span className="text-emerald-400">{counts.excellent}</span>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

