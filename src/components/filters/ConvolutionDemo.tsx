import React, { useRef, useEffect, useState, useCallback } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 420;

export default function ConvolutionDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isVisible, setIsVisible] = useState(true);
	const [kernelPosition, setKernelPosition] = useState(0.5);
	const [kernelType, setKernelType] = useState<"box" | "gaussian" | "edge">("box");
	const [isAnimating, setIsAnimating] = useState(false);
	const animationRef = useRef<number>();
	const signalRef = useRef<number[]>([]);

	// Generate a test signal
	useEffect(() => {
		const signal: number[] = [];
		for (let i = 0; i < 100; i++) {
			// Step function + some noise + sine
			let value = 0;
			if (i > 20 && i < 40) value = 1;
			if (i >= 40 && i < 60) value = 0.5;
			if (i >= 60 && i < 80) value = Math.sin((i - 60) * 0.3);
			value += (Math.random() - 0.5) * 0.1;
			signal.push(value);
		}
		signalRef.current = signal;
	}, []);

	const getKernel = useCallback((type: "box" | "gaussian" | "edge") => {
		switch (type) {
			case "box":
				return [0.2, 0.2, 0.2, 0.2, 0.2];
			case "gaussian":
				return [0.06, 0.24, 0.4, 0.24, 0.06];
			case "edge":
				return [-1, -1, 0, 1, 1];
		}
	}, []);

	const convolve = useCallback(
		(signal: number[], kernel: number[], position: number) => {
			const result: number[] = [];
			const halfKernel = Math.floor(kernel.length / 2);

			for (let i = 0; i < signal.length; i++) {
				let sum = 0;
				for (let j = 0; j < kernel.length; j++) {
					const idx = i - halfKernel + j;
					if (idx >= 0 && idx < signal.length) {
						sum += signal[idx] * kernel[j];
					}
				}
				result.push(sum);
			}
			return result;
		},
		[],
	);

	const draw = useCallback(
		(ctx: CanvasRenderingContext2D, position: number, type: "box" | "gaussian" | "edge") => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const padding = 50;
			const plotWidth = width - 2 * padding;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			const signal = signalRef.current;
			if (signal.length === 0) return;

			const kernel = getKernel(type);
			const filtered = convolve(signal, kernel, position);

			// Draw sections
			const sectionHeight = (height - 60) / 3;

			// Section 1: Input signal with sliding kernel
			const sec1Y = 30;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Input Signal", padding, sec1Y);

			// Draw input signal
			const sig1CenterY = sec1Y + sectionHeight / 2 + 10;
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			ctx.beginPath();
			for (let i = 0; i < signal.length; i++) {
				const x = padding + (i / signal.length) * plotWidth;
				const y = sig1CenterY - signal[i] * (sectionHeight * 0.35);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw sliding kernel window
			const kernelCenterIdx = Math.floor(position * signal.length);
			const halfKernel = Math.floor(kernel.length / 2);
			const kernelStartX = padding + ((kernelCenterIdx - halfKernel) / signal.length) * plotWidth;
			const kernelEndX = padding + ((kernelCenterIdx + halfKernel + 1) / signal.length) * plotWidth;
			const kernelWidth = kernelEndX - kernelStartX;

			ctx.fillStyle = "rgba(249, 115, 22, 0.2)";
			ctx.fillRect(kernelStartX, sec1Y + 15, kernelWidth, sectionHeight - 20);
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 2;
			ctx.strokeRect(kernelStartX, sec1Y + 15, kernelWidth, sectionHeight - 20);

			// Draw kernel weights on the signal points
			ctx.fillStyle = "#f97316";
			for (let j = 0; j < kernel.length; j++) {
				const idx = kernelCenterIdx - halfKernel + j;
				if (idx >= 0 && idx < signal.length) {
					const x = padding + (idx / signal.length) * plotWidth;
					const y = sig1CenterY - signal[idx] * (sectionHeight * 0.35);
					ctx.beginPath();
					ctx.arc(x, y, 5, 0, Math.PI * 2);
					ctx.fill();
				}
			}

			// Section 2: Kernel visualization
			const sec2Y = sec1Y + sectionHeight + 10;
			ctx.fillStyle = "#94a3b8";
			ctx.fillText(`Kernel: ${type.charAt(0).toUpperCase() + type.slice(1)}`, padding, sec2Y);

			const kernelPlotCenterY = sec2Y + sectionHeight / 2 + 10;
			const barWidth = 30;
			const totalKernelWidth = kernel.length * barWidth;
			const kernelStartXPlot = (width - totalKernelWidth) / 2;

			// Draw kernel bars
			for (let i = 0; i < kernel.length; i++) {
				const x = kernelStartXPlot + i * barWidth;
				const barHeight = Math.abs(kernel[i]) * (sectionHeight * 0.6);
				const y = kernel[i] >= 0 ? kernelPlotCenterY - barHeight : kernelPlotCenterY;

				ctx.fillStyle = kernel[i] >= 0 ? "#f97316" : "#ef4444";
				ctx.fillRect(x + 3, y, barWidth - 6, barHeight);

				// Label
				ctx.fillStyle = "#94a3b8";
				ctx.font = "10px monospace";
				ctx.textAlign = "center";
				ctx.fillText(kernel[i].toFixed(2), x + barWidth / 2, kernelPlotCenterY + (sectionHeight * 0.35));
			}

			// Draw center line for kernel
			ctx.strokeStyle = "#334155";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(kernelStartXPlot, kernelPlotCenterY);
			ctx.lineTo(kernelStartXPlot + totalKernelWidth, kernelPlotCenterY);
			ctx.stroke();

			// Section 3: Output signal
			const sec3Y = sec2Y + sectionHeight + 10;
			ctx.fillStyle = "#94a3b8";
			ctx.font = "12px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Output (Convolved)", padding, sec3Y);

			const sig3CenterY = sec3Y + sectionHeight / 2 + 10;
			
			// Scale for edge detection
			const maxFiltered = Math.max(...filtered.map(Math.abs));
			const scale = type === "edge" ? 0.5 / maxFiltered : 1;

			ctx.strokeStyle = "#22c55e";
			ctx.lineWidth = 2;
			ctx.beginPath();
			for (let i = 0; i < filtered.length; i++) {
				const x = padding + (i / filtered.length) * plotWidth;
				const y = sig3CenterY - filtered[i] * scale * (sectionHeight * 0.35);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();

			// Draw current output point
			if (kernelCenterIdx >= 0 && kernelCenterIdx < filtered.length) {
				const x = padding + (kernelCenterIdx / filtered.length) * plotWidth;
				const y = sig3CenterY - filtered[kernelCenterIdx] * scale * (sectionHeight * 0.35);
				ctx.fillStyle = "#22c55e";
				ctx.beginPath();
				ctx.arc(x, y, 6, 0, Math.PI * 2);
				ctx.fill();

				// Draw connecting line
				ctx.strokeStyle = "rgba(34, 197, 94, 0.3)";
				ctx.setLineDash([4, 4]);
				ctx.beginPath();
				ctx.moveTo(x, sec1Y + sectionHeight);
				ctx.lineTo(x, y);
				ctx.stroke();
				ctx.setLineDash([]);
			}
		},
		[getKernel, convolve],
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
			if (isAnimating) {
				setKernelPosition((p) => {
					const next = p + 0.003;
					if (next > 0.95) {
						setIsAnimating(false);
						return 0.95;
					}
					return next;
				});
			}
			draw(ctx, kernelPosition, kernelType);
			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [draw, isVisible, kernelPosition, kernelType, isAnimating]);

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
					<label className="text-sm font-mono text-zinc-400 w-28">Position</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-orange-500 rounded-lg"
							style={{ width: `${kernelPosition * 100}%` }}
						/>
						<input
							type="range"
							min="0.05"
							max="0.95"
							step="0.01"
							value={kernelPosition}
							onChange={(e) => {
								setKernelPosition(parseFloat(e.target.value));
								setIsAnimating(false);
							}}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-orange-500 rounded-full border-2 border-orange-300 pointer-events-none"
							style={{ left: `calc(${kernelPosition * 100}% - 8px)` }}
						/>
					</div>
				</div>
			</div>

			<div className="flex justify-between items-center flex-wrap gap-3">
				<div className="flex gap-2 items-center">
					<button
						type="button"
						onClick={() => {
							setKernelPosition(0.05);
							setIsAnimating(true);
						}}
						className={`p-2.5 rounded-xl transition-all ${isAnimating ? "bg-orange-600/20 hover:bg-orange-600/30" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700"}`}
						title="Animate"
					>
						{isAnimating ? (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#f97316"
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
					{(["box", "gaussian", "edge"] as const).map((type) => (
						<button
							key={type}
							type="button"
							onClick={() => setKernelType(type)}
							className={`px-3 py-1.5 rounded-xl text-sm font-mono transition-all ${
								kernelType === type
									? "bg-orange-600/30 text-orange-400"
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

