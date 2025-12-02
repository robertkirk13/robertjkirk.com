import React, { useRef, useEffect, useState, useCallback } from 'react';

interface MotorState {
  angle: number;
  angularVelocity: number;
}

interface MotorDemoProps {
  showPlot?: boolean;
  showControls?: boolean;
}

const MOMENT_OF_INERTIA = 0.12;
const FRICTION = 0.02;
const MAX_TORQUE = 2;
const DT = 1 / 60;
const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const MIN_ANGLE = Math.PI / 4;  // 45 degrees
const MAX_ANGLE = 3 * Math.PI / 4;  // 135 degrees

export default function MotorDemo({ showPlot = true, showControls = true }: MotorDemoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plotCanvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<MotorState>({ angle: Math.PI / 2, angularVelocity: 0 }); // Start at 90°
  const stateRef = useRef<MotorState>(state);
  const [targetAngle, setTargetAngle] = useState<number>(3 * Math.PI / 4); // 135 degrees (start at one end)
  const [isRunning, setIsRunning] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [motorPower, setMotorPower] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringTarget, setIsHoveringTarget] = useState(false);
  const frameCountRef = useRef(0);
  const historyRef = useRef<number[]>([]);
  const targetHistoryRef = useRef<number[]>([]);
  const animationRef = useRef<number>();

  // Pause animation when not visible on screen
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const normalizeAngle = (angle: number) => {
    // Keep angle between 0 and PI (0° to 180°)
    while (angle > Math.PI) angle -= Math.PI;
    while (angle < 0) angle += Math.PI;
    return angle;
  };
  
  const clampAngle = (angle: number) => {
    return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));
  };

  const simulate = useCallback((currentState: MotorState, target: number) => {
    const error = target - currentState.angle;
    
    // Naive control: full power toward target until position matches, then stop
    let torque = 0;
    if (Math.abs(error) > 0.01) {
      torque = error > 0 ? MAX_TORQUE : -MAX_TORQUE;
    }

    const angularAcceleration = (torque - FRICTION * currentState.angularVelocity) / MOMENT_OF_INERTIA;
    let newVelocity = currentState.angularVelocity + angularAcceleration * DT;
    let newAngle = currentState.angle + newVelocity * DT;
    
    // Bounce off boundaries at 0° and 180° (full semicircle)
    if (newAngle < 0) {
      newAngle = 0;
      newVelocity = -newVelocity * 0.5;
    }
    if (newAngle > Math.PI) {
      newAngle = Math.PI;
      newVelocity = -newVelocity * 0.5;
    }

    setMotorPower(torque / MAX_TORQUE);

    return {
      angle: newAngle,
      angularVelocity: newVelocity,
    };
  }, []);

  const drawMotor = useCallback((ctx: CanvasRenderingContext2D, angle: number, target: number, power: number, hoveringTarget: boolean) => {
    const width = ctx.canvas.width / DPR;
    const height = ctx.canvas.height / DPR;
    const centerX = width / 2;
    const centerY = height - 35; // Position center near bottom for semicircle
    const radius = Math.min(width, height * 1.5) * 0.4;

    // Clear and scale for high DPI
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#000000'; // pure black
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
    ctx.arc(centerX, centerY, radius + 8, -MAX_ANGLE, -MIN_ANGLE);
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.3)';
    ctx.lineWidth = 6;
    ctx.stroke();
    
    // Draw end markers for full range
    ctx.beginPath();
    ctx.arc(centerX + radius, centerY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#3f3f46';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(centerX - radius, centerY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#3f3f46';
    ctx.fill();

    // Draw target indicator (orange - clickable!)
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
    ctx.restore();
    
    // Center pivot point (black dot)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    // Draw curved power arrow inside motor
    if (Math.abs(power) > 0.1) {
      const arrowRadius = 24;
      const arrowHeadRadius = 23.3; // Slightly closer to center for arrowhead
      const arcLength = Math.abs(power) * Math.PI * 0.8; // Max ~144 degrees
      const arrowColor = power > 0 ? '#4ade80' : '#f87171';
      const direction = Math.sign(power);
      
      ctx.save();
      ctx.translate(centerX, centerY);
      
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle - direction * arcLength;
      
      const arrowLength = 7;
      const arrowWidth = 4;
      
      // Clamp the arrow adjustment to not exceed the arc length
      const arrowAdjustment = Math.min(arrowLength / arrowRadius, arcLength * 0.8);
      const arcEndAngle = endAngle + direction * arrowAdjustment;
      
      ctx.beginPath();
      ctx.arc(0, 0, arrowRadius, startAngle, arcEndAngle, direction > 0);
      ctx.strokeStyle = arrowColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      // Only draw arrowhead if arc is large enough
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

    // Clear and scale for high DPI
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#000000'; // pure black
    ctx.fillRect(0, 0, width, height);

    const plotTop = padding + 10;
    const plotBottom = height - padding - 10;
    const plotHeight = plotBottom - plotTop;

    // Draw grid (no border)
    ctx.strokeStyle = '#1a1a1e';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = plotTop + plotHeight * i / 4;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - 15, y);
      ctx.stroke();
    }

    // Draw target line
    if (targetHistory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      for (let i = 0; i < targetHistory.length; i++) {
        const x = padding + (width - padding - 15) * i / (targetHistory.length - 1);
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
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      for (let i = 0; i < history.length; i++) {
        const x = padding + (width - padding - 15) * i / (history.length - 1);
        const y = plotTop + plotHeight * (1 - history[i] / Math.PI);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Y-axis labels (0° to 180°)
    ctx.fillStyle = '#71717a';
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('180°', Math.round(padding - 10), Math.round(plotTop + 7));
    ctx.fillText('90°', Math.round(padding - 10), Math.round(plotTop + plotHeight / 2 + 6));
    ctx.fillText('0°', Math.round(padding - 10), Math.round(plotBottom + 6));

    // Title
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Position over time', Math.round(padding), 26);
    
    // Legend
    ctx.font = '600 italic 17px "Times New Roman", Georgia, serif';
    // Target legend
    ctx.fillStyle = '#f97316';
    ctx.fillRect(Math.round(width - 155), 18, 10, 10);
    ctx.fillStyle = '#fb923c';
    ctx.fillText('Target', Math.round(width - 141), 28);
    // Pointer legend
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(Math.round(width - 72), 18, 10, 10);
    ctx.fillStyle = '#93c5fd';
    ctx.fillText('Pointer', Math.round(width - 58), 28);
  }, []);

  // Logical canvas dimensions (before DPR scaling)
  const CANVAS_WIDTH = 440;
  const CANVAS_HEIGHT = 280;

  const getAngleFromMouse = (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    // Scale mouse coordinates to logical canvas space
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX - CANVAS_WIDTH / 2;
    const y = (e.clientY - rect.top) * scaleY - (CANVAS_HEIGHT - 35);
    let angle = -Math.atan2(y, x);
    // Clamp to 45-135 degrees (±45° from vertical)
    return clampAngle(angle);
  };

  const getAngleFromTouch = (e: React.TouchEvent<HTMLCanvasElement> | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !e.touches[0]) return null;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const x = (e.touches[0].clientX - rect.left) * scaleX - CANVAS_WIDTH / 2;
    const y = (e.touches[0].clientY - rect.top) * scaleY - (CANVAS_HEIGHT - 35);
    let angle = -Math.atan2(y, x);
    return clampAngle(angle);
  };

  const isNearTarget = (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    
    const rect = canvas.getBoundingClientRect();
    // Scale mouse coordinates to logical canvas space
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX - CANVAS_WIDTH / 2;
    const y = (e.clientY - rect.top) * scaleY - (CANVAS_HEIGHT - 35);
    
    // Use logical dimensions for radius (same as drawMotor)
    const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT * 1.5) * 0.4;
    const targetX = Math.cos(-targetAngle) * (radius + 25);
    const targetY = Math.sin(-targetAngle) * (radius + 25);
    
    // Scale hit detection radius based on current canvas scale
    const avgScale = (scaleX + scaleY) / 2;
    const dist = Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2);
    return dist < 20 * avgScale;
  };

  const isNearTargetTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !e.touches[0]) return false;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const x = (e.touches[0].clientX - rect.left) * scaleX - CANVAS_WIDTH / 2;
    const y = (e.touches[0].clientY - rect.top) * scaleY - (CANVAS_HEIGHT - 35);
    
    const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT * 1.5) * 0.4;
    const targetX = Math.cos(-targetAngle) * (radius + 25);
    const targetY = Math.sin(-targetAngle) * (radius + 25);
    
    const dist = Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2);
    return dist < 40; // Larger hit area for touch
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Don't run animation if not visible
    if (!isVisible) return;

    const loop = () => {
      if (isRunning && !isDragging) {
        const maxHistory = 200;
        
        const newState = simulate(stateRef.current, targetAngle);
        stateRef.current = newState;
        
        // Record to history for smooth graph
        historyRef.current.push(newState.angle);
        targetHistoryRef.current.push(targetAngle);
        
        if (historyRef.current.length > maxHistory) {
          historyRef.current.shift();
          targetHistoryRef.current.shift();
        }
        setState(newState);
      }

      drawMotor(ctx, stateRef.current.angle, targetAngle, motorPower, isHoveringTarget || isDragging);

      if (showPlot && plotCanvasRef.current) {
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
  }, [simulate, drawMotor, drawPlot, targetAngle, isRunning, motorPower, showPlot, isDragging, isHoveringTarget, isVisible]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isNearTarget(e)) {
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsHoveringTarget(isNearTarget(e));
    
    if (isDragging) {
      const angle = getAngleFromMouse(e);
      if (angle !== null) {
        setTargetAngle(angle);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setIsHoveringTarget(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isNearTargetTouch(e)) {
      e.preventDefault();
      setIsDragging(true);
      setIsHoveringTarget(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      e.preventDefault();
      const angle = getAngleFromTouch(e);
      if (angle !== null) {
        setTargetAngle(angle);
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setIsHoveringTarget(false);
  };

  const handleReset = () => {
    const initialState = { angle: Math.PI / 2, angularVelocity: 0 };
    stateRef.current = initialState;
    setState(initialState); // Start at 90° (center)
    historyRef.current = [];
    targetHistoryRef.current = [];
    setTargetAngle(3 * Math.PI / 4); // Target at 135°
  };

  return (
    <div ref={containerRef} className="not-prose flex flex-col gap-4 p-6 bg-black w-full rounded-3xl">
      <div className="flex flex-col md:flex-row gap-4 items-start w-full">
        {/* Left: visualization */}
        <div className="flex-1 flex flex-col items-center min-w-0 pb-4">
          <div className="text-zinc-500 text-xs mb-2">Drag orange handle to move target</div>
          <canvas
            ref={canvasRef}
            width={440 * DPR}
            height={280 * DPR}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`outline-none border-0 block w-full max-w-[440px] touch-none ${isHoveringTarget || isDragging ? 'cursor-grab' : 'cursor-default'} ${isDragging ? 'cursor-grabbing' : ''}`}
            style={{ aspectRatio: '440 / 280' }}
          />
        </div>
        
        {/* Right: position graph */}
        {showPlot && (
          <div className="flex-1 flex flex-col items-center min-w-0">
            <canvas
              ref={plotCanvasRef}
              width={440 * DPR}
              height={280 * DPR}
              className="outline-none border-0 block w-full max-w-[440px]"
              style={{ aspectRatio: '440 / 280' }}
            />
          </div>
        )}
      </div>

      {/* Footer: controls on left, stats on right */}
      {showControls && (
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
                isRunning 
                  ? 'bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-white' 
                  : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 text-white'
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
          <div className="flex gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
              <span className="text-zinc-500 text-[10px]">Angle</span>
              <span className="text-blue-400" style={{ fontVariantNumeric: 'tabular-nums' }}>{(state.angle * 180 / Math.PI).toFixed(1)}°</span>
            </div>
            <div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
              <span className="text-zinc-500 text-[10px]">Target</span>
              <span className="text-orange-400" style={{ fontVariantNumeric: 'tabular-nums' }}>{(targetAngle * 180 / Math.PI).toFixed(1)}°</span>
            </div>
            <div className="px-3 py-1.5 bg-zinc-900 rounded-xl flex flex-col items-center w-[70px]">
              <span className="text-zinc-500 text-[10px]">Error</span>
              <span className="text-red-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span className="inline-block w-[0.6em] text-right">{(targetAngle - state.angle) * 180 / Math.PI < 0 ? '−' : ''}</span>
                {Math.abs((targetAngle - state.angle) * 180 / Math.PI).toFixed(1)}°
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
