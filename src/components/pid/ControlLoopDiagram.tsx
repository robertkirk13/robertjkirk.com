import React, { useEffect, useState, useRef } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const WIDTH = 540;
const HEIGHT = 155;

export default function ControlLoopDiagram() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const animationRef = useRef<number>();

	useEffect(() => {
		const loop = () => {
			setTime((t) => t + 0.012); // Slower animation
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
		ctx.fillStyle = "#0a0a0a";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		const y = HEIGHT / 2 - 8;
		const boxH = 44;

		// Positions
		const sumX = 90;
		const controllerX = 220;
		const plantX = 400;

		// Draw a single animated dot on a line segment
		const drawFlowDot = (
			x1: number,
			y1: number,
			x2: number,
			y2: number,
			color: string,
			phase: number,
		) => {
			const t = (time * 0.8 + phase) % 1;
			const x = x1 + (x2 - x1) * t;
			const dotY = y1 + (y2 - y1) * t;
			ctx.beginPath();
			ctx.arc(x, dotY, 2.5, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.globalAlpha = 0.7;
			ctx.fill();
			ctx.globalAlpha = 1;
		};

		// Draw line with arrow
		const drawArrowLine = (
			x1: number,
			y1: number,
			x2: number,
			y2: number,
			color: string,
			label?: string,
			labelY?: number,
		) => {
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.5;
			ctx.stroke();

			// Arrow head
			const angle = Math.atan2(y2 - y1, x2 - x1);
			ctx.beginPath();
			ctx.moveTo(x2, y2);
			ctx.lineTo(
				x2 - 7 * Math.cos(angle - 0.4),
				y2 - 7 * Math.sin(angle - 0.4),
			);
			ctx.lineTo(
				x2 - 7 * Math.cos(angle + 0.4),
				y2 - 7 * Math.sin(angle + 0.4),
			);
			ctx.closePath();
			ctx.fillStyle = color;
			ctx.fill();

			if (label && labelY !== undefined) {
				ctx.fillStyle = color;
				ctx.font = "9px monospace";
				ctx.textAlign = "center";
				ctx.fillText(label, (x1 + x2) / 2, labelY);
			}
		};

		// Draw controller box (larger, with equation)
		const drawController = (x: number) => {
			const w = 120;
			const h = boxH + 8;
			ctx.fillStyle = "#1e293b";
			ctx.beginPath();
			ctx.roundRect(x - w / 2, y - h / 2, w, h, 6);
			ctx.fill();
			ctx.strokeStyle = "#a855f7";
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.fillStyle = "#a855f7";
			ctx.font = "bold 11px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("Controller", x, y - 6);

			// PID equation
			ctx.font = "8px monospace";
			ctx.fillStyle = "#64748b";
			ctx.fillText("Kp·e + Ki·∫e + Kd·ė", x, y + 11);
		};

		// Draw plant box
		const drawPlant = (x: number) => {
			const w = 100;
			ctx.fillStyle = "#1e293b";
			ctx.beginPath();
			ctx.roundRect(x - w / 2, y - boxH / 2, w, boxH, 6);
			ctx.fill();
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.fillStyle = "#3b82f6";
			ctx.font = "bold 11px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("Plant", x, y - 4);

			ctx.font = "9px monospace";
			ctx.fillStyle = "#64748b";
			ctx.fillText("(motor + pointer)", x, y + 10);
		};

		// Draw sum circle
		const drawSum = (x: number) => {
			ctx.beginPath();
			ctx.arc(x, y, 14, 0, Math.PI * 2);
			ctx.fillStyle = "#1e293b";
			ctx.fill();
			ctx.strokeStyle = "#ef4444";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Sigma symbol
			ctx.fillStyle = "#ef4444";
			ctx.font = "bold 14px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("Σ", x, y + 5);
		};

		// Input: Target (setpoint)
		ctx.fillStyle = "#f97316";
		ctx.font = "bold 10px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("Setpoint", 30, y - 12);
		ctx.beginPath();
		ctx.arc(30, y, 4, 0, Math.PI * 2);
		ctx.fill();

		// Setpoint → Sum
		drawArrowLine(34, y, sumX - 14, y, "#f97316");
		drawFlowDot(34, y, sumX - 14, y, "#f97316", 0);

		// Sum circle
		drawSum(sumX);

		// Sum → Controller
		drawArrowLine(
			sumX + 14,
			y,
			controllerX - 60,
			y,
			"#ef4444",
			"error",
			y - 12,
		);
		drawFlowDot(sumX + 14, y, controllerX - 60, y, "#ef4444", 0.25);

		// Controller
		drawController(controllerX);

		// Controller → Plant
		drawArrowLine(
			controllerX + 60,
			y,
			plantX - 50,
			y,
			"#a855f7",
			"torque",
			y - 12,
		);
		drawFlowDot(controllerX + 60, y, plantX - 50, y, "#a855f7", 0.5);

		// Plant
		drawPlant(plantX);

		// Feedback line (bottom) - starts directly from plant
		const feedbackY = y + 52;
		ctx.beginPath();
		ctx.moveTo(plantX + 50, y);
		ctx.lineTo(plantX + 70, y);
		ctx.lineTo(plantX + 70, feedbackY);
		ctx.lineTo(sumX, feedbackY);
		ctx.lineTo(sumX, y + 14);
		ctx.strokeStyle = "#22c55e";
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// Feedback arrow at sum
		ctx.beginPath();
		ctx.moveTo(sumX, y + 14);
		ctx.lineTo(sumX - 4, y + 21);
		ctx.lineTo(sumX + 4, y + 21);
		ctx.closePath();
		ctx.fillStyle = "#22c55e";
		ctx.fill();

		// Minus sign for feedback (next to sum, on left side where feedback enters)
		ctx.fillStyle = "#22c55e";
		ctx.font = "bold 11px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("−", sumX - 20, y + 24);

		// Feedback label
		ctx.fillStyle = "#22c55e";
		ctx.font = "9px monospace";
		ctx.textAlign = "center";
		ctx.fillText("measured position", (plantX + 70 + sumX) / 2, feedbackY + 12);

		// Animated dots on feedback path (multiple dots)
		const seg1Len = 20;
		const seg2Len = feedbackY - y;
		const seg3Len = plantX + 70 - sumX;
		const seg4Len = feedbackY - (y + 14);
		const totalLen = seg1Len + seg2Len + seg3Len + seg4Len;

		// Draw 3 dots spaced evenly (slower)
		for (let i = 0; i < 3; i++) {
			const feedbackPhase = (time * 0.2 + i * 0.33) % 1;
			const dotPos = feedbackPhase * totalLen;
			let dotX: number, dotY: number;

			if (dotPos < seg1Len) {
				dotX = plantX + 50 + dotPos;
				dotY = y;
			} else if (dotPos < seg1Len + seg2Len) {
				dotX = plantX + 70;
				dotY = y + (dotPos - seg1Len);
			} else if (dotPos < seg1Len + seg2Len + seg3Len) {
				dotX = plantX + 70 - (dotPos - seg1Len - seg2Len);
				dotY = feedbackY;
			} else {
				dotX = sumX;
				dotY = feedbackY - (dotPos - seg1Len - seg2Len - seg3Len);
			}

			ctx.beginPath();
			ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
			ctx.fillStyle = "#22c55e";
			ctx.globalAlpha = 0.6;
			ctx.fill();
			ctx.globalAlpha = 1;
		}
	}, [time]);

	return (
		<div className="not-prose flex flex-col items-center gap-2 my-6">
			<canvas
				ref={canvasRef}
				width={WIDTH * DPR}
				height={HEIGHT * DPR}
				className="w-full max-w-[540px] rounded-xl"
				style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
			/>
			<p className="text-xs text-zinc-500 text-center max-w-md">
				The controller continuously compares setpoint vs measured position,
				calculates error, and outputs torque command
			</p>
		</div>
	);
}
