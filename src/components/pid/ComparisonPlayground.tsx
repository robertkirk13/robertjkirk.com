import React, { useRef, useEffect, useState, useCallback } from 'react';

interface MotorState {
  angle: number;
  angularVelocity: number;
  integral: number;
  prevError: number;
}

interface ControllerConfig {
  name: string;
  kp: number;
  ki: number;
  kd: number;
  color: string;
  enabled: boolean;
}

const MOMENT_OF_INERTIA = 0.5;
const FRICTION = 0.02;
const MAX_TORQUE = 5;
const DT = 1 / 60;
const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 320;

const initialConfigs: ControllerConfig[] = [
  { name: 'No Control', kp: 0, ki: 0, kd: 0, color: '#64748b', enabled: true },
  { name: 'P Only', kp: 2.0, ki: 0, kd: 0, color: '#3b82f6', enabled: true },
  { name: 'PD', kp: 2.0, ki: 0, kd: 0.8, color: '#a855f7', enabled: true },
  { name: 'PID', kp: 2.0, ki: 0.3, kd: 0.8, color: '#f59e0b', enabled: true },
];

export default function ComparisonPlayground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [configs, setConfigs] = useState<ControllerConfig[]>(initialConfigs);
  const [states, setStates] = useState<MotorState[]>(initialConfigs.map(() => ({ angle: 0, angularVelocity: 0, integral: 0, prevError: 0 })));
  const statesRef = useRef<MotorState[]>(initialConfigs.map(() => ({ angle: 0, angularVelocity: 0, integral: 0, prevError: 0 })));
  const [targetAngle, setTargetAngle] = useState<number>(Math.PI / 2);
  const [disturbance, setDisturbance] = useState(0.2);
  const [isRunning, setIsRunning] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const historiesRef = useRef<number[][]>(initialConfigs.map(() => []));
  const targetHistoryRef = useRef<number[]>([]);
  const animationRef = useRef<number>();

  const normalizeAngle = (angle: number) => {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  };

  const simulate = useCallback((currentState: MotorState, target: number, config: ControllerConfig, disturbanceVal: number): MotorState => {
    const error = normalizeAngle(target - currentState.angle);
    
    if (config.kp === 0 && config.ki === 0 && config.kd === 0) {
      const angularAcceleration = (disturbanceVal - FRICTION * currentState.angularVelocity) / MOMENT_OF_INERTIA;
      return {
        angle: currentState.angle + currentState.angularVelocity * DT,
        angularVelocity: currentState.angularVelocity + angularAcceleration * DT,
        integral: 0, prevError: error,
      };
    }
    
    const newIntegral = currentState.integral + error * DT;
    const derivative = (error - currentState.prevError) / DT;
    const pTerm = config.kp * error;
    const iTerm = config.ki * newIntegral;
    const dTerm = config.kd * derivative;
    const torque = Math.max(-MAX_TORQUE, Math.min(MAX_TORQUE, pTerm + iTerm + dTerm));

    const angularAcceleration = (torque + disturbanceVal - FRICTION * currentState.angularVelocity) / MOMENT_OF_INERTIA;
    const newVelocity = currentState.angularVelocity + angularAcceleration * DT;
    const newAngle = currentState.angle + newVelocity * DT;

    return { angle: newAngle, angularVelocity: newVelocity, integral: newIntegral, prevError: error };
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, currentStates: MotorState[], target: number, histories: number[][], targetHistory: number[], controllerConfigs: ControllerConfig[]) => {
    const width = ctx.canvas.width / DPR;
    const height = ctx.canvas.height / DPR;
    const padding = 50;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = padding + (height - 2 * padding) * i / 6;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('180°', padding - 8, padding + 4);
    ctx.fillText('0°', padding - 8, padding + (height - 2 * padding) / 2 + 4);
    ctx.fillText('-180°', padding - 8, height - padding + 4);

    if (targetHistory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      for (let i = 0; i < targetHistory.length; i++) {
        const x = padding + (width - 2 * padding) * i / (targetHistory.length - 1);
        const y = padding + (height - 2 * padding) * (1 - (targetHistory[i] + Math.PI) / (2 * Math.PI));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    histories.forEach((history, idx) => {
      if (!controllerConfigs[idx].enabled || history.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = controllerConfigs[idx].color;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < history.length; i++) {
        const x = padding + (width - 2 * padding) * i / (history.length - 1);
        const y = padding + (height - 2 * padding) * (1 - (history[i] + Math.PI) / (2 * Math.PI));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Position Comparison', padding, 22);

    const legendX = width - 120;
    let legendY = 22;
    controllerConfigs.forEach((config) => {
      if (!config.enabled) return;
      ctx.fillStyle = config.color;
      ctx.fillRect(legendX, legendY - 8, 10, 10);
      ctx.fillStyle = config.color;
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(config.name, legendX + 14, legendY + 1);
      legendY += 18;
    });

    ctx.fillStyle = '#f97316';
    ctx.fillRect(legendX, legendY - 8, 10, 2);
    ctx.fillStyle = '#fb923c';
    ctx.fillText('Target', legendX + 14, legendY - 2);
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
      if (isRunning) {
        const newStates = statesRef.current.map((state, idx) => simulate(state, targetAngle, configs[idx], disturbance));
        statesRef.current = newStates;
        setStates(newStates);
        newStates.forEach((state, idx) => {
          historiesRef.current[idx].push(normalizeAngle(state.angle));
          if (historiesRef.current[idx].length > 300) historiesRef.current[idx].shift();
        });
        targetHistoryRef.current.push(targetAngle);
        if (targetHistoryRef.current.length > 300) targetHistoryRef.current.shift();
      }
      draw(ctx, statesRef.current, targetAngle, historiesRef.current, targetHistoryRef.current, configs);
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [simulate, draw, targetAngle, isRunning, isVisible, configs, disturbance]);

  const handleReset = () => {
    const initialStates = initialConfigs.map(() => ({ angle: 0, angularVelocity: 0, integral: 0, prevError: 0 }));
    statesRef.current = initialStates;
    setConfigs(initialConfigs);
    setStates(initialStates);
    historiesRef.current = initialConfigs.map(() => []);
    targetHistoryRef.current = [];
    setTargetAngle(Math.PI / 2);
    setDisturbance(0.2);
  };

  const handleTargetChange = (newTarget: number) => { setTargetAngle(newTarget * Math.PI / 180); };
  const toggleController = (idx: number) => { setConfigs(prev => prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c)); };

  const metrics = states.map((state, idx) => ({
    name: configs[idx].name,
    error: (Math.abs(normalizeAngle(targetAngle - state.angle)) * 180 / Math.PI).toFixed(1),
    color: configs[idx].color,
    enabled: configs[idx].enabled,
  }));

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-950 rounded-3xl border border-zinc-800">
      <div className="flex-shrink min-w-0 mx-auto">
        <canvas ref={canvasRef} width={CANVAS_WIDTH * DPR} height={CANVAS_HEIGHT * DPR}
          className="rounded-lg w-full max-w-[500px]" style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }} />
      </div>
      
      <div className="flex flex-wrap gap-2 justify-center">
        {configs.map((config, idx) => (
          <button key={config.name} onClick={() => toggleController(idx)}
            className="px-3 py-1.5 rounded-xl text-sm transition-colors border-2"
            style={{ backgroundColor: config.enabled ? config.color : 'transparent', borderColor: config.color, color: config.enabled ? '#fff' : config.color }}>
            {config.name}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left py-2 px-2">Controller</th>
              <th className="text-right py-2 px-2">Current Error</th>
            </tr>
          </thead>
          <tbody>
            {metrics.filter(m => m.enabled).map((m) => (
              <tr key={m.name} className="border-b border-zinc-800/50">
                <td className="py-2 px-2" style={{ color: m.color }}>{m.name}</td>
                <td className="text-right py-2 px-2">{m.error}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 px-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-mono text-orange-400 w-16">Target</label>
          <input type="range" min="-180" max="180" step="10" value={targetAngle * 180 / Math.PI}
            onChange={(e) => handleTargetChange(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500" />
          <span className="text-sm font-mono text-orange-400 w-12">{(targetAngle * 180 / Math.PI).toFixed(0)}°</span>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm font-mono text-amber-400 w-16">Disturb</label>
          <input type="range" min="0" max="1" step="0.05" value={disturbance}
            onChange={(e) => setDisturbance(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500" />
          <span className="text-sm font-mono text-amber-400 w-12">{disturbance.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex gap-2 items-center">
          <button onClick={handleReset} className="p-2.5 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 rounded-xl transition-all" title="Reset All">
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
          <button onClick={() => handleTargetChange((Math.random() - 0.5) * 360)}
            className="p-2.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-400 text-white rounded-xl transition-all" title="Random Target">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <circle cx="12" cy="12" r="4"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
