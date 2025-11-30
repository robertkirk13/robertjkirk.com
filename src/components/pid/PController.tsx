import React, { useRef, useEffect, useState, useCallback } from "react";

interface MotorState {
	angle: number;
	angularVelocity: number;
}

interface PControllerProps {
	initialKp?: number;
	showMass?: boolean;
	initialMass?: number;
}

const MOMENT_OF_INERTIA = 0.12;
const FRICTION = 0.02;
const MAX_TORQUE = 2;
const DT = 1 / 60;
const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 440;
const CANVAS_HEIGHT = 280;
const PLOT_WIDTH = 440;
const PLOT_HEIGHT = 280;
const MIN_ANGLE = Math.PI / 4; // 45 degrees
const MAX_ANGLE = (3 * Math.PI) / 4; // 135 degrees

export default function PController({
	initialKp = 1.5,
	showMass = false,
	initialMass = 0.5,
}: PControllerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const plotCanvasRef = useRef<HTMLCanvasElement>(null);
	const [state, setState] = useState<MotorState>({
		angle: Math.PI / 2,
		angularVelocity: 0,
	});
	const [targetAngle, setTargetAngle] = useState<number>((3 * Math.PI) / 4);
	const [kp, setKp] = useState(initialKp);
	const [mass, setMass] = useState(showMass ? initialMass : 0);
	const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
	const [pOutput, setPOutput] = useState(0);
	const [motorPower, setMotorPower] = useState(0);
	const [isDragging, setIsDragging] = useState(false);
	const [isHoveringTarget, setIsHoveringTarget] = useState(false);
	const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [isInCanvas, setIsInCanvas] = useState(false);
	const historyRef = useRef<number[]>([]);
	const targetHistoryRef = useRef<number[]>([]);
	const animationRef = useRef<number>();

	const clampAngle = (angle: number) => {
		return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));
	};

	const simulate = useCallback(
		(
			currentState: MotorState,
			target: number,
			kpVal: number,
			massVal: number,
		) => {
			const error = target - currentState.angle;

			const pTerm = kpVal * error;
			const torque = Math.max(-MAX_TORQUE, Math.min(MAX_TORQUE, pTerm));

			setPOutput(pTerm);
			setMotorPower(torque / MAX_TORQUE);

			// Mass creates gravitational torque: pulls toward 90° (stable equilibrium)
			// At 90° (vertical), cos = 0, no torque (balanced)
			// Torque = -mass * cos(angle)
			const gravityTorque = -massVal * Math.cos(currentState.angle);

			const angularAcceleration =
				(torque + gravityTorque - FRICTION * currentState.angularVelocity) /
				MOMENT_OF_INERTIA;
			let newVelocity = currentState.angularVelocity + angularAcceleration * DT;
			let newAngle = currentState.angle + newVelocity * DT;

			// Bounce off boundaries at 0° and 180°
			if (newAngle < 0) {
				newAngle = 0;
				newVelocity = -newVelocity * 0.5;
			}
			if (newAngle > Math.PI) {
				newAngle = Math.PI;
				newVelocity = -newVelocity * 0.5;
			}

			return {
				angle: newAngle,
				angularVelocity: newVelocity,
			};
		},
		[],
	);

	const drawMotor = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			angle: number,
			target: number,
			power: number,
			hoveringTarget: boolean,
			predictedSettling: number | null,
			massVal: number,
			mousePosParam: { x: number; y: number } | null,
			inCanvas: boolean,
		) => {
			const width = ctx.canvas.width / DPR;
			const height = ctx.canvas.height / DPR;
			const centerX = width / 2;
			const centerY = height - 35;
			const radius = Math.min(width, height * 1.5) * 0.4;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#09090b";
			ctx.fillRect(0, 0, width, height);

			// Draw full semicircle track (0° to 180°)
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius, -Math.PI, 0);
			ctx.strokeStyle = "#27272a";
			ctx.lineWidth = 3;
			ctx.lineCap = "round";
			ctx.stroke();

			// Draw predicted settling point indicator (where the pointer will actually end up)
			if (predictedSettling !== null) {
				const settlingAngle = Math.max(0, Math.min(Math.PI, predictedSettling));

				// Draw arc from target to predicted settling point showing the SSE
				const sseSize = Math.abs(target - settlingAngle);
				if (sseSize > 0.02) {
					ctx.beginPath();
					const startAngle = -Math.min(settlingAngle, target);
					const endAngle = -Math.max(settlingAngle, target);
					ctx.arc(centerX, centerY, radius - 6, startAngle, endAngle, true);
					ctx.strokeStyle = "rgba(239, 68, 68, 0.35)";
					ctx.lineWidth = 8;
					ctx.lineCap = "round";
					ctx.stroke();
				}

				// Draw settling point marker (simple tick mark, not interactive-looking)
				ctx.save();
				ctx.translate(centerX, centerY);
				ctx.rotate(-settlingAngle);

				// Draw tick mark at the settling point
				ctx.beginPath();
				ctx.moveTo(radius - 12, 0);
				ctx.lineTo(radius + 12, 0);
				ctx.strokeStyle = "#ef4444";
				ctx.lineWidth = 3;
				ctx.lineCap = "round";
				ctx.stroke();

				// Draw small perpendicular tick at the end
				ctx.beginPath();
				ctx.moveTo(radius + 12, -6);
				ctx.lineTo(radius + 12, 6);
				ctx.stroke();

				ctx.restore();
			}

			// Draw target zone indicator (45° to 135°)
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius + 8, -MAX_ANGLE, -MIN_ANGLE);
			ctx.strokeStyle = "rgba(249, 115, 22, 0.3)";
			ctx.lineWidth = 6;
			ctx.stroke();

			// Draw error arc (from current position to target)
			const errorVal = target - angle;
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius - 15, -angle, -target, errorVal > 0);
			ctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
			ctx.lineWidth = 20;
			ctx.lineCap = "butt";
			ctx.stroke();

			// Draw end markers for full range
			ctx.beginPath();
			ctx.arc(centerX + radius, centerY, 4, 0, Math.PI * 2);
			ctx.fillStyle = "#3f3f46";
			ctx.fill();

			ctx.beginPath();
			ctx.arc(centerX - radius, centerY, 4, 0, Math.PI * 2);
			ctx.fillStyle = "#3f3f46";
			ctx.fill();

			// Draw target indicator (orange - draggable)
			ctx.save();
			ctx.translate(centerX, centerY);
			ctx.rotate(-target);

			ctx.beginPath();
			ctx.moveTo(radius * 0.3, 0);
			ctx.lineTo(radius + 25, 0);
			ctx.strokeStyle = hoveringTarget ? "#fb923c" : "#f97316";
			ctx.lineWidth = 3;
			ctx.setLineDash([8, 8]);
			ctx.stroke();
			ctx.setLineDash([]);

			ctx.beginPath();
			ctx.arc(radius + 25, 0, hoveringTarget ? 14 : 12, 0, Math.PI * 2);
			ctx.fillStyle = hoveringTarget ? "#fb923c" : "#f97316";
			ctx.fill();
			ctx.strokeStyle = "#fdba74";
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.fillStyle = "#fff";
			ctx.beginPath();
			ctx.arc(radius + 25, 0, 3, 0, Math.PI * 2);
			ctx.fill();

			ctx.restore();

			// Draw mouse guide line (when mouse is in canvas)
			if (inCanvas && mousePosParam && !hoveringTarget) {
				const targetHandleX = centerX + Math.cos(-target) * (radius + 25);
				const targetHandleY = centerY + Math.sin(-target) * (radius + 25);

				ctx.beginPath();
				ctx.moveTo(mousePosParam.x, mousePosParam.y);
				ctx.lineTo(targetHandleX, targetHandleY);
				ctx.strokeStyle = "rgba(249, 115, 22, 0.25)";
				ctx.lineWidth = 2;
				ctx.setLineDash([4, 4]);
				ctx.stroke();
				ctx.setLineDash([]);

				// Draw small circle at mouse position
				ctx.beginPath();
				ctx.arc(mousePosParam.x, mousePosParam.y, 4, 0, Math.PI * 2);
				ctx.fillStyle = "rgba(249, 115, 22, 0.4)";
				ctx.fill();
			}

			// Draw motor body with fins
			const motorRadius = 28;
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
			ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
			ctx.fillStyle = "#52525b";
			ctx.fill();

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

			// Draw mass hanging from pointer tip (if mass > 0)
			if (massVal > 0) {
				const massSize = 6 + massVal * 8; // Size scales with mass
				const ropeLength = 15 + massVal * 5;

				// Rope always hangs straight down (against canvas rotation)
				ctx.rotate(angle); // Counter-rotate to make rope hang down

				// Draw rope
				ctx.beginPath();
				ctx.moveTo(radius * Math.cos(-angle), radius * Math.sin(-angle));
				ctx.lineTo(
					radius * Math.cos(-angle),
					radius * Math.sin(-angle) + ropeLength,
				);
				ctx.strokeStyle = "#a1a1aa";
				ctx.lineWidth = 2;
				ctx.stroke();

				// Draw mass (circle with indicator)
				const massX = radius * Math.cos(-angle);
				const massY = radius * Math.sin(-angle) + ropeLength + massSize;
				ctx.beginPath();
				ctx.arc(massX, massY, massSize, 0, Math.PI * 2);
				ctx.fillStyle = "#71717a";
				ctx.fill();
				ctx.strokeStyle = "#52525b";
				ctx.lineWidth = 2;
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
				ctx.fillStyle = "#a1a1aa";
				ctx.fill();
			}

			ctx.restore();

			// Draw power indicator inside motor
			if (Math.abs(power) > 0.1) {
				const arrowRadius = 24;
				const arrowHeadRadius = 23.3; // Slightly closer to center for arrowhead
				const arcLength = Math.abs(power) * Math.PI * 0.8;
				const arrowColor = power > 0 ? "#4ade80" : "#f87171";
				const direction = Math.sign(power);

				ctx.save();
				ctx.translate(centerX, centerY);

				const startAngle = -Math.PI / 2;
				const endAngle = startAngle - direction * arcLength;

				const arrowLength = 7;
				const arrowWidth = 4;

				// Clamp the arrow adjustment to not exceed the arc length
				const arrowAdjustment = Math.min(
					arrowLength / arrowRadius,
					arcLength * 0.8,
				);
				const arcEndAngle = endAngle + direction * arrowAdjustment;

				ctx.beginPath();
				ctx.arc(0, 0, arrowRadius, startAngle, arcEndAngle, direction > 0);
				ctx.strokeStyle = arrowColor;
				ctx.lineWidth = 3;
				ctx.lineCap = "round";
				ctx.stroke();

				// Only draw arrowhead if arc is large enough
				if (arcLength > 0.2) {
					const tangentAngle = endAngle - (direction * Math.PI) / 2;
					const tipX = Math.cos(endAngle) * arrowHeadRadius;
					const tipY = Math.sin(endAngle) * arrowHeadRadius;
					const backX = tipX - Math.cos(tangentAngle) * arrowLength;
					const backY = tipY - Math.sin(tangentAngle) * arrowLength;
					const perpAngle = tangentAngle + Math.PI / 2;

					ctx.beginPath();
					ctx.moveTo(tipX, tipY);
					ctx.lineTo(
						backX + Math.cos(perpAngle) * arrowWidth,
						backY + Math.sin(perpAngle) * arrowWidth,
					);
					ctx.lineTo(
						backX - Math.cos(perpAngle) * arrowWidth,
						backY - Math.sin(perpAngle) * arrowWidth,
					);
					ctx.closePath();
					ctx.fillStyle = arrowColor;
					ctx.fill();
				}

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
			const width = ctx.canvas.width / DPR;
			const height = ctx.canvas.height / DPR;
			const padding = 46;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#09090b";
			ctx.fillRect(0, 0, width, height);

			const plotTop = padding + 10;
			const plotBottom = height - padding - 10;
			const plotHeight = plotBottom - plotTop;

			// Draw grid
			ctx.strokeStyle = "#1a1a1e";
			ctx.lineWidth = 1;
			for (let i = 1; i < 4; i++) {
				const y = plotTop + (plotHeight * i) / 4;
				ctx.beginPath();
				ctx.moveTo(padding, y);
				ctx.lineTo(width - 15, y);
				ctx.stroke();
			}

			// Draw target line
			if (targetHistory.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#f97316";
				ctx.lineWidth = 2;
				ctx.setLineDash([4, 4]);
				for (let i = 0; i < targetHistory.length; i++) {
					const x =
						padding + ((width - padding - 15) * i) / (targetHistory.length - 1);
					const y = plotTop + plotHeight * (1 - targetHistory[i] / Math.PI);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
				ctx.setLineDash([]);
			}

			// Draw angle history
			if (history.length > 1) {
				ctx.beginPath();
				ctx.strokeStyle = "#60a5fa";
				ctx.lineWidth = 2;
				for (let i = 0; i < history.length; i++) {
					const x =
						padding + ((width - padding - 15) * i) / (history.length - 1);
					const y = plotTop + plotHeight * (1 - history[i] / Math.PI);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			}

			// Y-axis labels (0° to 180°)
			ctx.fillStyle = "#71717a";
			ctx.font = "500 18px system-ui, sans-serif";
			ctx.textAlign = "right";
			ctx.fillText("180°", Math.round(padding - 10), Math.round(plotTop + 7));
			ctx.fillText(
				"90°",
				Math.round(padding - 10),
				Math.round(plotTop + plotHeight / 2 + 6),
			);
			ctx.fillText("0°", Math.round(padding - 10), Math.round(plotBottom + 6));

			// Title
			ctx.fillStyle = "#a1a1aa";
			ctx.font = "600 19px system-ui, sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("Position over time", Math.round(padding), 26);

			// Legend (matching MotorDemo style)
			ctx.font = '600 italic 17px "Times New Roman", Georgia, serif';
			ctx.fillStyle = "#f97316";
			ctx.fillRect(Math.round(width - 155), 18, 10, 10);
			ctx.fillStyle = "#fb923c";
			ctx.fillText("Target", Math.round(width - 141), 28);
			ctx.fillStyle = "#60a5fa";
			ctx.fillRect(Math.round(width - 72), 18, 10, 10);
			ctx.fillStyle = "#93c5fd";
			ctx.fillText("Pointer", Math.round(width - 58), 28);
		},
		[],
	);

	const getAngleFromMouse = (
		e: React.MouseEvent<HTMLCanvasElement> | MouseEvent,
	) => {
		const canvas = canvasRef.current;
		if (!canvas) return null;

		const rect = canvas.getBoundingClientRect();
		const scaleX = CANVAS_WIDTH / rect.width;
		const scaleY = CANVAS_HEIGHT / rect.height;
		const x = (e.clientX - rect.left) * scaleX - CANVAS_WIDTH / 2;
		const y = (e.clientY - rect.top) * scaleY - (CANVAS_HEIGHT - 35);
		let angle = -Math.atan2(y, x);
		return clampAngle(angle);
	};

	const isNearTarget = (
		e: React.MouseEvent<HTMLCanvasElement> | MouseEvent,
	) => {
		const canvas = canvasRef.current;
		if (!canvas) return false;

		const rect = canvas.getBoundingClientRect();
		const scaleX = CANVAS_WIDTH / rect.width;
		const scaleY = CANVAS_HEIGHT / rect.height;
		const x = (e.clientX - rect.left) * scaleX - CANVAS_WIDTH / 2;
		const y = (e.clientY - rect.top) * scaleY - (CANVAS_HEIGHT - 35);

		const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT * 1.5) * 0.4;
		const targetX = Math.cos(-targetAngle) * (radius + 25);
		const targetY = Math.sin(-targetAngle) * (radius + 25);

		const avgScale = (scaleX + scaleY) / 2;
		const dist = Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2);
		return dist < 20 * avgScale;
	};

	// Intersection Observer
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				setIsVisible(entry.isIntersecting);
			},
			{ threshold: 0.1 },
		);
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		if (!isVisible) return;

		let currentState = state;

		const loop = () => {
			if (isRunning && !isDragging) {
				currentState = simulate(currentState, targetAngle, kp, mass);
				setState(currentState);

				historyRef.current.push(currentState.angle);
				targetHistoryRef.current.push(targetAngle);
				if (historyRef.current.length > 200) {
					historyRef.current.shift();
					targetHistoryRef.current.shift();
				}
			}

			// Calculate predicted settling point for mass using iterative solver
			// At equilibrium: Kp * (target - settling) = mass * cos(settling)
			// Rearranged: settling = target - mass * cos(settling) / Kp
			let predictedSettling: number | null = null;
			if (showMass && mass > 0.01) {
				let settling = targetAngle;
				// Iterate to find equilibrium point
				for (let i = 0; i < 15; i++) {
					settling = targetAngle - (mass * Math.cos(settling)) / kp;
				}
				// Clamp to valid range
				predictedSettling = Math.max(0, Math.min(Math.PI, settling));
			}

			drawMotor(
				ctx,
				currentState.angle,
				targetAngle,
				motorPower,
				isHoveringTarget || isDragging,
				predictedSettling,
				mass,
				mousePos,
				isInCanvas,
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
		motorPower,
		isDragging,
		isHoveringTarget,
		showMass,
		mass,
		mousePos,
		isInCanvas,
	]);

	const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const scaleX = CANVAS_WIDTH / rect.width;
		const scaleY = CANVAS_HEIGHT / rect.height;
		return {
			x: (e.clientX - rect.left) * scaleX,
			y: (e.clientY - rect.top) * scaleY,
		};
	};

	const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isNearTarget(e)) {
			setIsDragging(true);
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		setMousePos(getMousePos(e));
		setIsHoveringTarget(isNearTarget(e));
		if (isDragging) {
			const angle = getAngleFromMouse(e);
			if (angle !== null) setTargetAngle(angle);
		}
	};

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	const handleMouseLeave = () => {
		setIsDragging(false);
		setIsHoveringTarget(false);
		setIsInCanvas(false);
		setMousePos(null);
	};

	const handleMouseEnter = () => {
		setIsInCanvas(true);
	};

	const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		// Click to set target (if not dragging the handle)
		if (!isDragging && !isNearTarget(e)) {
			const angle = getAngleFromMouse(e);
			if (angle !== null) setTargetAngle(angle);
		}
	};

	const handleReset = () => {
		setState({ angle: Math.PI / 2, angularVelocity: 0 });
		historyRef.current = [];
		targetHistoryRef.current = [];
		setTargetAngle((3 * Math.PI) / 4);
		setKp(initialKp);
		setMass(showMass ? initialMass : 0);
	};

	// Calculate predicted steady state error using same iterative solver
	const predictedSSE = (() => {
		if (!showMass || mass <= 0.01) return 0;
		let settling = targetAngle;
		for (let i = 0; i < 15; i++) {
			settling = targetAngle - (mass * Math.cos(settling)) / kp;
		}
		settling = Math.max(0, Math.min(Math.PI, settling));
		return (Math.abs(targetAngle - settling) * 180) / Math.PI;
	})();

	return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-zinc-950 w-full rounded-3xl"
		>
			<div className="flex flex-col md:flex-row gap-4 items-start w-full">
				<div className="flex-1 flex flex-col items-center min-w-0 pb-4">
					<div
						className={`text-xs mb-2 transition-colors ${isInCanvas ? "text-orange-400" : "text-zinc-500"}`}
					>
						Click or drag to set target
					</div>
					<canvas
						ref={canvasRef}
						width={CANVAS_WIDTH * DPR}
						height={CANVAS_HEIGHT * DPR}
						onMouseDown={handleMouseDown}
						onMouseMove={handleMouseMove}
						onMouseUp={handleMouseUp}
						onMouseLeave={handleMouseLeave}
						onMouseEnter={handleMouseEnter}
						onClick={handleClick}
						className={`outline-none border-0 block w-full max-w-[440px] ${isHoveringTarget || isDragging ? "cursor-grab" : "cursor-crosshair"} ${isDragging ? "cursor-grabbing" : ""}`}
						style={{
							touchAction: "none",
							aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
						}}
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

			<div className="flex flex-col gap-3 px-4 pb-2">
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

				{showMass && (
					<div className="flex items-center gap-4">
						<label className="text-sm font-mono text-zinc-400 w-12">Mass</label>
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
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-400 rounded-full border-2 border-zinc-300 pointer-events-none"
								style={{
									left: `calc(${mass * 100}% - 8px)`,
								}}
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
				</div>
				<div className="flex gap-3 font-mono text-xs">
					<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
						<span className="text-zinc-500 text-[10px]">Error</span>
						<span
							className="text-red-400"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{((targetAngle - state.angle) * 180) / Math.PI < 0 ? "−" : ""}
							</span>
							{Math.abs(((targetAngle - state.angle) * 180) / Math.PI).toFixed(
								1,
							)}
							°
						</span>
					</div>
					<div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
						<span className="text-zinc-500 text-[10px]">P Term</span>
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
					{showMass && (
						<div
							className={`px-3 py-1.5 rounded-xl flex flex-col items-center w-[70px] ${predictedSSE > 5 ? "bg-red-900/50" : "bg-zinc-900"}`}
						>
							<span className="text-zinc-500 text-[10px]">SSE</span>
							<span
								className={predictedSSE > 5 ? "text-red-400" : "text-green-400"}
								style={{ fontVariantNumeric: "tabular-nums" }}
							>
								{predictedSSE.toFixed(1)}°
							</span>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
