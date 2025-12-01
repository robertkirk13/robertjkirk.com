import React, { useEffect, useState, useRef } from "react";

const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const WIDTH = 580;
const HEIGHT = 200;

export default function ComplementaryFilterDiagram() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const animationRef = useRef<number>();

	useEffect(() => {
		const loop = () => {
			setTime((t) => t + 0.015);
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
		const boxH = 40;

		// Positions
		const gyroX = 80;
		const hpfX = 200;
		const accelX = 80;
		const lpfX = 200;
		const sumX = 360;
		const outputX = 480;

		const gyroY = centerY - 45;
		const accelY = centerY + 45;

		// Draw animated dots on a path
		const drawFlowDot = (
			x1: number,
			y1: number,
			x2: number,
			y2: number,
			color: string,
			phase: number,
		) => {
			const t = (time * 0.6 + phase) % 1;
			const x = x1 + (x2 - x1) * t;
			const y = y1 + (y2 - y1) * t;
			ctx.beginPath();
			ctx.arc(x, y, 3, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.globalAlpha = 0.8;
			ctx.fill();
			ctx.globalAlpha = 1;
		};

		// Draw arrow line
		const drawArrowLine = (
			x1: number,
			y1: number,
			x2: number,
			y2: number,
			color: string,
		) => {
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.strokeStyle = color;
			ctx.lineWidth = 2;
			ctx.stroke();

			const angle = Math.atan2(y2 - y1, x2 - x1);
			ctx.beginPath();
			ctx.moveTo(x2, y2);
			ctx.lineTo(
				x2 - 8 * Math.cos(angle - 0.4),
				y2 - 8 * Math.sin(angle - 0.4),
			);
			ctx.lineTo(
				x2 - 8 * Math.cos(angle + 0.4),
				y2 - 8 * Math.sin(angle + 0.4),
			);
			ctx.closePath();
			ctx.fillStyle = color;
			ctx.fill();
		};

		// Draw sensor box
		const drawSensorBox = (
			x: number,
			y: number,
			label: string,
			color: string,
		) => {
			const w = 100;
			const h = boxH;
			ctx.fillStyle = "#1e293b";
			ctx.beginPath();
			ctx.roundRect(x - w / 2, y - h / 2, w, h, 6);
			ctx.fill();
			ctx.strokeStyle = color;
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.fillStyle = color;
			ctx.font = "bold 12px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText(label, x, y + 4);
		};

		// Draw filter box
		const drawFilterBox = (
			x: number,
			y: number,
			label: string,
			sublabel: string,
			color: string,
		) => {
			const w = 90;
			const h = boxH;
			ctx.fillStyle = "#1e293b";
			ctx.beginPath();
			ctx.roundRect(x - w / 2, y - h / 2, w, h, 6);
			ctx.fill();
			ctx.strokeStyle = color;
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.fillStyle = color;
			ctx.font = "bold 11px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText(label, x, y - 2);
			ctx.font = "9px monospace";
			ctx.fillStyle = "#64748b";
			ctx.fillText(sublabel, x, y + 12);
		};

		// Draw sum circle
		const drawSum = (x: number, y: number) => {
			ctx.beginPath();
			ctx.arc(x, y, 18, 0, Math.PI * 2);
			ctx.fillStyle = "#1e293b";
			ctx.fill();
			ctx.strokeStyle = "#e879f9";
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.fillStyle = "#e879f9";
			ctx.font = "bold 18px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("+", x, y + 6);
		};

		// Gyroscope path
		drawSensorBox(gyroX, gyroY, "Gyroscope", "#a855f7");
		drawArrowLine(gyroX + 50, gyroY, hpfX - 45, gyroY, "#a855f7");
		drawFlowDot(gyroX + 50, gyroY, hpfX - 45, gyroY, "#a855f7", 0);

		drawFilterBox(hpfX, gyroY, "High-Pass", "α × (prev + Δ)", "#a855f7");
		drawArrowLine(hpfX + 45, gyroY, sumX - 18, centerY - 12, "#a855f7");
		drawFlowDot(hpfX + 45, gyroY, sumX - 18, centerY - 12, "#a855f7", 0.5);

		// Accelerometer path
		drawSensorBox(accelX, accelY, "Accelerometer", "#3b82f6");
		drawArrowLine(accelX + 50, accelY, lpfX - 45, accelY, "#3b82f6");
		drawFlowDot(accelX + 50, accelY, lpfX - 45, accelY, "#3b82f6", 0.2);

		drawFilterBox(lpfX, accelY, "Low-Pass", "(1−α) × meas", "#3b82f6");
		drawArrowLine(lpfX + 45, accelY, sumX - 18, centerY + 12, "#3b82f6");
		drawFlowDot(lpfX + 45, accelY, sumX - 18, centerY + 12, "#3b82f6", 0.7);

		// Sum
		drawSum(sumX, centerY);

		// Output
		drawArrowLine(sumX + 18, centerY, outputX - 50, centerY, "#e879f9");
		drawFlowDot(sumX + 18, centerY, outputX - 50, centerY, "#e879f9", 0.3);

		ctx.fillStyle = "#1e293b";
		ctx.beginPath();
		ctx.roundRect(outputX - 50, centerY - boxH / 2, 100, boxH, 6);
		ctx.fill();
		ctx.strokeStyle = "#e879f9";
		ctx.lineWidth = 2;
		ctx.stroke();

		ctx.fillStyle = "#e879f9";
		ctx.font = "bold 12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("Fused Angle", outputX, centerY + 4);

		// Labels for filter characteristics
		ctx.fillStyle = "#64748b";
		ctx.font = "10px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("(fast changes)", hpfX, gyroY + 32);
		ctx.fillText("(slow average)", lpfX, accelY + 32);
	}, [time]);

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
				The gyroscope provides fast response through a high-pass filter, while
				the accelerometer corrects drift through a low-pass filter. Together
				they complement each other.
			</p>
		</div>
	);
}

