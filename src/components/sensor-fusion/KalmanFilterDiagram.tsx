import React, { useEffect, useState, useRef } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const WIDTH = 580;
const HEIGHT = 220;

export default function KalmanFilterDiagram() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [phase, setPhase] = useState<"predict" | "update">("predict");
	const animationRef = useRef<number>();

	useEffect(() => {
		const loop = () => {
			setTime((t) => {
				const newTime = t + 0.012;
				// Toggle phase every 2 seconds
				if (Math.floor(newTime / 2) !== Math.floor(t / 2)) {
					setPhase((p) => (p === "predict" ? "update" : "predict"));
				}
				return newTime;
			});
			animationRef.current = requestAnimationFrame(loop);
		};
		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
		ctx.fillStyle = "#000000";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		const centerY = HEIGHT / 2;
		const boxH = 55;
		const boxW = 130;

		// Positions
		const predictX = 150;
		const updateX = 430;

		// Draw box with glow effect when active
		const drawBox = (
			x: number,
			y: number,
			label: string,
			sublabel1: string,
			sublabel2: string,
			color: string,
			active: boolean,
		) => {
			// Glow effect when active
			if (active) {
				ctx.shadowColor = color;
				ctx.shadowBlur = 15;
			}

			ctx.fillStyle = active ? "#1e3a5f" : "#1e293b";
			ctx.beginPath();
			ctx.roundRect(x - boxW / 2, y - boxH / 2, boxW, boxH, 8);
			ctx.fill();
			ctx.strokeStyle = color;
			ctx.lineWidth = active ? 3 : 2;
			ctx.stroke();

			ctx.shadowBlur = 0;

			ctx.fillStyle = color;
			ctx.font = "bold 13px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText(label, x, y - 12);

			ctx.font = "10px monospace";
			ctx.fillStyle = "#94a3b8";
			ctx.fillText(sublabel1, x, y + 5);
			ctx.fillText(sublabel2, x, y + 18);
		};

		// Draw curved arrow
		const drawCurvedArrow = (
			x1: number,
			y1: number,
			x2: number,
			y2: number,
			curveDir: number,
			color: string,
			active: boolean,
		) => {
			const midX = (x1 + x2) / 2;
			const midY = (y1 + y2) / 2 + curveDir * 50;

			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.quadraticCurveTo(midX, midY, x2, y2);
			ctx.strokeStyle = active ? color : "#4b5563";
			ctx.lineWidth = active ? 3 : 2;
			ctx.stroke();

			// Arrow head
			const t = 0.95;
			const dx =
				2 * (1 - t) * (midX - x1) + 2 * t * (x2 - midX);
			const dy =
				2 * (1 - t) * (midY - y1) + 2 * t * (y2 - midY);
			const angle = Math.atan2(dy, dx);

			ctx.beginPath();
			ctx.moveTo(x2, y2);
			ctx.lineTo(
				x2 - 10 * Math.cos(angle - 0.4),
				y2 - 10 * Math.sin(angle - 0.4),
			);
			ctx.lineTo(
				x2 - 10 * Math.cos(angle + 0.4),
				y2 - 10 * Math.sin(angle + 0.4),
			);
			ctx.closePath();
			ctx.fillStyle = active ? color : "#4b5563";
			ctx.fill();

			// Animated dot
			if (active) {
				const dotT = (time * 0.8) % 1;
				const dotX =
					(1 - dotT) * (1 - dotT) * x1 +
					2 * (1 - dotT) * dotT * midX +
					dotT * dotT * x2;
				const dotY =
					(1 - dotT) * (1 - dotT) * y1 +
					2 * (1 - dotT) * dotT * midY +
					dotT * dotT * y2;

				ctx.beginPath();
				ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
				ctx.fillStyle = color;
				ctx.fill();
			}
		};

		// Draw measurement input
		const drawMeasurementInput = (active: boolean) => {
			const x = updateX;
			const y = centerY - 65;

			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x, y + 30);
			ctx.strokeStyle = active ? "#3b82f6" : "#4b5563";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Arrow head
			ctx.beginPath();
			ctx.moveTo(x, y + 30);
			ctx.lineTo(x - 5, y + 22);
			ctx.lineTo(x + 5, y + 22);
			ctx.closePath();
			ctx.fillStyle = active ? "#3b82f6" : "#4b5563";
			ctx.fill();

			// Label
			ctx.fillStyle = active ? "#3b82f6" : "#64748b";
			ctx.font = "11px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("Measurement z", x, y - 8);

			// Animated dot
			if (active) {
				const dotT = (time * 0.8) % 1;
				ctx.beginPath();
				ctx.arc(x, y + dotT * 30, 4, 0, Math.PI * 2);
				ctx.fillStyle = "#3b82f6";
				ctx.fill();
			}
		};

		// Draw estimate output
		const drawEstimateOutput = () => {
			const x = updateX + 100;
			const y = centerY;

			ctx.beginPath();
			ctx.moveTo(updateX + boxW / 2, y);
			ctx.lineTo(x, y);
			ctx.strokeStyle = "#e879f9";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Arrow head
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x - 8, y - 5);
			ctx.lineTo(x - 8, y + 5);
			ctx.closePath();
			ctx.fillStyle = "#e879f9";
			ctx.fill();

			// Label
			ctx.fillStyle = "#e879f9";
			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("Estimate x̂", x + 5, y - 8);
			ctx.font = "10px monospace";
			ctx.fillStyle = "#94a3b8";
			ctx.fillText("& uncertainty P", x + 5, y + 8);
		};

		// Draw boxes
		drawBox(
			predictX,
			centerY,
			"PREDICT",
			"x̂⁻ = F × x̂",
			"P⁻ = F×P×Fᵀ + Q",
			"#f97316",
			phase === "predict",
		);

		drawBox(
			updateX,
			centerY,
			"UPDATE",
			"K = P⁻/(P⁻ + R)",
			"x̂ = x̂⁻ + K(z − x̂⁻)",
			"#22c55e",
			phase === "update",
		);

		// Draw arrows
		drawCurvedArrow(
			predictX + boxW / 2,
			centerY - 10,
			updateX - boxW / 2,
			centerY - 10,
			-1,
			"#f97316",
			phase === "predict",
		);

		drawCurvedArrow(
			updateX - boxW / 2,
			centerY + 10,
			predictX + boxW / 2,
			centerY + 10,
			1,
			"#22c55e",
			phase === "update",
		);

		// Labels on arrows
		ctx.fillStyle = phase === "predict" ? "#f97316" : "#64748b";
		ctx.font = "10px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("prior estimate", (predictX + updateX) / 2, centerY - 50);

		ctx.fillStyle = phase === "update" ? "#22c55e" : "#64748b";
		ctx.fillText("posterior estimate", (predictX + updateX) / 2, centerY + 65);

		// Measurement input
		drawMeasurementInput(phase === "update");

		// Estimate output
		drawEstimateOutput();

		// Phase indicator
		ctx.fillStyle = phase === "predict" ? "#f97316" : "#22c55e";
		ctx.font = "bold 12px sans-serif";
		ctx.textAlign = "left";
		ctx.fillText(
			phase === "predict" ? "● Predicting..." : "● Updating...",
			20,
			HEIGHT - 15,
		);
	}, [time, phase]);

	return (
		<div className="not-prose flex flex-col items-center gap-2 my-6">
			<canvas
				ref={canvasRef}
				width={WIDTH * DPR}
				height={HEIGHT * DPR}
				className="w-full max-w-[580px] rounded-xl"
				style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
			/>
			<p className="text-xs text-zinc-500 text-center max-w-lg">
				The Kalman filter cycles between <span className="text-orange-400">prediction</span> (use model to estimate forward) and{" "}
				<span className="text-emerald-400">update</span> (correct using measurement). The Kalman gain K balances trust between prediction and measurement.
			</p>
		</div>
	);
}

