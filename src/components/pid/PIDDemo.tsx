import React, { useRef, useEffect, useState, useCallback } from "react";

interface MotorState {
	angle: number;
	angularVelocity: number;
	integral: number;
	prevError: number;
}

interface PIDDemoProps {
	enableD?: boolean;
	enableI?: boolean;
	enableMass?: boolean;
	enableNoise?: boolean;
	showClampingToggle?: boolean;
	initialKp?: number;
	initialKd?: number;
	initialKi?: number;
	initialMass?: number;
}

const MOMENT_OF_INERTIA = 0.12;
const FRICTION = 0.08;
const MAX_TORQUE = 2;
const MAX_INTEGRAL = 2;
const DT = 1 / 60;
const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 440;
const CANVAS_HEIGHT = 280;
const PLOT_WIDTH = 440;
const PLOT_HEIGHT = 280;
const MIN_ANGLE = Math.PI / 4;
const MAX_ANGLE = (3 * Math.PI) / 4;

export default function PIDDemo({
	enableD = false,
	enableI = false,
	enableMass = false,
	enableNoise = false,
	showClampingToggle = false,
	initialKp = 2.0,
	initialKd = 0.8,
	initialKi = 0.3,
	initialMass = 0.5,
}: PIDDemoProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const plotCanvasRef = useRef<HTMLCanvasElement>(null);
	const [state, setState] = useState<MotorState>({
		angle: Math.PI / 2,
		angularVelocity: 0,
		integral: 0,
		prevError: 0,
	});
	const stateRef = useRef<MotorState>(state);
	const [targetAngle, setTargetAngle] = useState<number>((3 * Math.PI) / 4);
	const [kp, setKp] = useState(initialKp);
	const [kd, setKd] = useState(enableD ? initialKd : 0);
	const [ki, setKi] = useState(enableI ? initialKi : 0);
	const [mass, setMass] = useState(enableMass ? initialMass : 0);
	const [noiseEnabled, setNoiseEnabled] = useState(false);
	const [clampingEnabled, setClampingEnabled] = useState(false);
	const [holdEnabled, setHoldEnabled] = useState(false);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [isDragging, setIsDragging] = useState(false);
	const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [isInCanvas, setIsInCanvas] = useState(false);
	const [pOutput, setPOutput] = useState(0);
	const [dOutput, setDOutput] = useState(0);
	const [iOutput, setIOutput] = useState(0);
	const historyRef = useRef<number[]>([]);
	const targetHistoryRef = useRef<number[]>([]);
	const animationRef = useRef<number>();

	const clampAngle = (angle: number) =>
		Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));

	const simulate = useCallback(
		(
			currentState: MotorState,
			target: number,
			kpVal: number,
			kdVal: number,
			kiVal: number,
			massVal: number,
			noise: boolean,
			clamp: boolean,
			hold: boolean,
		) => {
			const measuredAngle = noise
				? currentState.angle + (Math.random() - 0.5) * 0.05
				: currentState.angle;
			const error = target - measuredAngle;
			const derivative = (error - currentState.prevError) / DT;

			// Integral with optional anti-windup clamping (3x faster accumulation for responsiveness)
			const rawIntegral = currentState.integral + error * DT * 3;
			const newIntegral = clamp
				? Math.max(-MAX_INTEGRAL, Math.min(MAX_INTEGRAL, rawIntegral))
				: rawIntegral;

			const pTerm = kpVal * error;
			const dTerm = kdVal * derivative;
			const iTerm = kiVal * newIntegral;
			const torque = Math.max(
				-MAX_TORQUE,
				Math.min(MAX_TORQUE, pTerm + dTerm + iTerm),
			);

			setPOutput(pTerm);
			setDOutput(dTerm);
			setIOutput(iTerm);

			// If hold is enabled, freeze the physical state but keep accumulating integral
			if (hold) {
				return {
					angle: currentState.angle,
					angularVelocity: 0,
					integral: newIntegral,
					prevError: error,
				};
			}

			// Mass creates gravitational torque
			const gravityTorque = -massVal * Math.cos(currentState.angle);

			const angularAcceleration =
				(torque + gravityTorque - FRICTION * currentState.angularVelocity) /
				MOMENT_OF_INERTIA;
			const newVelocity =
				currentState.angularVelocity + angularAcceleration * DT;
			const newAngle = currentState.angle + newVelocity * DT;

			return {
				angle: newAngle,
				angularVelocity: newVelocity,
				integral: newIntegral,
				prevError: error,
			};
		},
		[],
	);

	const getAngleFromMouse = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement> | MouseEvent) => {
			const canvas = canvasRef.current;
			if (!canvas) return null;
			const rect = canvas.getBoundingClientRect();
			const scaleX = CANVAS_WIDTH / rect.width;
			const scaleY = CANVAS_HEIGHT / rect.height;
			const x = (e.clientX - rect.left) * scaleX - CANVAS_WIDTH / 2;
			const y = (e.clientY - rect.top) * scaleY - (CANVAS_HEIGHT - 35);
			return -Math.atan2(y, x);
		},
		[],
	);

	const isNearTarget = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			if (!canvas) return false;
			const rect = canvas.getBoundingClientRect();
			const scaleX = CANVAS_WIDTH / rect.width;
			const scaleY = CANVAS_HEIGHT / rect.height;
			const x = (e.clientX - rect.left) * scaleX;
			const y = (e.clientY - rect.top) * scaleY;
			const centerX = CANVAS_WIDTH / 2;
			const centerY = CANVAS_HEIGHT - 35;
			const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT * 1.5) * 0.4;
			const targetX = centerX + Math.cos(-targetAngle) * (radius + 25);
			const targetY = centerY + Math.sin(-targetAngle) * (radius + 25);
			return Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2) < 25;
		},
		[targetAngle],
	);

	const drawMotor = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			angle: number,
			target: number,
			pOut: number,
			dOut: number,
			iOut: number,
			velocity: number,
			massVal: number,
			mousePosLocal: { x: number; y: number } | null,
			isInCanvasLocal: boolean,
			isDraggingLocal: boolean,
			showD: boolean,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const centerX = width / 2;
			const centerY = height - 35;
			const radius = Math.min(width, height * 1.5) * 0.4;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			// Draw semicircle track
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius, 0, -Math.PI, true);
			ctx.strokeStyle = "#333";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Draw target zone indicator
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius + 8, -MIN_ANGLE, -MAX_ANGLE, true);
			ctx.strokeStyle = "rgba(251, 146, 60, 0.2)";
			ctx.lineWidth = 4;
			ctx.stroke();

			// Draw preview indicator on arc showing where clicking would set target
			if (isInCanvasLocal && !isDraggingLocal && mousePosLocal) {
				// Calculate angle from mouse position
				const mx = mousePosLocal.x - centerX;
				const my = mousePosLocal.y - centerY;
				let previewAngle = -Math.atan2(my, mx);
				// Clamp to valid range
				previewAngle = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, previewAngle));

				// Draw small indicator on the arc
				const indicatorX = centerX + Math.cos(-previewAngle) * (radius + 8);
				const indicatorY = centerY + Math.sin(-previewAngle) * (radius + 8);

				// Small tick mark perpendicular to arc
				const tickLength = 12;
				const tickAngle = -previewAngle;
				ctx.beginPath();
				ctx.moveTo(
					indicatorX - (Math.cos(tickAngle) * tickLength) / 2,
					indicatorY - (Math.sin(tickAngle) * tickLength) / 2,
				);
				ctx.lineTo(
					indicatorX + (Math.cos(tickAngle) * tickLength) / 2,
					indicatorY + (Math.sin(tickAngle) * tickLength) / 2,
				);
				ctx.strokeStyle = "rgba(251, 146, 60, 0.6)";
				ctx.lineWidth = 3;
				ctx.lineCap = "round";
				ctx.stroke();
			}

			// Draw D term arrow (shows D term output value and direction) - only if D is enabled
			if (showD) {
				// Scale arrow length by D term output (dOut), not just velocity
				const dArrowLength = Math.min(Math.abs(dOut) * 20, 35);
				if (Math.abs(dOut) > 0.02) {
					const tipX = centerX + Math.cos(-angle) * radius;
					const tipY = centerY + Math.sin(-angle) * radius;
					// D term opposes motion, arrow direction based on sign of dOut
					const tangentAngle = -angle + (dOut < 0 ? Math.PI / 2 : -Math.PI / 2);
					const arrowEndX = tipX + Math.cos(tangentAngle) * dArrowLength;
					const arrowEndY = tipY + Math.sin(tangentAngle) * dArrowLength;
					const headLength = 8;
					const headAngle = Math.atan2(arrowEndY - tipY, arrowEndX - tipX);
					const lineEndX = arrowEndX - headLength * 0.5 * Math.cos(headAngle);
					const lineEndY = arrowEndY - headLength * 0.5 * Math.sin(headAngle);

					ctx.beginPath();
					ctx.moveTo(tipX, tipY);
					ctx.lineTo(lineEndX, lineEndY);
					ctx.strokeStyle = "#a855f7";
					ctx.lineWidth = 3;
					ctx.lineCap = "round";
					ctx.stroke();

					ctx.beginPath();
					ctx.moveTo(arrowEndX, arrowEndY);
					ctx.lineTo(
						arrowEndX - headLength * Math.cos(headAngle - Math.PI / 6),
						arrowEndY - headLength * Math.sin(headAngle - Math.PI / 6),
					);
					ctx.lineTo(
						arrowEndX - headLength * Math.cos(headAngle + Math.PI / 6),
						arrowEndY - headLength * Math.sin(headAngle + Math.PI / 6),
					);
					ctx.closePath();
					ctx.fillStyle = "#a855f7";
					ctx.fill();
				}
			}

			// Draw error arc
			const errorVal = target - angle;
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius - 15, -angle, -target, errorVal > 0);
			ctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
			ctx.lineWidth = 20;
			ctx.lineCap = "butt";
			ctx.stroke();

			// Draw target indicator
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate(-target);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(radius + 25, 0);
			ctx.strokeStyle = "#f97316";
			ctx.lineWidth = 3;
			ctx.setLineDash([8, 8]);
			ctx.stroke();
			ctx.setLineDash([]);
			const handleSize = isInCanvasLocal ? 10 : 8;
			ctx.beginPath();
			ctx.arc(radius + 25, 0, handleSize, 0, Math.PI * 2);
			ctx.fillStyle = "#f97316";
			ctx.fill();
			ctx.strokeStyle = "#fdba74";
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.restore();

			// Draw motor body with fins
			const motorRadius = 25;
			const finCount = 12;
			const finLength = 2;
			ctx.save();
			ctx.translate(centerX, centerY);
			for (let i = 0; i < finCount; i++) {
				const finAngle = (i / finCount) * Math.PI * 2;
				ctx.beginPath();
				ctx.moveTo(
					Math.cos(finAngle) * (motorRadius - 2),
					Math.sin(finAngle) * (motorRadius - 2),
				);
				ctx.lineTo(
					Math.cos(finAngle) * (motorRadius + finLength),
					Math.sin(finAngle) * (motorRadius + finLength),
				);
				ctx.strokeStyle = "#3f3f46";
				ctx.lineWidth = 4;
				ctx.lineCap = "round";
				ctx.stroke();
			}
			ctx.restore();

			// Motor body
			ctx.beginPath();
			ctx.arc(centerX, centerY, motorRadius, 0, Math.PI * 2);
			const motorGradient = ctx.createRadialGradient(
				centerX,
				centerY,
				0,
				centerX,
				centerY,
				motorRadius,
			);
			motorGradient.addColorStop(0, "#52525b");
			motorGradient.addColorStop(0.7, "#3f3f46");
			motorGradient.addColorStop(1, "#27272a");
			ctx.fillStyle = motorGradient;
			ctx.fill();
			ctx.strokeStyle = "#52525b";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Shaft
			ctx.beginPath();
			ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
			ctx.fillStyle = "#52525b";
			ctx.fill();

			// Power indicator arc
			const power = Math.max(
				-1,
				Math.min(1, (pOut + dOut + iOut) / MAX_TORQUE),
			);
			if (Math.abs(power) > 0.05) {
				const arrowRadius = 24;
				const maxArcLength = Math.PI * 0.8;
				const arcLength = Math.abs(power) * maxArcLength;
				const arrowLength = 7;
				const arrowWidth = 4;
				ctx.save();
				ctx.translate(centerX, centerY);
				const startAngle = -Math.PI / 2;
				const endAngle = startAngle + (power > 0 ? -arcLength : arcLength);
				ctx.beginPath();
				ctx.arc(0, 0, arrowRadius, startAngle, endAngle, power > 0);
				ctx.strokeStyle = power > 0 ? "#22c55e" : "#ef4444";
				ctx.lineWidth = 3;
				ctx.lineCap = "round";
				ctx.stroke();
				if (arcLength > 0.2) {
					const arrowAdjustment = Math.min(
						arrowLength / arrowRadius,
						arcLength * 0.8,
					);
					const arrowAngle =
						power > 0 ? endAngle + arrowAdjustment : endAngle - arrowAdjustment;
					const arrowTipX = Math.cos(endAngle) * 23.3;
					const arrowTipY = Math.sin(endAngle) * 23.3;
					const perpAngle = endAngle + (power > 0 ? -Math.PI / 2 : Math.PI / 2);
					const baseX = Math.cos(arrowAngle) * arrowRadius;
					const baseY = Math.sin(arrowAngle) * arrowRadius;
					ctx.beginPath();
					ctx.moveTo(arrowTipX, arrowTipY);
					ctx.lineTo(
						baseX + Math.cos(perpAngle) * arrowWidth,
						baseY + Math.sin(perpAngle) * arrowWidth,
					);
					ctx.lineTo(
						baseX - Math.cos(perpAngle) * arrowWidth,
						baseY - Math.sin(perpAngle) * arrowWidth,
					);
					ctx.closePath();
					ctx.fillStyle = power > 0 ? "#22c55e" : "#ef4444";
					ctx.fill();
				}
				ctx.restore();
			}

			// Pointer with counterweight
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate(-angle);
			const counterweightLength = 24;
			ctx.beginPath();
			ctx.moveTo(-counterweightLength + 5, 0);
			ctx.lineTo(radius, 0);
			ctx.strokeStyle = "#60a5fa";
			ctx.lineWidth = 6;
			ctx.lineCap = "round";
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(radius, 0, 4, 0, Math.PI * 2);
			ctx.fillStyle = "#93c5fd";
			ctx.fill();
			ctx.beginPath();
			ctx.moveTo(-4, 0);
			ctx.quadraticCurveTo(-counterweightLength, -14, -counterweightLength, 0);
			ctx.quadraticCurveTo(-counterweightLength, 14, -4, 0);
			ctx.fillStyle = "#60a5fa";
			ctx.fill();
			ctx.beginPath();
			ctx.arc(0, 0, 3, 0, Math.PI * 2);
			ctx.fillStyle = "#000";
			ctx.fill();
			ctx.restore();

			// Mass hanging from pointer
			if (massVal > 0) {
				const massSize = 6 + massVal * 8;
				const ropeLength = 15 + massVal * 5;
				ctx.save();
				ctx.translate(centerX, centerY);
				const tipX = Math.cos(-angle) * radius;
				const tipY = Math.sin(-angle) * radius;
				ctx.beginPath();
				ctx.moveTo(tipX, tipY);
				ctx.lineTo(tipX, tipY + ropeLength);
				ctx.strokeStyle = "#71717a";
				ctx.lineWidth = 2;
				ctx.stroke();
				const massX = tipX;
				const massY = tipY + ropeLength + massSize;
				ctx.beginPath();
				ctx.arc(massX, massY, massSize, 0, Math.PI * 2);
				const massGradient = ctx.createRadialGradient(
					massX - massSize * 0.3,
					massY - massSize * 0.3,
					0,
					massX,
					massY,
					massSize,
				);
				massGradient.addColorStop(0, "#a1a1aa");
				massGradient.addColorStop(1, "#52525b");
				ctx.fillStyle = massGradient;
				ctx.fill();
				ctx.strokeStyle = "#71717a";
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(
					massX - massSize * 0.3,
					massY - massSize * 0.3,
					massSize * 0.25,
					0,
					Math.PI * 2,
				);
				ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
				ctx.fill();
				ctx.restore();
			}
		},
		[],
	);

	const drawPlot = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			history: number[],
			targetHistory: number[],
		) => {
			const width = PLOT_WIDTH;
			const height = PLOT_HEIGHT;
			const padding = 52;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);

			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 1;
			for (let i = 0; i <= 4; i++) {
				const y = padding + ((height - 2 * padding) * i) / 4;
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - padding, y);
				ctx.stroke();
			}

			ctx.fillStyle = "#64748b";
			ctx.font = "18px monospace";
			ctx.textAlign = "right";
			ctx.fillText("180°", padding - 8, padding + 8);
			ctx.fillText("90°", padding - 8, height / 2 + 6);
			ctx.fillText("0°", padding - 8, height - padding + 6);

			if (targetHistory.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#f97316";
				ctx.lineWidth = 2;
				ctx.setLineDash([5, 5]);
				for (let i = 0; i < targetHistory.length; i++) {
					const x =
						padding + ((width - 2 * padding) * i) / (targetHistory.length - 1);
					const y =
						padding + (height - 2 * padding) * (1 - targetHistory[i] / Math.PI);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
				ctx.setLineDash([]);
			}

			if (history.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#3b82f6";
				ctx.lineWidth = 2;
				for (let i = 0; i < history.length; i++) {
					const x =
						padding + ((width - 2 * padding) * i) / (history.length - 1);
					const y =
						padding + (height - 2 * padding) * (1 - history[i] / Math.PI);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			}

			ctx.fillStyle = "#94a3b8";
			ctx.font = "19px monospace";
			ctx.textAlign = "left";
			ctx.fillText("Position over time", padding, 22);

			const legendY = height - 12;
			ctx.fillStyle = "#fb923c";
			ctx.fillRect(padding, legendY - 10, 10, 10);
			ctx.font = "italic 17px 'Times New Roman', Georgia, serif";
			ctx.fillStyle = "#fb923c";
			ctx.fillText("Target", padding + 16, legendY);
			ctx.fillStyle = "#93c5fd";
			ctx.fillRect(padding + 100, legendY - 10, 10, 10);
			ctx.fillStyle = "#93c5fd";
			ctx.fillText("Pointer", padding + 116, legendY);
		},
		[],
	);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => setIsVisible(entry.isIntersecting),
			{ threshold: 0.1 },
		);
		if (canvasRef.current) observer.observe(canvasRef.current);
		return () => {
			if (canvasRef.current) observer.unobserve(canvasRef.current);
		};
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx || !isVisible) return;

		const loop = () => {
			if (isRunning) {
				const effectiveKd = enableD ? kd : 0;
				const effectiveKi = enableI ? ki : 0;
				const effectiveMass = enableMass ? mass : 0;
				const newState = simulate(
					stateRef.current,
					targetAngle,
					kp,
					effectiveKd,
					effectiveKi,
					effectiveMass,
					noiseEnabled && enableNoise,
					clampingEnabled,
					holdEnabled,
				);
				stateRef.current = newState;
				setState(newState);
				historyRef.current.push(newState.angle);
				targetHistoryRef.current.push(targetAngle);
				if (historyRef.current.length > 200) {
					historyRef.current.shift();
					targetHistoryRef.current.shift();
				}
			}
			drawMotor(
				ctx,
				stateRef.current.angle,
				targetAngle,
				pOutput,
				dOutput,
				iOutput,
				stateRef.current.angularVelocity,
				enableMass ? mass : 0,
				mousePos,
				isInCanvas,
				isDragging,
				enableD,
			);
			if (plotCanvasRef.current) {
				const plotCtx = plotCanvasRef.current.getContext("2d");
				if (plotCtx)
					drawPlot(plotCtx, historyRef.current, targetHistoryRef.current);
			}
			animationRef.current = requestAnimationFrame(loop);
		};
		animationRef.current = requestAnimationFrame(loop);
		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [
		simulate,
		drawMotor,
		drawPlot,
		targetAngle,
		isRunning,
		isVisible,
		kp,
		kd,
		ki,
		mass,
		noiseEnabled,
		clampingEnabled,
		holdEnabled,
		pOutput,
		dOutput,
		iOutput,
		mousePos,
		isInCanvas,
		isDragging,
		enableD,
		enableI,
		enableMass,
		enableNoise,
	]);

	const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isNearTarget(e)) setIsDragging(true);
		else {
			const angle = getAngleFromMouse(e);
			if (angle !== null) setTargetAngle(clampAngle(angle));
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const scaleX = CANVAS_WIDTH / rect.width;
		const scaleY = CANVAS_HEIGHT / rect.height;
		setMousePos({
			x: (e.clientX - rect.left) * scaleX,
			y: (e.clientY - rect.top) * scaleY,
		});
		if (isDragging) {
			const angle = getAngleFromMouse(e);
			if (angle !== null) setTargetAngle(clampAngle(angle));
		}
		canvas.style.cursor = isNearTarget(e) ? "grab" : "crosshair";
	};

	const handleReset = () => {
		const initialState = {
			angle: Math.PI / 2,
			angularVelocity: 0,
			integral: 0,
			prevError: 0,
		};
		stateRef.current = initialState;
		setState(initialState);
		historyRef.current = [];
		targetHistoryRef.current = [];
		setTargetAngle((3 * Math.PI) / 4);
		setKp(initialKp);
		setKd(enableD ? initialKd : 0);
		setKi(enableI ? initialKi : 0);
		setMass(enableMass ? initialMass : 0);
		setNoiseEnabled(false);
		setClampingEnabled(false);
		setHoldEnabled(false);
	};

	const error = targetAngle - state.angle;

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl"
		>
			<div className="flex flex-col md:flex-row gap-4 items-start w-full">
				<div className="flex-1 flex flex-col items-center min-w-0 pb-4">
					<span
						className={`text-xs font-mono mb-2 transition-colors ${isInCanvas ? "text-orange-400" : "text-zinc-500"}`}
					>
						Click or drag to set target
					</span>
					<canvas
						ref={canvasRef}
						width={CANVAS_WIDTH * DPR}
						height={CANVAS_HEIGHT * DPR}
						onMouseDown={handleMouseDown}
						onMouseMove={handleMouseMove}
						onMouseUp={() => setIsDragging(false)}
						onMouseLeave={() => {
							setIsDragging(false);
							setIsInCanvas(false);
							setMousePos(null);
						}}
						onMouseEnter={() => setIsInCanvas(true)}
						className="outline-none border-0 block w-full max-w-[440px]"
						style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
					/>
				</div>
				<div className="flex-1 flex flex-col items-center min-w-0">
					<canvas
						ref={plotCanvasRef}
						width={PLOT_WIDTH * DPR}
						height={PLOT_HEIGHT * DPR}
						className="outline-none border-0 block w-full max-w-[440px]"
						style={{ aspectRatio: `${PLOT_WIDTH} / ${PLOT_HEIGHT}` }}
					/>
				</div>
			</div>

			<div className="flex flex-col gap-3 px-2 pb-2">
				{/* Kp slider - always shown */}
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-8">Kp</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${((kp - 0.1) / 4.9) * 100}%` }}
						/>
						<input
							type="range"
							min="0.1"
							max="5"
							step="0.1"
							value={kp}
							onChange={(e) => setKp(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${((kp - 0.1) / 4.9) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-blue-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{kp.toFixed(1)}
					</span>
				</div>

				{/* Kd slider - only if D enabled */}
				{enableD && (
					<div className="flex items-center gap-4">
						<label className="text-sm font-mono text-zinc-400 w-8">Kd</label>
						<div className="flex-1 relative h-2">
							<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
							<div
								className="absolute left-0 top-0 h-full bg-purple-500 rounded-lg"
								style={{ width: `${(kd / 2) * 100}%` }}
							/>
							<input
								type="range"
								min="0"
								max="2"
								step="0.05"
								value={kd}
								onChange={(e) => setKd(parseFloat(e.target.value))}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							/>
							<div
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-full border-2 border-purple-300 pointer-events-none"
								style={{ left: `calc(${(kd / 2) * 100}% - 8px)` }}
							/>
						</div>
						<span
							className="text-sm font-mono text-purple-400 w-12 text-right"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{kd.toFixed(2)}
						</span>
					</div>
				)}

				{/* Ki slider - only if I enabled */}
				{enableI && (
					<div className="flex items-center gap-4">
						<label className="text-sm font-mono text-zinc-400 w-8">Ki</label>
						<div className="flex-1 relative h-2">
							<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
							<div
								className="absolute left-0 top-0 h-full bg-green-500 rounded-lg"
								style={{ width: `${(ki / 1) * 100}%` }}
							/>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={ki}
								onChange={(e) => setKi(parseFloat(e.target.value))}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							/>
							<div
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-green-500 rounded-full border-2 border-green-300 pointer-events-none"
								style={{ left: `calc(${(ki / 1) * 100}% - 8px)` }}
							/>
						</div>
						<span
							className="text-sm font-mono text-green-400 w-12 text-right"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{ki.toFixed(2)}
						</span>
					</div>
				)}

				{/* Mass slider - only if mass enabled */}
				{enableMass && (
					<div className="flex items-center gap-4">
						<label className="text-sm font-mono text-zinc-400 w-8">Mass</label>
						<div className="flex-1 relative h-2">
							<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
							<div
								className="absolute left-0 top-0 h-full bg-zinc-500 rounded-lg"
								style={{ width: `${mass * 100}%` }}
							/>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={mass}
								onChange={(e) => setMass(parseFloat(e.target.value))}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							/>
							<div
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-500 rounded-full border-2 border-zinc-300 pointer-events-none"
								style={{ left: `calc(${mass * 100}% - 8px)` }}
							/>
						</div>
						<span
							className="text-sm font-mono text-zinc-400 w-12 text-right"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{mass.toFixed(2)}
						</span>
					</div>
				)}
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
					{enableNoise && (
						<button
							type="button"
							onClick={() => setNoiseEnabled(!noiseEnabled)}
							className={`p-2.5 rounded-xl transition-all ${noiseEnabled ? "bg-red-600/20 hover:bg-red-600/30" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700"}`}
							title={noiseEnabled ? "Noise ON" : "Noise OFF"}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#f87171"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M2 12h2l2-7 3 14 3-7 2 3h8" />
							</svg>
						</button>
					)}
					{showClampingToggle && (
						<>
							<button
								type="button"
								onClick={() => setClampingEnabled(!clampingEnabled)}
								className={`p-2.5 rounded-xl transition-all ${clampingEnabled ? "bg-green-600/20 hover:bg-green-600/30" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700"}`}
								title={
									clampingEnabled
										? "Clamping ON - integral is limited"
										: "Clamping OFF - integral can grow unbounded"
								}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="#4ade80"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									{clampingEnabled ? (
										<>
											{/* Brackets with line bounded inside */}
											<path d="M8 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3" />
											<path d="M16 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
											<path d="M9 12h6" />
										</>
									) : (
										<>
											{/* Brackets with line extending beyond */}
											<path d="M8 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3" />
											<path d="M16 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
											<path d="M2 12h20" />
										</>
									)}
								</svg>
							</button>
							<button
								type="button"
								onClick={() => setHoldEnabled(!holdEnabled)}
								className={`p-2.5 rounded-xl transition-all ${holdEnabled ? "bg-orange-600/20 hover:bg-orange-600/30" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700"}`}
								title={
									holdEnabled
										? "HOLD - pointer locked, integral accumulating!"
										: "Hold pointer to demonstrate windup"
								}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="#fb923c"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									{holdEnabled ? (
										<>
											<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
											<path d="M7 11V7a5 5 0 0 1 10 0v4" />
										</>
									) : (
										<>
											<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
											<path d="M7 11V7a5 5 0 0 1 9.9-1" />
										</>
									)}
								</svg>
							</button>
						</>
					)}
				</div>
				<div className="flex gap-3 font-mono text-xs flex-nowrap">
					<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px] whitespace-nowrap">
							Error
						</span>
						<span
							className="text-red-400 whitespace-nowrap"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{(error * 180) / Math.PI < 0 ? "−" : ""}
							</span>
							{Math.abs((error * 180) / Math.PI).toFixed(1)}°
						</span>
					</div>
					<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px] whitespace-nowrap">
							P
						</span>
						<span
							className="text-blue-400 whitespace-nowrap"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{pOutput < 0 ? "−" : ""}
							</span>
							{Math.abs(pOutput).toFixed(2)}
						</span>
					</div>
					{enableD && (
						<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
							<span className="text-zinc-500 text-[10px] whitespace-nowrap">
								D
							</span>
							<span
								className="text-purple-400 whitespace-nowrap"
								style={{ fontVariantNumeric: "tabular-nums" }}
							>
								<span className="inline-block w-[0.6em] text-right">
									{dOutput < 0 ? "−" : ""}
								</span>
								{Math.abs(dOutput).toFixed(2)}
							</span>
						</div>
					)}
					{enableI && (
						<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
							<span className="text-zinc-500 text-[10px] whitespace-nowrap">
								I
							</span>
							<span
								className="text-green-400 whitespace-nowrap"
								style={{ fontVariantNumeric: "tabular-nums" }}
							>
								<span className="inline-block w-[0.6em] text-right">
									{iOutput < 0 ? "−" : ""}
								</span>
								{Math.abs(iOutput).toFixed(2)}
							</span>
						</div>
					)}
					<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center min-w-[70px]">
						<span className="text-zinc-500 text-[10px] whitespace-nowrap">
							Output
						</span>
						<span
							className="text-pink-400 whitespace-nowrap"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{pOutput + dOutput + iOutput < 0 ? "−" : ""}
							</span>
							{Math.abs(pOutput + dOutput + iOutput).toFixed(2)}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
