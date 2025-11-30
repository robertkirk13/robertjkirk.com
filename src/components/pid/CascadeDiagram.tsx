import React, { useEffect, useState, useRef } from "react";

const DPR =
	typeof window !== "undefined"
		? Math.min(window.devicePixelRatio || 1, 2)
		: 2;
const WIDTH = 820;
const HEIGHT = 210;

export default function CascadeDiagram() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const animationRef = useRef<number>();

	useEffect(() => {
		const loop = () => {
			setTime((t) => t + 0.012);
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

		// Layout
		const boxW = 90;
		const boxH = 44;
		const y = HEIGHT / 2 + 5;
		
		// Positions - now with three sum junctions
		const posSumX = 75;       // Sum for position error
		const posLoopX = 175;     // Position PD
		const angleSumX = 295;    // Sum for angle biasing
		const angleLoopX = 530;   // Angle PD
		const plantX = 700;       // Plant

		// Draw a single flow dot
		const drawFlowDot = (
			x1: number,
			y1: number,
			x2: number,
			y2: number,
			color: string,
			phase: number,
		) => {
			const t = ((time * 0.8 + phase) % 1);
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
			ctx.lineTo(x2 - 6 * Math.cos(angle - 0.4), y2 - 6 * Math.sin(angle - 0.4));
			ctx.lineTo(x2 - 6 * Math.cos(angle + 0.4), y2 - 6 * Math.sin(angle + 0.4));
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

		// Draw box
		const drawBox = (
			x: number,
			label1: string,
			label2: string,
			color: string,
		) => {
			ctx.fillStyle = "#1e293b";
			ctx.beginPath();
			ctx.roundRect(x - boxW / 2, y - boxH / 2, boxW, boxH, 8);
			ctx.fill();
			ctx.strokeStyle = color;
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.fillStyle = color;
			ctx.font = "bold 10px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText(label1, x, y - 4);
			ctx.fillStyle = "#64748b";
			ctx.font = "8px monospace";
			ctx.fillText(label2, x, y + 10);
		};

		// Draw sum circle with custom symbol
		const drawSum = (x: number, yPos: number, color: string, symbol: string) => {
			ctx.beginPath();
			ctx.arc(x, yPos, 11, 0, Math.PI * 2);
			ctx.fillStyle = "#1e293b";
			ctx.fill();
			ctx.strokeStyle = color;
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.fillStyle = color;
			ctx.font = "bold 11px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText(symbol, x, yPos + 4);
		};

		// === POSITION SUM ===
		// Target x input from above
		const targetY = y - 48;
		ctx.fillStyle = "#f97316";
		ctx.font = "bold 9px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("Target x", posSumX, targetY - 8);
		ctx.beginPath();
		ctx.arc(posSumX, targetY + 4, 3, 0, Math.PI * 2);
		ctx.fill();

		// Target → Position Sum
		drawArrowLine(posSumX, targetY + 7, posSumX, y - 11, "#f97316");
		drawFlowDot(posSumX, targetY + 7, posSumX, y - 11, "#f97316", 0);

		// Position sum junction
		drawSum(posSumX, y, "#ef4444", "Σ");

		// Minus label for feedback
		ctx.fillStyle = "#10b981";
		ctx.font = "bold 9px sans-serif";
		ctx.fillText("−", posSumX - 16, y + 4);

		// Position Sum → Position Loop
		drawArrowLine(posSumX + 11, y, posLoopX - boxW / 2, y, "#ef4444", "error x", y - 10);
		drawFlowDot(posSumX + 11, y, posLoopX - boxW / 2, y, "#ef4444", 0.15);

		// Position Loop Box
		drawBox(posLoopX, "Position PD", "Kp_x · Kd_x", "#10b981");

		// Position Loop → Angle Sum (bias)
		drawArrowLine(posLoopX + boxW / 2, y, angleSumX - 11, y, "#10b981", "bias", y - 10);
		drawFlowDot(posLoopX + boxW / 2, y, angleSumX - 11, y, "#10b981", 0.3);

		// === ANGLE BIAS SUM ===
		// Nominal 0° from above
		const nominalY = y - 48;
		ctx.fillStyle = "#94a3b8";
		ctx.font = "bold 9px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("θ = 0°", angleSumX, nominalY - 2);
		
		// Nominal → Angle Bias Sum
		drawArrowLine(angleSumX, nominalY + 6, angleSumX, y - 11, "#94a3b8");
		drawFlowDot(angleSumX, nominalY + 6, angleSumX, y - 11, "#94a3b8", 0.2);

		// Angle bias sum junction
		drawSum(angleSumX, y, "#fbbf24", "+");

		// Angle Bias Sum → Angle Error Sum
		const angleErrSumX = 415;
		drawArrowLine(angleSumX + 11, y, angleErrSumX - 11, y, "#fbbf24", "target θ", y - 10);
		drawFlowDot(angleSumX + 11, y, angleErrSumX - 11, y, "#fbbf24", 0.4);

		// === ANGLE ERROR SUM ===
		drawSum(angleErrSumX, y, "#ef4444", "Σ");

		// Minus label for angle feedback
		ctx.fillStyle = "#3b82f6";
		ctx.font = "bold 9px sans-serif";
		ctx.fillText("−", angleErrSumX - 16, y + 4);

		// Angle Error Sum → Angle Loop
		drawArrowLine(angleErrSumX + 11, y, angleLoopX - boxW / 2, y, "#ef4444", "error θ", y - 10);
		drawFlowDot(angleErrSumX + 11, y, angleLoopX - boxW / 2, y, "#ef4444", 0.5);

		// Angle Loop Box
		drawBox(angleLoopX, "Angle PD", "Kp_θ · Kd_θ", "#3b82f6");

		// Angle Loop → Plant
		drawArrowLine(angleLoopX + boxW / 2, y, plantX - boxW / 2, y, "#3b82f6", "force", y - 10);
		drawFlowDot(angleLoopX + boxW / 2, y, plantX - boxW / 2, y, "#3b82f6", 0.6);

		// Plant Box
		drawBox(plantX, "Plant", "cart + pendulum", "#a855f7");

		// === FEEDBACK LINES ===

		// Cart position feedback (outer, lower)
		const posFeedbackY = y + 60;
		ctx.beginPath();
		ctx.moveTo(plantX, y + boxH / 2);
		ctx.lineTo(plantX, posFeedbackY);
		ctx.lineTo(posSumX, posFeedbackY);
		ctx.lineTo(posSumX, y + 11);
		ctx.strokeStyle = "#10b981";
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// Position feedback arrow
		ctx.beginPath();
		ctx.moveTo(posSumX, y + 11);
		ctx.lineTo(posSumX - 4, y + 18);
		ctx.lineTo(posSumX + 4, y + 18);
		ctx.closePath();
		ctx.fillStyle = "#10b981";
		ctx.fill();

		// Animated dot on position feedback
		const posFeedbackPhase = (time * 0.8) % 1;
		const posSegDownLen = posFeedbackY - (y + boxH / 2);
		const posSegHorizLen = plantX - posSumX;
		const posSegUpLen = posFeedbackY - (y + 11);
		const posTotalLen = posSegDownLen + posSegHorizLen + posSegUpLen;
		const posDotPos = posFeedbackPhase * posTotalLen;

		let posDotX: number, posDotY: number;
		if (posDotPos < posSegDownLen) {
			posDotX = plantX;
			posDotY = y + boxH / 2 + posDotPos;
		} else if (posDotPos < posSegDownLen + posSegHorizLen) {
			posDotX = plantX - (posDotPos - posSegDownLen);
			posDotY = posFeedbackY;
		} else {
			posDotX = posSumX;
			posDotY = posFeedbackY - (posDotPos - posSegDownLen - posSegHorizLen);
		}
		ctx.beginPath();
		ctx.arc(posDotX, posDotY, 2.5, 0, Math.PI * 2);
		ctx.fillStyle = "#10b981";
		ctx.globalAlpha = 0.7;
		ctx.fill();
		ctx.globalAlpha = 1;

		// Position feedback label
		ctx.fillStyle = "#10b981";
		ctx.font = "9px monospace";
		ctx.textAlign = "center";
		ctx.fillText("measured x", (plantX + posSumX) / 2, posFeedbackY + 12);

		// Angle feedback (inner, higher) - goes to angle error sum
		const angleFeedbackY = y + 38;
		ctx.beginPath();
		ctx.moveTo(plantX - 15, y + boxH / 2);
		ctx.lineTo(plantX - 15, angleFeedbackY);
		ctx.lineTo(angleErrSumX, angleFeedbackY);
		ctx.lineTo(angleErrSumX, y + 11);
		ctx.strokeStyle = "#3b82f6";
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// Angle feedback arrow
		ctx.beginPath();
		ctx.moveTo(angleErrSumX, y + 11);
		ctx.lineTo(angleErrSumX - 4, y + 18);
		ctx.lineTo(angleErrSumX + 4, y + 18);
		ctx.closePath();
		ctx.fillStyle = "#3b82f6";
		ctx.fill();

		// Animated dot on angle feedback
		const angleFeedbackPhase = (time * 0.8 + 0.5) % 1;
		const angleSegDownLen = angleFeedbackY - (y + boxH / 2);
		const angleSegHorizLen = (plantX - 15) - angleErrSumX;
		const angleSegUpLen = angleFeedbackY - (y + 11);
		const angleTotalLen = angleSegDownLen + angleSegHorizLen + angleSegUpLen;
		const angleDotPos = angleFeedbackPhase * angleTotalLen;

		let angleDotX: number, angleDotY: number;
		if (angleDotPos < angleSegDownLen) {
			angleDotX = plantX - 15;
			angleDotY = y + boxH / 2 + angleDotPos;
		} else if (angleDotPos < angleSegDownLen + angleSegHorizLen) {
			angleDotX = plantX - 15 - (angleDotPos - angleSegDownLen);
			angleDotY = angleFeedbackY;
		} else {
			angleDotX = angleErrSumX;
			angleDotY = angleFeedbackY - (angleDotPos - angleSegDownLen - angleSegHorizLen);
		}
		ctx.beginPath();
		ctx.arc(angleDotX, angleDotY, 2.5, 0, Math.PI * 2);
		ctx.fillStyle = "#3b82f6";
		ctx.globalAlpha = 0.7;
		ctx.fill();
		ctx.globalAlpha = 1;

		// Angle feedback label
		ctx.fillStyle = "#3b82f6";
		ctx.font = "9px monospace";
		ctx.textAlign = "center";
		ctx.fillText("measured θ", (plantX - 15 + angleErrSumX) / 2, angleFeedbackY + 12);

	}, [time]);

	return (
		<div className="not-prose flex flex-col items-center gap-2 my-6">
			<canvas
				ref={canvasRef}
				width={WIDTH * DPR}
				height={HEIGHT * DPR}
				className="w-full max-w-[820px] rounded-xl"
				style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
			/>
			<p className="text-xs text-zinc-500 text-center max-w-xl">
				Both loops use <span className="text-red-400">Σ</span> to compute error. The position loop's <span className="text-emerald-400">bias</span> shifts the <span className="text-zinc-400">nominal 0°</span> to create a <span className="text-amber-400">target θ</span>.
			</p>
		</div>
	);
}
