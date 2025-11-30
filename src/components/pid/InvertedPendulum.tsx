import React, { useRef, useEffect, useState, useCallback } from 'react';

interface PendulumState {
  cartX: number;
  cartVelocity: number;
  angle: number;
  angularVelocity: number;
  integral: number;
  prevError: number;
}

const CART_MASS = 1;
const PENDULUM_MASS = 0.3;
const PENDULUM_LENGTH = 1.5;
const GRAVITY = 9.8;
const DT = 1 / 60;
const TRACK_WIDTH = 4;
const MAX_FORCE = 30;
const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 440;
const CANVAS_HEIGHT = 320;
const DEFAULT_KP = 50;
const DEFAULT_KD = 20;

export default function InvertedPendulum() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<PendulumState>({
    cartX: 0, cartVelocity: 0, angle: 0.05, angularVelocity: 0, integral: 0, prevError: 0,
  });
  const stateRef = useRef<PendulumState>(state);
  const [kp, setKp] = useState(DEFAULT_KP);
  const [kd, setKd] = useState(DEFAULT_KD);
  const [isRunning, setIsRunning] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [hasFallen, setHasFallen] = useState(false);
  const [controlEnabled, setControlEnabled] = useState(true);
  const animationRef = useRef<number>();

  const simulate = useCallback((currentState: PendulumState, kpVal: number, kdVal: number, control: boolean) => {
    const { cartX, cartVelocity, angle, angularVelocity, integral, prevError } = currentState;

    let force = 0;
    if (control) {
      const error = -angle;
      const derivative = (error - prevError) / DT;
      force = kpVal * error + kdVal * derivative;
      force = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, force));
    }

    const sinAngle = Math.sin(angle);
    const cosAngle = Math.cos(angle);
    const totalMass = CART_MASS + PENDULUM_MASS;

    const temp = (force + PENDULUM_MASS * PENDULUM_LENGTH * angularVelocity * angularVelocity * sinAngle) / totalMass;
    const angularAcceleration = (GRAVITY * sinAngle - cosAngle * temp) / 
      (PENDULUM_LENGTH * (4/3 - PENDULUM_MASS * cosAngle * cosAngle / totalMass));
    const cartAcceleration = temp - PENDULUM_MASS * PENDULUM_LENGTH * angularAcceleration * cosAngle / totalMass;

    let newCartVelocity = cartVelocity + cartAcceleration * DT;
    let newCartX = cartX + newCartVelocity * DT;
    let newAngularVelocity = angularVelocity + angularAcceleration * DT;
    let newAngle = angle + newAngularVelocity * DT;

    if (Math.abs(newCartX) > TRACK_WIDTH / 2 - 0.3) {
      newCartX = Math.sign(newCartX) * (TRACK_WIDTH / 2 - 0.3);
      newCartVelocity = -newCartVelocity * 0.5;
    }

    return {
      cartX: newCartX, cartVelocity: newCartVelocity, angle: newAngle, angularVelocity: newAngularVelocity,
      integral: integral + (-angle) * DT, prevError: -angle,
    };
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, pendulumState: PendulumState, force: number) => {
    const width = ctx.canvas.width / DPR;
    const height = ctx.canvas.height / DPR;
    const scale = 90;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const groundY = height * 0.65;
    const centerX = width / 2;

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(centerX - TRACK_WIDTH / 2 * scale, groundY, TRACK_WIDTH * scale, 10);
    
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(centerX - TRACK_WIDTH / 2 * scale - 5, groundY - 20, 10, 30);
    ctx.fillRect(centerX + TRACK_WIDTH / 2 * scale - 5, groundY - 20, 10, 30);

    const cartScreenX = centerX + pendulumState.cartX * scale;
    const cartWidth = 70;
    const cartHeight = 35;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(cartScreenX - cartWidth / 2 + 5, groundY - cartHeight + 5, cartWidth, cartHeight);

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(cartScreenX - cartWidth / 2, groundY - cartHeight, cartWidth, cartHeight);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.strokeRect(cartScreenX - cartWidth / 2, groundY - cartHeight, cartWidth, cartHeight);

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(cartScreenX - 18, groundY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cartScreenX + 18, groundY, 10, 0, Math.PI * 2);
    ctx.fill();

    const pendulumBaseY = groundY - cartHeight;
    const pendulumTipX = cartScreenX + Math.sin(pendulumState.angle) * PENDULUM_LENGTH * scale;
    const pendulumTipY = pendulumBaseY - Math.cos(pendulumState.angle) * PENDULUM_LENGTH * scale;

    ctx.beginPath();
    ctx.moveTo(cartScreenX + 3, pendulumBaseY + 3);
    ctx.lineTo(pendulumTipX + 3, pendulumTipY + 3);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 12;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cartScreenX, pendulumBaseY);
    ctx.lineTo(pendulumTipX, pendulumTipY);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pendulumTipX, pendulumTipY, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cartScreenX, pendulumBaseY, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#475569';
    ctx.fill();

    if (Math.abs(force) > 0.5) {
      const arrowLength = force * 2.5;
      ctx.beginPath();
      ctx.moveTo(cartScreenX, groundY - cartHeight / 2);
      ctx.lineTo(cartScreenX + arrowLength, groundY - cartHeight / 2);
      ctx.strokeStyle = force > 0 ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 5;
      ctx.stroke();
      
      const arrowDir = Math.sign(force);
      ctx.beginPath();
      ctx.moveTo(cartScreenX + arrowLength, groundY - cartHeight / 2);
      ctx.lineTo(cartScreenX + arrowLength - 12 * arrowDir, groundY - cartHeight / 2 - 10);
      ctx.lineTo(cartScreenX + arrowLength - 12 * arrowDir, groundY - cartHeight / 2 + 10);
      ctx.closePath();
      ctx.fillStyle = force > 0 ? '#22c55e' : '#ef4444';
      ctx.fill();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Angle: ${(pendulumState.angle * 180 / Math.PI).toFixed(1)}°`, 20, 30);
    ctx.fillText(`Cart: ${pendulumState.cartX.toFixed(2)}m`, 20, 52);
    ctx.fillText(`Force: ${force.toFixed(1)}N`, 20, 74);

    if (Math.abs(pendulumState.angle) > Math.PI / 2) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.fillRect(width / 2 - 100, height / 2 - 40, 200, 80);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FALLEN!', width / 2, height / 2 + 8);
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { setIsVisible(entry.isIntersecting); }, { threshold: 0.1 });
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => { if (canvasRef.current) observer.unobserve(canvasRef.current); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!isVisible) return;

    const loop = () => {
      if (isRunning && !hasFallen) {
        const newState = simulate(stateRef.current, kp, kd, controlEnabled);
        stateRef.current = newState;
        setState(newState);
        if (Math.abs(newState.angle) > Math.PI / 2) setHasFallen(true);
      }
      const error = -stateRef.current.angle;
      const derivative = (error - stateRef.current.prevError) / DT;
      const force = controlEnabled ? Math.max(-MAX_FORCE, Math.min(MAX_FORCE, kp * error + kd * derivative)) : 0;
      draw(ctx, stateRef.current, force);
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [simulate, draw, isRunning, isVisible, kp, kd, controlEnabled, hasFallen]);

  const handleReset = () => {
    const initialState = { cartX: 0, cartVelocity: 0, angle: 0.05, angularVelocity: 0, integral: 0, prevError: 0 };
    stateRef.current = initialState;
    setState(initialState);
    setHasFallen(false);
    setKp(DEFAULT_KP);
    setKd(DEFAULT_KD);
    setControlEnabled(true);
  };

  const handlePoke = () => { setState(prev => ({ ...prev, angularVelocity: prev.angularVelocity + (Math.random() - 0.5) * 2 })); };

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-950 rounded-3xl border border-zinc-800">
      <div className="flex-shrink min-w-0 mx-auto">
        <canvas ref={canvasRef} width={CANVAS_WIDTH * DPR} height={CANVAS_HEIGHT * DPR}
          className="rounded-lg w-full max-w-[440px]" style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }} />
      </div>

      <div className="flex flex-col gap-3 px-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-mono text-blue-400 w-8">Kp</label>
          <input type="range" min="0" max="100" step="1" value={kp} onChange={(e) => setKp(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
          <span className="text-sm font-mono text-blue-400 w-12">{kp}</span>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm font-mono text-purple-400 w-8">Kd</label>
          <input type="range" min="0" max="50" step="1" value={kd} onChange={(e) => setKd(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500" />
          <span className="text-sm font-mono text-purple-400 w-12">{kd}</span>
        </div>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex gap-2 items-center">
          <button onClick={handleReset} className="p-2.5 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 rounded-xl transition-all" title="Reset">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
            </svg>
          </button>
          <button onClick={() => setIsRunning(!isRunning)}
            className={`p-2.5 rounded-xl transition-all ${isRunning ? 'bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-white' : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 text-white'}`}
            title={isRunning ? 'Pause' : 'Play'}>
            {isRunning ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
              </svg>
            )}
          </button>
          <button onClick={handlePoke} className="p-2.5 bg-red-600 hover:bg-red-500 active:bg-red-400 text-white rounded-xl transition-all" title="Poke pendulum">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 4l-4 4 4 4"/><path d="M10 8h9"/><path d="M10 16l4 4-4 4"/><path d="M14 20H5"/>
            </svg>
          </button>
          <button onClick={() => setControlEnabled(!controlEnabled)}
            className={`p-2.5 rounded-xl transition-all ${controlEnabled ? 'bg-green-600 hover:bg-green-500 active:bg-green-400 text-white' : 'bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300'}`}
            title={controlEnabled ? 'Control ON' : 'Control OFF'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6"/><path d="M1 12h6m6 0h6"/>
            </svg>
          </button>
        </div>
        <div className="flex gap-2 font-mono text-xs">
          <div className="px-3 py-1.5 bg-zinc-900 rounded-xl"><span className="text-zinc-500">Angle:</span> <span className={Math.abs(state.angle) > 0.2 ? 'text-red-400' : 'text-green-400'}>{(state.angle * 180 / Math.PI).toFixed(1)}°</span></div>
          <div className="px-3 py-1.5 bg-zinc-900 rounded-xl"><span className="text-zinc-500">Ctrl:</span> <span className={controlEnabled ? 'text-green-400' : 'text-red-400'}>{controlEnabled ? 'ON' : 'OFF'}</span></div>
        </div>
      </div>

      <p className="text-xs text-zinc-500 text-center px-4">
        Try turning off the control to see how quickly the pendulum falls. The D term is crucial for stability—try setting Kd to 0!
      </p>
    </div>
  );
}
