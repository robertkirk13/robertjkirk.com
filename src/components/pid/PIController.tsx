import React, { useRef, useEffect, useState, useCallback } from 'react';

interface MotorState {
  angle: number;
  angularVelocity: number;
  integral: number;
}

const MOMENT_OF_INERTIA = 0.12;
const FRICTION = 0.02;
const MAX_TORQUE = 2;
const DT = 1 / 60;
const MAX_INTEGRAL = 10; // Prevent integral windup
const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 440;
const CANVAS_HEIGHT = 280;
const PLOT_WIDTH = 440;
const PLOT_HEIGHT = 280;
const MIN_ANGLE = Math.PI / 4; // 45 degrees
const MAX_ANGLE = (3 * Math.PI) / 4; // 135 degrees
const DEFAULT_KP = 3.5;
const DEFAULT_KI = 0.15;
const DEFAULT_MASS = 0.8;

export default function PIController() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plotCanvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<MotorState>({ angle: Math.PI / 2, angularVelocity: 0, integral: 0 });
  const [targetAngle, setTargetAngle] = useState<number>((3 * Math.PI) / 4);
  const [kp, setKp] = useState(DEFAULT_KP);
  const [ki, setKi] = useState(DEFAULT_KI);
  const [mass, setMass] = useState(DEFAULT_MASS);
  const [isRunning, setIsRunning] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [pOutput, setPOutput] = useState(0);
  const [iOutput, setIOutput] = useState(0);
  const [motorPower, setMotorPower] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringTarget, setIsHoveringTarget] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isInCanvas, setIsInCanvas] = useState(false);
  const historyRef = useRef<number[]>([]);
  const targetHistoryRef = useRef<number[]>([]);
  const animationRef = useRef<number>();

  const clampAngle = (angle: number) => {
    return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));
  };

  const simulate = useCallback((currentState: MotorState, target: number, kpVal: number, kiVal: number, massVal: number) => {
    const error = target - currentState.angle;
    
    // Clamp integral to prevent windup
    const newIntegral = Math.max(-MAX_INTEGRAL, Math.min(MAX_INTEGRAL, currentState.integral + error * DT));
    const pTerm = kpVal * error;
    const iTerm = kiVal * newIntegral;
    const torque = Math.max(-MAX_TORQUE, Math.min(MAX_TORQUE, pTerm + iTerm));
    
    setPOutput(pTerm);
    setIOutput(iTerm);
    setMotorPower(torque / MAX_TORQUE);

    // Mass creates gravitational torque: pulls toward 90° (stable equilibrium)
    const gravityTorque = -massVal * Math.cos(currentState.angle);

    const angularAcceleration = (torque + gravityTorque - FRICTION * currentState.angularVelocity) / MOMENT_OF_INERTIA;
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
      integral: newIntegral,
    };
  }, []);

  const drawMotor = useCallback((ctx: CanvasRenderingContext2D, angle: number, target: number, pOut: number, iOut: number, integral: number, power: number, predictedSettling: number | null, massVal: number, hoveringTarget: boolean, mousePosParam: { x: number; y: number } | null, inCanvas: boolean) => {
    const width = ctx.canvas.width / DPR;
    const height = ctx.canvas.height / DPR;
    const centerX = width / 2;
    const centerY = height - 35;
    const radius = Math.min(width, height * 1.5) * 0.4;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    // Draw full semicircle track (0° to 180°)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI, 0);
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw target zone indicator (45° to 135°)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -MAX_ANGLE, -MIN_ANGLE);
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw error arc (from current position to target)
    const errorVal = target - angle;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 15, -angle, -target, errorVal > 0);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
    ctx.lineWidth = 20;
    ctx.lineCap = "butt";
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
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Draw settling point marker (simple tick mark, not interactive-looking)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(-settlingAngle);

      ctx.beginPath();
      ctx.moveTo(radius - 12, 0);
      ctx.lineTo(radius + 5, 0);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.restore();
    }

    // Draw target indicator with draggable handle
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(-target);

    // Target line
    ctx.beginPath();
    ctx.moveTo(radius * 0.3, 0);
    ctx.lineTo(radius + 25, 0);
    ctx.strokeStyle = hoveringTarget ? '#fb923c' : '#f97316';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Target handle (draggable)
    ctx.beginPath();
    ctx.arc(radius + 25, 0, hoveringTarget ? 14 : 12, 0, Math.PI * 2);
    ctx.fillStyle = hoveringTarget ? '#fb923c' : '#f97316';
    ctx.fill();
    ctx.strokeStyle = '#fdba74';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Drag indicator icon inside handle
    ctx.fillStyle = '#fff';
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
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw small circle at mouse position
      ctx.beginPath();
      ctx.arc(mousePosParam.x, mousePosParam.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.4)';
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
      ctx.moveTo(Math.cos(finAngle) * (motorRadius - 2), Math.sin(finAngle) * (motorRadius - 2));
      ctx.lineTo(Math.cos(finAngle) * (motorRadius + finLength), Math.sin(finAngle) * (motorRadius + finLength));
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
    
    // Motor body
    ctx.beginPath();
    ctx.arc(centerX, centerY, motorRadius, 0, Math.PI * 2);
    const motorGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, motorRadius);
    motorGradient.addColorStop(0, '#52525b');
    motorGradient.addColorStop(0.7, '#3f3f46');
    motorGradient.addColorStop(1, '#27272a');
    ctx.fillStyle = motorGradient;
    ctx.fill();
    ctx.strokeStyle = '#52525b';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw shaft (behind pointer)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#52525b';
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
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Pointer tip (small)
    ctx.beginPath();
    ctx.arc(radius, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#93c5fd';
    ctx.fill();
    
    // Counterweight (bulbous teardrop shape)
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(-counterweightLength, -14, -counterweightLength, 0);
    ctx.quadraticCurveTo(-counterweightLength, 14, -4, 0);
    ctx.fillStyle = '#60a5fa';
    ctx.fill();
    
    // Center pivot point (black dot)
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
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
        radius * Math.sin(-angle) + ropeLength
      );
      ctx.strokeStyle = '#a1a1aa';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw mass (circle with indicator)
      const massX = radius * Math.cos(-angle);
      const massY = radius * Math.sin(-angle) + ropeLength + massSize;
      ctx.beginPath();
      ctx.arc(massX, massY, massSize, 0, Math.PI * 2);
      ctx.fillStyle = '#71717a';
      ctx.fill();
      ctx.strokeStyle = '#52525b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Mass shine
      ctx.beginPath();
      ctx.arc(
        massX - massSize * 0.3,
        massY - massSize * 0.3,
        massSize * 0.25,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#a1a1aa';
      ctx.fill();
    }
    
    ctx.restore();
    
    // Draw power indicator arrow inside motor
    if (Math.abs(power) > 0.1) {
      const arrowRadius = 24;
      const arrowHeadRadius = 23.3;
      const arcLength = Math.abs(power) * Math.PI * 0.8;
      const arrowColor = power > 0 ? '#4ade80' : '#f87171';
      const direction = Math.sign(power);
      
      ctx.save();
      ctx.translate(centerX, centerY);
      
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle - direction * arcLength;
      
      const arrowLength = 7;
      const arrowWidth = 4;
      
      const arrowAdjustment = Math.min(arrowLength / arrowRadius, arcLength * 0.8);
      const arcEndAngle = endAngle + direction * arrowAdjustment;
      
      ctx.beginPath();
      ctx.arc(0, 0, arrowRadius, startAngle, arcEndAngle, direction > 0);
      ctx.strokeStyle = arrowColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      if (arcLength > 0.2) {
        const tangentAngle = endAngle - direction * Math.PI / 2;
        const tipX = Math.cos(endAngle) * arrowHeadRadius;
        const tipY = Math.sin(endAngle) * arrowHeadRadius;
        const backX = tipX - Math.cos(tangentAngle) * arrowLength;
        const backY = tipY - Math.sin(tangentAngle) * arrowLength;
        const perpAngle = tangentAngle + Math.PI / 2;
        
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
          backX + Math.cos(perpAngle) * arrowWidth,
          backY + Math.sin(perpAngle) * arrowWidth
        );
        ctx.lineTo(
          backX - Math.cos(perpAngle) * arrowWidth,
          backY - Math.sin(perpAngle) * arrowWidth
        );
        ctx.closePath();
        ctx.fillStyle = arrowColor;
        ctx.fill();
      }
      
      ctx.restore();
    }

  }, []);

  const drawPlot = useCallback((ctx: CanvasRenderingContext2D, history: number[], targetHistory: number[]) => {
    const width = ctx.canvas.width / DPR;
    const height = ctx.canvas.height / DPR;
    const padding = 46;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (height - 2 * padding) * i / 4;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Y-axis labels (0° to 180°)
    ctx.fillStyle = '#64748b';
    ctx.font = '18px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('180°', padding - 8, padding + 6);
    ctx.fillText('90°', padding - 8, height / 2 + 5);
    ctx.fillText('0°', padding - 8, height - padding + 6);

    if (targetHistory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      for (let i = 0; i < targetHistory.length; i++) {
        const x = padding + (width - 2 * padding) * i / (targetHistory.length - 1);
        const y = padding + (height - 2 * padding) * (1 - targetHistory[i] / Math.PI);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (history.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 2;
      for (let i = 0; i < history.length; i++) {
        const x = padding + (width - 2 * padding) * i / (history.length - 1);
        const y = padding + (height - 2 * padding) * (1 - history[i] / Math.PI);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Title
    ctx.fillStyle = '#94a3b8';
    ctx.font = '19px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Position over time', padding, 24);

    // Legend
    const legendY = height - 16;
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(padding, legendY - 10, 10, 10);
    ctx.font = '17px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fb923c';
    ctx.fillText('Target', padding + 16, legendY);

    ctx.fillStyle = '#93c5fd';
    ctx.fillRect(padding + 90, legendY - 10, 10, 10);
    ctx.fillStyle = '#93c5fd';
    ctx.fillText('Pointer', padding + 106, legendY);
  }, []);

  // Intersection Observer for visibility-based pausing
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
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

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!isVisible) return;

    let currentState = state;

    const loop = () => {
      if (isRunning) {
        currentState = simulate(currentState, targetAngle, kp, ki, mass);
        setState(currentState);

        historyRef.current.push(currentState.angle);
        targetHistoryRef.current.push(targetAngle);
        if (historyRef.current.length > 200) {
          historyRef.current.shift();
          targetHistoryRef.current.shift();
        }
      }

      // Calculate predicted settling point assuming P-only control (to show what I term fixes)
      // With just P: Kp * (target - settling) = mass * cos(settling)
      // The integral term will eventually eliminate this SSE, but we show what P alone would do
      let predictedSettling: number | null = null;
      if (mass > 0.01) {
        let settling = targetAngle;
        // Iterate to find equilibrium point for P-only (what I term compensates for)
        for (let i = 0; i < 15; i++) {
          settling = targetAngle - (mass * Math.cos(settling)) / kp;
        }
        predictedSettling = Math.max(0, Math.min(Math.PI, settling));
      }

      drawMotor(ctx, currentState.angle, targetAngle, pOutput, iOutput, currentState.integral, motorPower, predictedSettling, mass, isHoveringTarget || isDragging, mousePos, isInCanvas);

      if (plotCanvasRef.current) {
        const plotCtx = plotCanvasRef.current.getContext('2d');
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
  }, [simulate, drawMotor, drawPlot, targetAngle, isRunning, isVisible, kp, ki, mass, pOutput, iOutput, motorPower, isHoveringTarget, isDragging, mousePos, isInCanvas]);

  const getAngleFromMouse = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const centerY = CANVAS_HEIGHT - 35;
    const x = (e.clientX - rect.left) * scaleX - CANVAS_WIDTH / 2;
    const y = (e.clientY - rect.top) * scaleY - centerY;
    return clampAngle(-Math.atan2(y, x));
  };

  const isNearTarget = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const centerY = CANVAS_HEIGHT - 35;
    const x = (e.clientX - rect.left) * scaleX - CANVAS_WIDTH / 2;
    const y = (e.clientY - rect.top) * scaleY - centerY;

    const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT * 1.5) * 0.4;
    const targetX = Math.cos(-targetAngle) * (radius + 25);
    const targetY = Math.sin(-targetAngle) * (radius + 25);

    const avgScale = (scaleX + scaleY) / 2;
    const dist = Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2);
    return dist < 20 * avgScale;
  };

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
    setState({ angle: Math.PI / 2, angularVelocity: 0, integral: 0 });
    historyRef.current = [];
    targetHistoryRef.current = [];
    setTargetAngle((3 * Math.PI) / 4);
    setKp(DEFAULT_KP);
    setKi(DEFAULT_KI);
    setMass(DEFAULT_MASS);
  };

  // Calculate predicted steady state error assuming P-only control
  // This shows what the SSE would be WITHOUT the integral term
  // The I term's job is to eliminate this error over time
  const predictedSSE = (() => {
    if (mass <= 0.01) return 0;
    let settling = targetAngle;
    for (let i = 0; i < 15; i++) {
      settling = targetAngle - (mass * Math.cos(settling)) / kp;
    }
    settling = Math.max(0, Math.min(Math.PI, settling));
    return (Math.abs(targetAngle - settling) * 180) / Math.PI;
  })();

  return (
    <div ref={containerRef} className="not-prose flex flex-col gap-4 p-6 bg-zinc-950 w-full rounded-3xl">
      <div className="flex flex-col md:flex-row gap-4 items-start w-full">
        <div className="flex-1 flex flex-col items-center min-w-0 pb-4">
          <div className={`text-xs mb-2 transition-colors ${isInCanvas ? "text-orange-400" : "text-zinc-500"}`}>
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
        <div className="flex-1 flex-shrink min-w-0 w-full flex justify-center">
          <canvas
            ref={plotCanvasRef}
            width={PLOT_WIDTH * DPR}
            height={PLOT_HEIGHT * DPR}
            className="rounded-lg w-full max-w-[440px]"
            style={{ aspectRatio: `${PLOT_WIDTH} / ${PLOT_HEIGHT}` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 px-2 pb-2">
        <div className="flex items-center gap-3">
          <label className="text-xs font-mono text-zinc-500 w-12">Kp</label>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={kp}
            onChange={(e) => setKp(parseFloat(e.target.value))}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((kp - 0.5) / 4.5) * 100}%, #27272a ${((kp - 0.5) / 4.5) * 100}%, #27272a 100%)`
            }}
          />
          <span className="text-sm font-mono text-blue-400 w-10 text-right">{kp.toFixed(1)}</span>
        </div>
        
        <div className="flex items-center gap-3">
          <label className="text-xs font-mono text-zinc-500 w-12">Ki</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={ki}
            onChange={(e) => setKi(parseFloat(e.target.value))}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #22c55e 0%, #22c55e ${ki * 100}%, #27272a ${ki * 100}%, #27272a 100%)`
            }}
          />
          <span className="text-sm font-mono text-green-400 w-10 text-right">{ki.toFixed(2)}</span>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-mono text-zinc-500 w-12">Mass</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={mass}
            onChange={(e) => setMass(parseFloat(e.target.value))}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #a1a1aa 0%, #a1a1aa ${mass * 100}%, #27272a ${mass * 100}%, #27272a 100%)`
            }}
          />
          <span className="text-sm font-mono text-zinc-400 w-10 text-right">{mass.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex gap-2 items-center">
          <button
            onClick={handleReset}
            className="p-2.5 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 rounded-xl transition-all"
            title="Reset"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`p-2.5 rounded-xl transition-all ${
              isRunning ? 'bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-white' : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 text-white'
            }`}
            title={isRunning ? 'Pause' : 'Play'}
          >
            {isRunning ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
              </svg>
            )}
          </button>
        </div>
        <div className="flex gap-3 font-mono text-xs flex-wrap">
          <div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
            <span className="text-zinc-500 text-[10px]">Error</span>
            <span className="text-red-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span className="inline-block w-[0.6em] text-right">{((targetAngle - state.angle) * 180 / Math.PI) < 0 ? "−" : ""}</span>
              {Math.abs((targetAngle - state.angle) * 180 / Math.PI).toFixed(1)}°
            </span>
          </div>
          <div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
            <span className="text-zinc-500 text-[10px]">P</span>
            <span className="text-blue-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span className="inline-block w-[0.6em] text-right">{pOutput < 0 ? "−" : ""}</span>
              {Math.abs(pOutput).toFixed(2)}
            </span>
          </div>
          <div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
            <span className="text-zinc-500 text-[10px]">I</span>
            <span className="text-green-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span className="inline-block w-[0.6em] text-right">{iOutput < 0 ? "−" : ""}</span>
              {Math.abs(iOutput).toFixed(2)}
            </span>
          </div>
          <div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
            <span className="text-zinc-500 text-[10px]">∫</span>
            <span className="text-emerald-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span className="inline-block w-[0.6em] text-right">{state.integral < 0 ? "−" : ""}</span>
              {Math.abs(state.integral).toFixed(2)}
            </span>
          </div>
          {mass > 0.01 && (
            <div
              className={`px-3 py-1.5 rounded-xl flex flex-col items-center w-[70px] ${predictedSSE > 5 ? "bg-red-900/50" : "bg-zinc-900"}`}
            >
              <span className="text-zinc-500 text-[10px]">SSE</span>
              <span
                className={predictedSSE > 5 ? "text-red-400" : "text-green-400"}
                style={{ fontVariantNumeric: 'tabular-nums' }}
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
