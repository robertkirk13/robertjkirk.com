import React, { useRef, useEffect, useState, useCallback } from "react";

interface PendulumState {
  cartX: number;
  cartVelocity: number;
	angle: number;
  angularVelocity: number;
}

const CART_MASS = 1.0;
const PENDULUM_MASS = 0.1;
const PENDULUM_LENGTH = 0.3;
const GRAVITY = 9.8;
const DT = 1 / 60;
const TRACK_WIDTH = 3.5;
const MAX_FORCE = 15;
const FRICTION = 0.01;
const DPR =
	typeof window !== "undefined"
		? Math.min(window.devicePixelRatio || 1, 2)
		: 2;
const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 280;

// Angle control defaults
const DEFAULT_KP_ANGLE = 50;
const DEFAULT_KD_ANGLE = 8;

// Position control defaults
const DEFAULT_KP_POS = 2;
const DEFAULT_KD_POS = 4;

// Target position range (how far from center the setpoint can be)
const TARGET_X_RANGE = 0.6;

const SCALE = 100;

interface Props {
	showPositionControl?: boolean;
}

export default function InvertedPendulum({ showPositionControl = true }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<PendulumState>({
    cartX: 0,
    cartVelocity: 0,
		angle: 0.05,
    angularVelocity: 0,
	});
	const stateRef = useRef<PendulumState>(state);
	
	// Angle PD gains
	const [kpAngle, setKpAngle] = useState(DEFAULT_KP_ANGLE);
	const [kdAngle, setKdAngle] = useState(DEFAULT_KD_ANGLE);
	
	// Position PD gains (only used if showPositionControl is true)
	const [kpPos, setKpPos] = useState(showPositionControl ? DEFAULT_KP_POS : 0);
	const [kdPos, setKdPos] = useState(showPositionControl ? DEFAULT_KD_POS : 0);
	
	// Target position for position control
	const [targetX, setTargetX] = useState(0);
	
  const [isRunning, setIsRunning] = useState(true);
	const [isVisible, setIsVisible] = useState(true);
  const [hasFallen, setHasFallen] = useState(false);
	const [failReason, setFailReason] = useState<string>("");
  const [controlEnabled, setControlEnabled] = useState(true);
	const [force, setForce] = useState(0);
	const [isHoveringCart, setIsHoveringCart] = useState(false);
	const [isHoveringTarget, setIsHoveringTarget] = useState(false);
	const [isDraggingTarget, setIsDraggingTarget] = useState(false);
  const animationRef = useRef<number>();

	const simulate = useCallback(
		(
			currentState: PendulumState,
			kpA: number,
			kdA: number,
			kpP: number,
			kdP: number,
			control: boolean,
			target: number,
		): PendulumState => {
			const { cartX, cartVelocity, angle, angularVelocity } = currentState;

			// Dual PD control
			let controlForce = 0;
    if (control) {
				// Angle control: keep pendulum upright (angle = 0)
				const angleForce = kpA * angle + kdA * angularVelocity;
				
				// Position control: keep cart at target position
				const posError = cartX - target;
				const posForce = kpP * posError + kdP * cartVelocity;
				
				// Combined control (angle is primary, position is secondary)
				controlForce = angleForce + posForce;
				controlForce = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, controlForce));
			}
			setForce(controlForce);

			// Physics simulation
			const sinA = Math.sin(angle);
			const cosA = Math.cos(angle);
			const ml = PENDULUM_MASS * PENDULUM_LENGTH;
    const totalMass = CART_MASS + PENDULUM_MASS;

			const temp =
				(controlForce +
					ml * angularVelocity * angularVelocity * sinA -
					FRICTION * cartVelocity) /
				totalMass;
			const angleDenominator =
				PENDULUM_LENGTH * (4 / 3 - (PENDULUM_MASS * cosA * cosA) / totalMass);
			const angularAccel = (GRAVITY * sinA - cosA * temp) / angleDenominator;
			const cartAccel = temp - (ml * angularAccel * cosA) / totalMass;

			const newCartVelocity = cartVelocity + cartAccel * DT;
			const newCartX = cartX + newCartVelocity * DT;
			const newAngularVelocity = angularVelocity + angularAccel * DT;
			const newAngle = angle + newAngularVelocity * DT;

    return {
      cartX: newCartX,
      cartVelocity: newCartVelocity,
      angle: newAngle,
      angularVelocity: newAngularVelocity,
			};
		},
		[],
	);

	const draw = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			pendulumState: PendulumState,
			currentForce: number,
			fallen: boolean,
			reason: string,
			hoveringCart: boolean,
			target: number,
			hoveringTarget: boolean,
			draggingTarget: boolean,
			showPosControl: boolean,
		) => {
			const width = CANVAS_WIDTH;
			const height = CANVAS_HEIGHT;

			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

			const groundY = height * 0.75;
    const centerX = width / 2;

			// Track
			ctx.fillStyle = "#1e293b";
			ctx.beginPath();
			ctx.roundRect(
				centerX - (TRACK_WIDTH / 2) * SCALE - 10,
				groundY,
				TRACK_WIDTH * SCALE + 20,
				8,
				4,
			);
			ctx.fill();

			// Track end stops (danger zones)
			ctx.fillStyle = "#ef4444";
			ctx.fillRect(
				centerX - (TRACK_WIDTH / 2) * SCALE - 8,
				groundY - 20,
				6,
				28,
			);
			ctx.fillRect(
				centerX + (TRACK_WIDTH / 2) * SCALE + 2,
				groundY - 20,
				6,
				28,
			);

			// Target position handle (orange) - only show if position control is enabled
			if (showPosControl) {
				const targetScreenX = centerX + target * SCALE;
				const handleY = groundY + 20;
				const handleSize = hoveringTarget || draggingTarget ? 10 : 8;
				
				// Connector line from track to handle
				ctx.beginPath();
				ctx.moveTo(targetScreenX, groundY + 8);
				ctx.lineTo(targetScreenX, handleY - handleSize);
				ctx.strokeStyle = "#f97316";
				ctx.lineWidth = 2;
				ctx.stroke();
				
				// Handle circle
				ctx.beginPath();
				ctx.arc(targetScreenX, handleY, handleSize, 0, Math.PI * 2);
				ctx.fillStyle = "#f97316";
				ctx.fill();
				ctx.strokeStyle = "#fdba74";
				ctx.lineWidth = 2;
				ctx.stroke();
				
				// Target indicator on track
				ctx.fillStyle = "#f97316";
				ctx.fillRect(targetScreenX - 2, groundY, 4, 8);
			} else {
				// Center marker (green) - only show when no position control
				ctx.fillStyle = "#22c55e";
				ctx.fillRect(centerX - 2, groundY, 4, 8);
			}

			const cartScreenX = centerX + pendulumState.cartX * SCALE;
			const cartWidth = 50;
			const cartHeight = 25;

			// Only draw cart if on track
			if (!fallen || reason !== "Off track!") {
    // Cart shadow
				ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
				ctx.beginPath();
				ctx.roundRect(
					cartScreenX - cartWidth / 2 + 3,
					groundY - cartHeight + 3,
					cartWidth,
					cartHeight,
					5,
				);
				ctx.fill();

    // Cart body
				const cartGradient = ctx.createLinearGradient(
					cartScreenX - cartWidth / 2,
					groundY - cartHeight,
					cartScreenX - cartWidth / 2,
					groundY,
				);
				if (hoveringCart && !fallen) {
					cartGradient.addColorStop(0, "#f97316");
					cartGradient.addColorStop(1, "#ea580c");
				} else {
					cartGradient.addColorStop(0, "#52525b");
					cartGradient.addColorStop(1, "#3f3f46");
				}
				ctx.fillStyle = cartGradient;
				ctx.beginPath();
				ctx.roundRect(
					cartScreenX - cartWidth / 2,
					groundY - cartHeight,
					cartWidth,
					cartHeight,
					5,
				);
				ctx.fill();
				ctx.strokeStyle = hoveringCart && !fallen ? "#fdba74" : "#71717a";
    ctx.lineWidth = 2;
				ctx.stroke();

    // Wheels
				ctx.fillStyle = "#1e293b";
    ctx.beginPath();
				ctx.arc(cartScreenX - 15, groundY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
				ctx.arc(cartScreenX + 15, groundY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Pendulum
    const pendulumBaseY = groundY - cartHeight;
				const pendulumTipX =
					cartScreenX + Math.sin(pendulumState.angle) * PENDULUM_LENGTH * SCALE;
				const pendulumTipY =
					pendulumBaseY -
					Math.cos(pendulumState.angle) * PENDULUM_LENGTH * SCALE;

				// Pendulum shadow
    ctx.beginPath();
				ctx.moveTo(cartScreenX + 2, pendulumBaseY + 2);
				ctx.lineTo(pendulumTipX + 2, pendulumTipY + 2);
				ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
				ctx.lineWidth = 8;
				ctx.lineCap = "round";
    ctx.stroke();

    // Pendulum rod
    ctx.beginPath();
    ctx.moveTo(cartScreenX, pendulumBaseY);
    ctx.lineTo(pendulumTipX, pendulumTipY);
				ctx.strokeStyle = "#3b82f6";
				ctx.lineWidth = 6;
				ctx.lineCap = "round";
    ctx.stroke();

				// Pendulum bob
    ctx.beginPath();
				ctx.arc(pendulumTipX, pendulumTipY, 10, 0, Math.PI * 2);
				const bobGradient = ctx.createRadialGradient(
					pendulumTipX - 3,
					pendulumTipY - 3,
					0,
					pendulumTipX,
					pendulumTipY,
					10,
				);
				bobGradient.addColorStop(0, "#60a5fa");
				bobGradient.addColorStop(1, "#3b82f6");
				ctx.fillStyle = bobGradient;
    ctx.fill();

				// Pivot
    ctx.beginPath();
				ctx.arc(cartScreenX, pendulumBaseY, 4, 0, Math.PI * 2);
				ctx.fillStyle = "#27272a";
    ctx.fill();

    // Force arrow
				if (Math.abs(currentForce) > 0.5 && !fallen) {
					const arrowLength = currentForce * 2.5;
					const arrowY = groundY - cartHeight / 2;

      ctx.beginPath();
					ctx.moveTo(cartScreenX, arrowY);
					ctx.lineTo(cartScreenX + arrowLength, arrowY);
					ctx.strokeStyle = currentForce > 0 ? "#22c55e" : "#ef4444";
					ctx.lineWidth = 3;
					ctx.lineCap = "round";
      ctx.stroke();
      
					const arrowDir = Math.sign(currentForce);
      ctx.beginPath();
					ctx.moveTo(cartScreenX + arrowLength, arrowY);
					ctx.lineTo(cartScreenX + arrowLength - 8 * arrowDir, arrowY - 6);
					ctx.lineTo(cartScreenX + arrowLength - 8 * arrowDir, arrowY + 6);
      ctx.closePath();
					ctx.fillStyle = currentForce > 0 ? "#22c55e" : "#ef4444";
      ctx.fill();
				}
			}

			// Fallen overlay (just the darkening - button is HTML)
			if (fallen) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
				ctx.fillRect(0, 0, width, height);
				ctx.fillStyle = "#ef4444";
				ctx.font = "bold 24px sans-serif";
				ctx.textAlign = "center";
				ctx.fillText(reason, width / 2, height / 2 - 30);
			}
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
			if (isRunning && !hasFallen && !isDraggingTarget) {
				const newState = simulate(
					stateRef.current,
					kpAngle,
					kdAngle,
					showPositionControl ? kpPos : 0,
					showPositionControl ? kdPos : 0,
					controlEnabled,
					showPositionControl ? targetX : 0,
				);
				stateRef.current = newState;
				setState(newState);
				
				// Check failure conditions
				if (Math.abs(newState.angle) > Math.PI / 2) {
					setHasFallen(true);
					setFailReason("Fallen!");
				} else if (Math.abs(newState.cartX) > TRACK_WIDTH / 2) {
          setHasFallen(true);
					setFailReason("Off track!");
				}
			}
			draw(ctx, stateRef.current, force, hasFallen, failReason, isHoveringCart, targetX, isHoveringTarget, isDraggingTarget, showPositionControl);
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
		};
	}, [simulate, draw, isRunning, isVisible, kpAngle, kdAngle, kpPos, kdPos, controlEnabled, hasFallen, force, failReason, isHoveringCart, showPositionControl, targetX, isHoveringTarget, isDraggingTarget]);

	const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return { x: 0, y: 0 };
		const rect = canvas.getBoundingClientRect();
		const scaleX = CANVAS_WIDTH / rect.width;
		const scaleY = CANVAS_HEIGHT / rect.height;
		return {
			x: (e.clientX - rect.left) * scaleX,
			y: (e.clientY - rect.top) * scaleY,
		};
	}, []);

	const isNearCart = useCallback((mouseX: number, mouseY: number) => {
		const centerX = CANVAS_WIDTH / 2;
		const groundY = CANVAS_HEIGHT * 0.75;
		const cartScreenX = centerX + stateRef.current.cartX * SCALE;
		const cartWidth = 50;
		const cartHeight = 25;
		return (
			mouseX >= cartScreenX - cartWidth / 2 - 10 &&
			mouseX <= cartScreenX + cartWidth / 2 + 10 &&
			mouseY >= groundY - cartHeight - 10 &&
			mouseY <= groundY + 10
		);
	}, []);

	const isNearTarget = useCallback((mouseX: number, mouseY: number) => {
		if (!showPositionControl) return false;
		const centerX = CANVAS_WIDTH / 2;
		const groundY = CANVAS_HEIGHT * 0.75;
		const handleY = groundY + 20;
		const targetScreenX = centerX + targetX * SCALE;
		const dx = mouseX - targetScreenX;
		const dy = mouseY - handleY;
		return Math.sqrt(dx * dx + dy * dy) < 15;
	}, [targetX, showPositionControl]);

	const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const { x, y } = getMousePos(e);
		if (isNearTarget(x, y) && !hasFallen) {
			setIsDraggingTarget(true);
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const { x, y } = getMousePos(e);
		setIsHoveringCart(isNearCart(x, y) && !hasFallen && !isDraggingTarget);
		setIsHoveringTarget(isNearTarget(x, y) && !hasFallen);
		
		if (isDraggingTarget && !hasFallen) {
			const centerX = CANVAS_WIDTH / 2;
			const newTargetX = (x - centerX) / SCALE;
			// Clamp to allowed range
			setTargetX(Math.max(-TARGET_X_RANGE, Math.min(TARGET_X_RANGE, newTargetX)));
		}
	};

	const handleMouseUp = () => {
		setIsDraggingTarget(false);
	};

	const handleMouseLeave = () => {
		setIsHoveringCart(false);
		setIsHoveringTarget(false);
		setIsDraggingTarget(false);
	};

	const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const { x, y } = getMousePos(e);
		// Don't poke if clicking on target handle
		if (isNearTarget(x, y)) return;
		if (isNearCart(x, y) && !hasFallen) {
			const pokeStrength = (Math.random() - 0.5) * 6;
			const newState = {
				...stateRef.current,
				angularVelocity: stateRef.current.angularVelocity + pokeStrength,
				cartVelocity: stateRef.current.cartVelocity + (Math.random() - 0.5) * 1.5,
			};
			stateRef.current = newState;
			setState(newState);
		}
	};

  const handleReset = () => {
		const initialState = {
      cartX: 0,
      cartVelocity: 0,
      angle: 0.05,
      angularVelocity: 0,
		};
		stateRef.current = initialState;
		setState(initialState);
    setHasFallen(false);
		setFailReason("");
		setKpAngle(DEFAULT_KP_ANGLE);
		setKdAngle(DEFAULT_KD_ANGLE);
		setKpPos(showPositionControl ? DEFAULT_KP_POS : 0);
		setKdPos(showPositionControl ? DEFAULT_KD_POS : 0);
		setTargetX(0);
		setControlEnabled(true);
		setIsHoveringCart(false);
		setIsHoveringTarget(false);
		setIsDraggingTarget(false);
	};

	const angleDeg = (state.angle * 180) / Math.PI;

  return (
		<div
			ref={containerRef}
			className="not-prose flex flex-col gap-4 p-6 bg-zinc-950 w-full rounded-3xl"
		>
			<div className="flex flex-col items-center min-w-0">
				<div className="relative w-full max-w-[500px]">
      <canvas
        ref={canvasRef}
						width={CANVAS_WIDTH * DPR}
						height={CANVAS_HEIGHT * DPR}
						className="outline-none border-0 block w-full"
						style={{
							aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
							cursor: isHoveringTarget || isDraggingTarget ? "grab" : isHoveringCart ? "pointer" : "default",
						}}
						onMouseDown={handleMouseDown}
						onMouseMove={handleMouseMove}
						onMouseUp={handleMouseUp}
						onMouseLeave={handleMouseLeave}
						onClick={handleClick}
					/>
					{hasFallen && (
						<div 
							className="absolute inset-0 flex items-center justify-center z-10"
						>
							<button
								type="button"
								onClick={handleReset}
								className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white rounded-xl transition-all flex items-center gap-2 font-medium mt-8 cursor-pointer shadow-lg"
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
								Reset
							</button>
						</div>
					)}
				</div>
				<p
					className={`text-xs mt-2 transition-colors ${isHoveringTarget || isDraggingTarget ? "text-orange-400" : isHoveringCart ? "text-orange-400" : "text-zinc-500"}`}
				>
					{showPositionControl 
						? (isHoveringTarget || isDraggingTarget ? "Drag to set target position" : "Click cart to poke · Drag handle to set target")
						: "Click the cart to poke it"
					}
				</p>
			</div>

			{/* Angle Control */}
			<div className={`flex flex-col gap-2 px-2 ${!showPositionControl ? 'pb-2' : ''}`}>
				<div className="text-xs text-zinc-400 font-mono">{showPositionControl ? 'Angle Control' : 'PD Control'}</div>
        <div className="flex items-center gap-4">
					<label className="text-sm font-mono text-blue-400 w-12">{showPositionControl ? <>Kp<sub>θ</sub></> : 'Kp'}</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-blue-500 rounded-lg"
							style={{ width: `${(kpAngle / 100) * 100}%` }}
						/>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
							value={kpAngle}
							onChange={(e) => setKpAngle(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-blue-300 pointer-events-none"
							style={{ left: `calc(${(kpAngle / 100) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-blue-400 w-10 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{kpAngle}
					</span>
        </div>
        <div className="flex items-center gap-4">
					<label className="text-sm font-mono text-purple-400 w-12">{showPositionControl ? <>Kd<sub>θ</sub></> : 'Kd'}</label>
					<div className="flex-1 relative h-2">
						<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
						<div
							className="absolute left-0 top-0 h-full bg-purple-500 rounded-lg"
							style={{ width: `${(kdAngle / 30) * 100}%` }}
						/>
          <input
            type="range"
            min="0"
							max="30"
							step="0.5"
							value={kdAngle}
							onChange={(e) => setKdAngle(parseFloat(e.target.value))}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-full border-2 border-purple-300 pointer-events-none"
							style={{ left: `calc(${(kdAngle / 30) * 100}% - 8px)` }}
						/>
					</div>
					<span
						className="text-sm font-mono text-purple-400 w-10 text-right"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{kdAngle}
					</span>
        </div>
      </div>

			{/* Position Control - only shown if prop is true */}
			{showPositionControl && (
				<div className="flex flex-col gap-2 px-2 pb-2">
					<div className="text-xs text-zinc-400 font-mono">Position Control</div>
					<div className="flex items-center gap-4">
						<label className="text-sm font-mono text-emerald-400 w-12">Kp<sub>x</sub></label>
						<div className="flex-1 relative h-2">
							<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
							<div
								className="absolute left-0 top-0 h-full bg-emerald-500 rounded-lg"
								style={{ width: `${(kpPos / 10) * 100}%` }}
							/>
							<input
								type="range"
								min="0"
								max="10"
								step="0.1"
								value={kpPos}
								onChange={(e) => setKpPos(parseFloat(e.target.value))}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							/>
							<div
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-emerald-500 rounded-full border-2 border-emerald-300 pointer-events-none"
								style={{ left: `calc(${(kpPos / 10) * 100}% - 8px)` }}
							/>
						</div>
						<span
							className="text-sm font-mono text-emerald-400 w-10 text-right"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{kpPos.toFixed(1)}
						</span>
					</div>
					<div className="flex items-center gap-4">
						<label className="text-sm font-mono text-amber-400 w-12">Kd<sub>x</sub></label>
						<div className="flex-1 relative h-2">
							<div className="absolute inset-0 bg-zinc-800 rounded-lg" />
							<div
								className="absolute left-0 top-0 h-full bg-amber-500 rounded-lg"
								style={{ width: `${(kdPos / 15) * 100}%` }}
							/>
							<input
								type="range"
								min="0"
								max="15"
								step="0.1"
								value={kdPos}
								onChange={(e) => setKdPos(parseFloat(e.target.value))}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							/>
							<div
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-amber-500 rounded-full border-2 border-amber-300 pointer-events-none"
								style={{ left: `calc(${(kdPos / 15) * 100}% - 8px)` }}
							/>
						</div>
						<span
							className="text-sm font-mono text-amber-400 w-10 text-right"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{kdPos.toFixed(1)}
						</span>
					</div>
				</div>
			)}

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
          onClick={() => setControlEnabled(!controlEnabled)}
						className={`p-2.5 rounded-xl transition-all ${controlEnabled ? "bg-green-600 hover:bg-green-500 active:bg-green-400 text-white" : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300"}`}
						title={controlEnabled ? "Control ON" : "Control OFF"}
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
							<path d="M12 2v4" />
							<path d="M12 18v4" />
							<path d="M4.93 4.93l2.83 2.83" />
							<path d="M16.24 16.24l2.83 2.83" />
							<path d="M2 12h4" />
							<path d="M18 12h4" />
							<path d="M4.93 19.07l2.83-2.83" />
							<path d="M16.24 7.76l2.83-2.83" />
							{controlEnabled && (
								<circle cx="12" cy="12" r="3" fill="currentColor" />
							)}
						</svg>
        </button>
      </div>
				<div className="flex gap-2 font-mono text-xs">
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[60px]">
						<span className="text-zinc-500 text-[10px]">Angle</span>
						<span
							className={
								Math.abs(angleDeg) > 20 ? "text-red-400" : "text-green-400"
							}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{angleDeg < 0 ? "−" : ""}
							</span>
							{Math.abs(angleDeg).toFixed(1)}°
						</span>
					</div>
					{showPositionControl && (
						<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[60px]">
							<span className="text-zinc-500 text-[10px]">Pos</span>
							<span
								className={
									Math.abs(state.cartX) > 1.2 ? "text-red-400" : "text-zinc-300"
								}
								style={{ fontVariantNumeric: "tabular-nums" }}
							>
								<span className="inline-block w-[0.6em] text-right">
									{state.cartX < 0 ? "−" : ""}
								</span>
								{Math.abs(state.cartX).toFixed(2)}
							</span>
						</div>
					)}
					<div className="px-2 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[60px]">
						<span className="text-zinc-500 text-[10px]">Force</span>
						<span
							className={
								force > 0
									? "text-green-400"
									: force < 0
										? "text-red-400"
										: "text-zinc-400"
							}
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							<span className="inline-block w-[0.6em] text-right">
								{force < 0 ? "−" : ""}
							</span>
							{Math.abs(force).toFixed(1)}
						</span>
					</div>
				</div>
			</div>
    </div>
  );
}
