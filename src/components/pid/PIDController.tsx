import React, { useRef, useEffect, useState, useCallback } from "react";

interface MotorState {
	angle: number;
	angularVelocity: number;
	integral: number;
	prevError: number;
}

const MOMENT_OF_INERTIA = 0.12;
const FRICTION = 0.02;
const MAX_TORQUE = 2;
const DT = 1 / 60;
const DPR =
	typeof window !== "undefined"
		? Math.min(window.devicePixelRatio || 1, 2)
		: 2;
const CANVAS_WIDTH = 440;
const CANVAS_HEIGHT = 280;
const PLOT_WIDTH = 440;
const PLOT_HEIGHT = 280;
const DEFAULT_KP = 2.0;
const DEFAULT_KI = 0.3;
const DEFAULT_KD = 0.8;
const MIN_ANGLE = Math.PI / 4;
const MAX_ANGLE = (3 * Math.PI) / 4;

export default function PIDController() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const plotCanvasRef = useRef<HTMLCanvasElement>(null);
	const [state, setState] = useState<MotorState>({
		angle: Math.PI / 2,
		angularVelocity: 0,
		integral: 0,
		prevError: 0,
	});
	const [targetAngle, setTargetAngle] = useState<number>((3 * Math.PI) / 4);
	const [kp, setKp] = useState(DEFAULT_KP);
	const [ki, setKi] = useState(DEFAULT_KI);
	const [kd, setKd] = useState(DEFAULT_KD);
	const [mass, setMass] = useState(0.5);
	const [noiseEnabled, setNoiseEnabled] = useState(false);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [isDragging, setIsDragging] = useState(false);
	const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [isInCanvas, setIsInCanvas] = useState(false);
	const [pOutput, setPOutput] = useState(0);
	const [iOutput, setIOutput] = useState(0);
	const [dOutput, setDOutput] = useState(0);
	const historyRef = useRef<number[]>([]);
	const targetHistoryRef = useRef<number[]>([]);
	const animationRef = useRef<number>();

	const normalizeAngle = (angle: number) => {
		while (angle > Math.PI) angle -= Math.PI;
		while (angle < 0) angle += Math.PI;
		return angle;
	};

	const clampAngle = (angle: number) => {
		return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));
	};

	const simulate = useCallback(
		(
			currentState: MotorState,
			target: number,
			kpVal: number,
			kiVal: number,
			kdVal: number,
			massVal: number,
			noise: boolean,
		) => {
			const measuredAngle = noise
				? currentState.angle + (Math.random() - 0.5) * 0.05
				: currentState.angle;
			const error = target - measuredAngle;

			const newIntegral = Math.max(
				-10,
				Math.min(10, currentState.integral + error * DT),
			);
			const derivative = (error - currentState.prevError) / DT;

			const pTerm = kpVal * error;
			const iTerm = kiVal * newIntegral;
			const dTerm = kdVal * derivative;
			const torque = Math.max(
				-MAX_TORQUE,
				Math.min(MAX_TORQUE, pTerm + iTerm + dTerm),
			);

			setPOutput(pTerm);
			setIOutput(iTerm);
			setDOutput(dTerm);

			// Mass creates gravitational torque: pulls toward 90° (stable equilibrium)
			const gravityTorque = -massVal * Math.cos(currentState.angle);

			const angularAcceleration =
				(torque + gravityTorque - FRICTION * currentState.angularVelocity) /
				MOMENT_OF_INERTIA;
			const newVelocity = currentState.angularVelocity + angularAcceleration * DT;
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

			const distance = Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2);
			return distance < 25;
		},
		[targetAngle],
	);

	const drawMotor = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			angle: number,
			target: number,
			pOut: number,
			iOut: number,
			dOut: number,
			velocity: number,
			massVal: number,
			mousePosLocal: { x: number; y: number } | null,
			isInCanvasLocal: boolean,
			isDraggingLocal: boolean,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;
			const centerX = width / 2;
			const centerY = height - 35;
			const radius = Math.min(width, height * 1.5) * 0.4;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#0a0a0a";
			ctx.fillRect(0, 0, width, height);

			// Draw semicircle track (0° to 180°)
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius, 0, -Math.PI, true);
			ctx.strokeStyle = "#333";
			ctx.lineWidth = 2;
			ctx.stroke();

			// Draw target zone indicator (45° to 135°)
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius + 8, -MIN_ANGLE, -MAX_ANGLE, true);
			ctx.strokeStyle = "rgba(251, 146, 60, 0.2)";
			ctx.lineWidth = 4;
			ctx.stroke();

			// Draw mouse guide line when hovering
			if (isInCanvasLocal && !isDraggingLocal && mousePosLocal) {
				const targetX = centerX + Math.cos(-target) * (radius + 25);
				const targetY = centerY + Math.sin(-target) * (radius + 25);

				ctx.beginPath();
				ctx.moveTo(mousePosLocal.x, mousePosLocal.y);
				ctx.lineTo(targetX, targetY);
				ctx.strokeStyle = "rgba(251, 146, 60, 0.3)";
				ctx.lineWidth = 2;
				ctx.setLineDash([5, 5]);
				ctx.stroke();
				ctx.setLineDash([]);
			}

			// Draw velocity indicator (D term visualization)
			// Tangential arrow at pointer tip showing direction of motion
			const velArrowLength = Math.min(Math.abs(velocity) * 25, 35);
			if (Math.abs(velocity) > 0.01) {
				// Calculate pointer tip position
				const tipX = centerX + Math.cos(-angle) * radius;
				const tipY = centerY + Math.sin(-angle) * radius;
				
				// Tangent direction (perpendicular to radius, in direction of rotation)
				// Positive velocity = counterclockwise in our coordinate system
				const tangentAngle = -angle + (velocity > 0 ? -Math.PI / 2 : Math.PI / 2);
				const arrowEndX = tipX + Math.cos(tangentAngle) * velArrowLength;
				const arrowEndY = tipY + Math.sin(tangentAngle) * velArrowLength;
				
				// Draw arrowhead
				const headLength = 8;
				const headAngle = Math.atan2(arrowEndY - tipY, arrowEndX - tipX);
				
				// Draw arrow line (stop before arrowhead)
				const lineEndX = arrowEndX - headLength * 0.5 * Math.cos(headAngle);
				const lineEndY = arrowEndY - headLength * 0.5 * Math.sin(headAngle);
				ctx.beginPath();
				ctx.moveTo(tipX, tipY);
				ctx.lineTo(lineEndX, lineEndY);
				ctx.strokeStyle = "#a855f7";
				ctx.lineWidth = 3;
				ctx.lineCap = "round";
				ctx.stroke();
				
				// Draw arrowhead
				ctx.beginPath();
				ctx.moveTo(arrowEndX, arrowEndY);
				ctx.lineTo(
					arrowEndX - headLength * Math.cos(headAngle - Math.PI / 6),
					arrowEndY - headLength * Math.sin(headAngle - Math.PI / 6)
				);
				ctx.lineTo(
					arrowEndX - headLength * Math.cos(headAngle + Math.PI / 6),
					arrowEndY - headLength * Math.sin(headAngle + Math.PI / 6)
				);
				ctx.closePath();
				ctx.fillStyle = "#a855f7";
				ctx.fill();
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

			// Target handle (grows on hover)
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

			// Outer fin ring
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

			// Draw shaft (behind pointer)
			ctx.beginPath();
			ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
			ctx.fillStyle = "#52525b";
			ctx.fill();

			// Draw power indicator arc
			const power = Math.max(-1, Math.min(1, (pOut + iOut + dOut) / MAX_TORQUE));
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
						power > 0
							? endAngle + arrowAdjustment
							: endAngle - arrowAdjustment;
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

			// Draw pointer/arm with counterweight
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate(-angle);

			const counterweightLength = 24;

			// Arm (extends past center for counterweight)
			ctx.beginPath();
			ctx.moveTo(-counterweightLength + 5, 0);
			ctx.lineTo(radius, 0);
			ctx.strokeStyle = "#60a5fa";
			ctx.lineWidth = 6;
			ctx.lineCap = "round";
			ctx.stroke();

			// Pointer tip (small)
			ctx.beginPath();
			ctx.arc(radius, 0, 4, 0, Math.PI * 2);
			ctx.fillStyle = "#93c5fd";
			ctx.fill();

			// Counterweight (bulbous teardrop shape)
			ctx.beginPath();
			ctx.moveTo(-4, 0);
			ctx.quadraticCurveTo(-counterweightLength, -14, -counterweightLength, 0);
			ctx.quadraticCurveTo(-counterweightLength, 14, -4, 0);
			ctx.fillStyle = "#60a5fa";
			ctx.fill();

			// Center pivot point (black dot)
			ctx.beginPath();
			ctx.arc(0, 0, 3, 0, Math.PI * 2);
			ctx.fillStyle = "#000";
			ctx.fill();

			ctx.restore();

			// Draw mass hanging from pointer tip (if mass > 0)
			if (massVal > 0) {
				const massSize = 6 + massVal * 8; // Size scales with mass
				const ropeLength = 15 + massVal * 5;

				ctx.save();
				ctx.translate(centerX, centerY);

				// Draw rope (always hangs down due to gravity)
				const tipX = Math.cos(-angle) * radius;
				const tipY = Math.sin(-angle) * radius;

				ctx.beginPath();
				ctx.moveTo(tipX, tipY);
				ctx.lineTo(tipX, tipY + ropeLength);
				ctx.strokeStyle = "#71717a";
				ctx.lineWidth = 2;
				ctx.stroke();

				// Draw mass (circle with indicator)
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

				// Mass shine
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
		(ctx: CanvasRenderingContext2D, history: number[], targetHistory: number[]) => {
			const width = PLOT_WIDTH;
			const height = PLOT_HEIGHT;
			const padding = 46;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#0a0a0a";
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
			ctx.fillText("180°", padding - 8, padding + 6);
			ctx.fillText("90°", padding - 8, height / 2 + 6);
			ctx.fillText("0°", padding - 8, height - padding + 6);

			if (targetHistory.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#f97316";
				ctx.lineWidth = 2;
				ctx.setLineDash([5, 5]);
				for (let i = 0; i < targetHistory.length; i++) {
					const x =
						padding +
						((width - 2 * padding) * i) / (targetHistory.length - 1);
					const y =
						padding +
						(height - 2 * padding) * (1 - targetHistory[i] / Math.PI);
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
			ctx.font = "17px monospace";
			ctx.textAlign = "left";
			ctx.fillStyle = "#fb923c";
			ctx.fillText("Target", padding + 16, legendY);

			ctx.fillStyle = "#93c5fd";
			ctx.fillRect(padding + 90, legendY - 10, 10, 10);
			ctx.fillStyle = "#93c5fd";
			ctx.fillText("Pointer", padding + 106, legendY);
		},
		[],
	);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				setIsVisible(entry.isIntersecting);
			},
			{ threshold: 0.1 },
		);

		if (canvasRef.current) {
			observer.observe(canvasRef.current);
		}

		return () => {
			if (canvasRef.current) {
				observer.unobserve(canvasRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		if (!isVisible) return;

		let currentState = state;

		const loop = () => {
			if (isRunning) {
				currentState = simulate(
					currentState,
					targetAngle,
					kp,
					ki,
					kd,
					mass,
					noiseEnabled,
				);
				setState(currentState);

				historyRef.current.push(currentState.angle);
				targetHistoryRef.current.push(targetAngle);
				if (historyRef.current.length > 200) {
					historyRef.current.shift();
					targetHistoryRef.current.shift();
				}
			}

			drawMotor(
				ctx,
				currentState.angle,
				targetAngle,
				pOutput,
				iOutput,
				dOutput,
				currentState.angularVelocity,
				mass,
				mousePos,
				isInCanvas,
				isDragging,
			);

			if (plotCanvasRef.current) {
				const plotCtx = plotCanvasRef.current.getContext("2d");
				if (plotCtx) {
					drawPlot(plotCtx, historyRef.current, targetHistoryRef.current);
				}
			}

			animationRef.current = requestAnimationFrame(loop);
		};

		animationRef.current = requestAnimationFrame(loop);

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, [
		simulate,
		drawMotor,
		drawPlot,
		targetAngle,
		isRunning,
		isVisible,
		kp,
		ki,
		kd,
		mass,
		noiseEnabled,
		pOutput,
		iOutput,
		dOutput,
		mousePos,
		isInCanvas,
		isDragging,
	]);

	const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isNearTarget(e)) {
			setIsDragging(true);
		} else {
			const angle = getAngleFromMouse(e);
			if (angle !== null) {
				setTargetAngle(clampAngle(angle));
			}
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const scaleX = CANVAS_WIDTH / rect.width;
		const scaleY = CANVAS_HEIGHT / rect.height;
		const x = (e.clientX - rect.left) * scaleX;
		const y = (e.clientY - rect.top) * scaleY;
		setMousePos({ x, y });

		if (isDragging) {
			const angle = getAngleFromMouse(e);
			if (angle !== null) {
				setTargetAngle(clampAngle(angle));
			}
		}

		if (isNearTarget(e)) {
			canvas.style.cursor = "grab";
		} else {
			canvas.style.cursor = "crosshair";
		}
	};

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	const handleMouseLeave = () => {
		setIsDragging(false);
		setIsInCanvas(false);
		setMousePos(null);
	};

	const handleMouseEnter = () => {
		setIsInCanvas(true);
	};

	const handleReset = () => {
		setState({ angle: Math.PI / 2, angularVelocity: 0, integral: 0, prevError: 0 });
		historyRef.current = [];
		targetHistoryRef.current = [];
		setTargetAngle((3 * Math.PI) / 4);
		setKp(DEFAULT_KP);
		setKi(DEFAULT_KI);
		setKd(DEFAULT_KD);
		setMass(0.5);
		setNoiseEnabled(false);
	};

	const error = targetAngle - state.angle;

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-zinc-950 w-full rounded-3xl"
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
						onMouseUp={handleMouseUp}
						onMouseLeave={handleMouseLeave}
						onMouseEnter={handleMouseEnter}
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
				<div className="flex items-center gap-4">
					<label className="text-sm font-mono text-zinc-400 w-8">Ki</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-green-500 rounded-lg"
							style={{ width: `${(ki / 2) * 100}%` }}
						/>
						<input
							type="range"
							min="0"
							max="2"
							step="0.05"
							value={ki}
							onChange={(e) => setKi(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-green-500 rounded-full border-2 border-green-300 pointer-events-none"
							style={{ left: `calc(${(ki / 2) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-green-400 w-12 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{ki.toFixed(2)}
					</span>
				</div>
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
						className={`p-2.5 rounded-xl transition-all ${isRunning ? "bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-white" : "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 text-white"}`}
						title={isRunning ? "Pause" : "Play"}
					>
						{isRunning ? (
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
								<rect x="6" y="4" width="4" height="16" rx="1" />
								<rect x="14" y="4" width="4" height="16" rx="1" />
							</svg>
						) : (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
							</svg>
						)}
					</button>
					<button
						type="button"
						onClick={() => setNoiseEnabled(!noiseEnabled)}
						className={`p-2.5 rounded-xl transition-all ${noiseEnabled ? "bg-red-600 hover:bg-red-500 active:bg-red-400 text-white" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300"}`}
						title={noiseEnabled ? "Noise ON" : "Noise OFF"}
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
							<path d="M2 12h2l2-7 3 14 3-7 2 3h8" />
						</svg>
					</button>
				</div>
				<div className="flex gap-3 font-mono text-xs">
					<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
						<span className="text-zinc-500 text-[10px]">Error</span>
						<span
							className="text-red-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{(error * 180) / Math.PI < 0 ? "−" : ""}
							</span>
							{Math.abs((error * 180) / Math.PI).toFixed(1)}°
						</span>
					</div>
					<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
						<span className="text-zinc-500 text-[10px]">P</span>
						<span
							className="text-blue-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{pOutput < 0 ? "−" : ""}
							</span>
							{Math.abs(pOutput).toFixed(2)}
						</span>
					</div>
					<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
						<span className="text-zinc-500 text-[10px]">I</span>
						<span
							className="text-green-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{iOutput < 0 ? "−" : ""}
							</span>
							{Math.abs(iOutput).toFixed(2)}
						</span>
					</div>
					<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
						<span className="text-zinc-500 text-[10px]">D</span>
						<span
							className="text-purple-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{dOutput < 0 ? "−" : ""}
							</span>
							{Math.abs(dOutput).toFixed(2)}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
