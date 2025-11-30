import React, { useRef, useEffect, useState, useCallback } from 'react';

interface OvenState {
  temperature: number;
  integral: number;
  prevError: number;
}

const THERMAL_MASS = 50;
const HEAT_LOSS_COEFF = 0.02;
const HEATER_POWER = 100;
const DT = 1 / 30;
const AMBIENT_TEMP = 70;
const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 2;
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 440;
const DEFAULT_KP = 5;
const DEFAULT_KI = 0.5;
const DEFAULT_KD = 2;
const DEFAULT_TARGET_TEMP = 350;

export default function OvenController() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<OvenState>({ temperature: AMBIENT_TEMP, integral: 0, prevError: 0 });
  const stateRef = useRef<OvenState>(state);
  const [targetTemp, setTargetTemp] = useState(DEFAULT_TARGET_TEMP);
  const [kp, setKp] = useState(DEFAULT_KP);
  const [ki, setKi] = useState(DEFAULT_KI);
  const [kd, setKd] = useState(DEFAULT_KD);
  const [doorOpen, setDoorOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [heaterPower, setHeaterPower] = useState(0);
  const historyRef = useRef<{ temp: number; target: number }[]>([]);
  const animationRef = useRef<number>();

  const simulate = useCallback((currentState: OvenState, target: number, kpVal: number, kiVal: number, kdVal: number, isDoorOpen: boolean) => {
    const error = target - currentState.temperature;
    const newIntegral = Math.max(-1000, Math.min(1000, currentState.integral + error * DT));
    const derivative = (error - currentState.prevError) / DT;
    
    const pTerm = kpVal * error;
    const iTerm = kiVal * newIntegral;
    const dTerm = kdVal * derivative;
    const heaterOutput = Math.max(0, Math.min(100, (pTerm + iTerm + dTerm) / 2));
    setHeaterPower(heaterOutput);

    const heatInput = (heaterOutput / 100) * HEATER_POWER;
    const heatLoss = HEAT_LOSS_COEFF * (currentState.temperature - AMBIENT_TEMP) * (isDoorOpen ? 5 : 1);
    const tempChange = (heatInput - heatLoss) / THERMAL_MASS;
    const newTemp = currentState.temperature + tempChange * DT * 60;

    return { temperature: newTemp, integral: newIntegral, prevError: error };
  }, []);

  const drawOven = useCallback((ctx: CanvasRenderingContext2D, temp: number, target: number, power: number, history: { temp: number; target: number }[], isDoorOpen: boolean) => {
    const width = ctx.canvas.width / DPR;
    const height = ctx.canvas.height / DPR;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const ovenX = 40;
    const ovenY = 40;
    const ovenWidth = 200;
    const ovenHeight = 160;

    const glowIntensity = Math.min((temp - AMBIENT_TEMP) / 400, 1);
    const gradient = ctx.createRadialGradient(ovenX + ovenWidth / 2, ovenY + ovenHeight / 2, 0, ovenX + ovenWidth / 2, ovenY + ovenHeight / 2, ovenWidth);
    gradient.addColorStop(0, `rgba(255, ${100 - glowIntensity * 100}, 0, ${glowIntensity * 0.5})`);
    gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width / 2, height);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(ovenX, ovenY, ovenWidth, ovenHeight);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.strokeRect(ovenX, ovenY, ovenWidth, ovenHeight);

    const interiorColor = `rgb(${Math.min(255, 50 + glowIntensity * 200)}, ${Math.max(30, 50 - glowIntensity * 20)}, ${Math.max(20, 30 - glowIntensity * 10)})`;
    ctx.fillStyle = interiorColor;
    ctx.fillRect(ovenX + 10, ovenY + 10, ovenWidth - 20, ovenHeight - 20);

    if (power > 10) {
      ctx.strokeStyle = `rgba(255, ${255 - power * 2}, 0, ${power / 100})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const y = ovenY + ovenHeight - 25;
        const startX = ovenX + 20 + i * 35;
        ctx.moveTo(startX, y);
        ctx.bezierCurveTo(startX + 10, y - 10, startX + 20, y + 10, startX + 30, y);
      }
      ctx.stroke();
    }

    if (isDoorOpen) {
      ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
      ctx.fillRect(ovenX + 10, ovenY + 10, ovenWidth - 20, ovenHeight - 20);
      ctx.fillStyle = '#60a5fa';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DOOR OPEN', ovenX + ovenWidth / 2, ovenY + ovenHeight / 2);
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(ovenX + ovenWidth + 20, ovenY, 100, 50);
    ctx.fillStyle = temp > target + 20 ? '#ef4444' : '#22c55e';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(temp)}°F`, ovenX + ovenWidth + 70, ovenY + 35);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText(`Target: ${target}°F`, ovenX + ovenWidth + 70, ovenY + 70);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(ovenX, ovenY + ovenHeight + 25, ovenWidth, 18);
    ctx.fillStyle = power > 80 ? '#ef4444' : power > 50 ? '#f59e0b' : '#22c55e';
    ctx.fillRect(ovenX, ovenY + ovenHeight + 25, ovenWidth * (power / 100), 18);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Heater: ${Math.round(power)}%`, ovenX, ovenY + ovenHeight + 60);

    const plotX = 45;
    const plotY = height - 180;
    const plotWidth = width - 90;
    const plotHeight = 150;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.strokeRect(plotX, plotY, plotWidth, plotHeight);

    for (let i = 1; i < 4; i++) {
      const y = plotY + plotHeight * i / 4;
      ctx.beginPath();
      ctx.moveTo(plotX, y);
      ctx.lineTo(plotX + plotWidth, y);
      ctx.strokeStyle = '#1e293b';
      ctx.stroke();
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('500°', plotX - 8, plotY + 10);
    ctx.fillText('250°', plotX - 8, plotY + plotHeight / 2 + 4);
    ctx.fillText('0°', plotX - 8, plotY + plotHeight);

    if (history.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      for (let i = 0; i < history.length; i++) {
        const x = plotX + plotWidth * i / (history.length - 1);
        const y = plotY + plotHeight * (1 - history[i].target / 500);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (history.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      for (let i = 0; i < history.length; i++) {
        const x = plotX + plotWidth * i / (history.length - 1);
        const y = plotY + plotHeight * (1 - Math.min(history[i].temp, 500) / 500);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Temperature over time', plotX, plotY - 15);

    const legendY = plotY - 15;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(plotX + plotWidth - 120, legendY - 8, 8, 8);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('Temp', plotX + plotWidth - 108, legendY);
    
    ctx.strokeStyle = '#fb923c';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plotX + plotWidth - 55, legendY - 4);
    ctx.lineTo(plotX + plotWidth - 42, legendY - 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fb923c';
    ctx.fillText('Target', plotX + plotWidth - 38, legendY);
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
        const newState = simulate(stateRef.current, targetTemp, kp, ki, kd, doorOpen);
        stateRef.current = newState;
        setState(newState);
        historyRef.current.push({ temp: newState.temperature, target: targetTemp });
        if (historyRef.current.length > 300) historyRef.current.shift();
      }
      drawOven(ctx, stateRef.current.temperature, targetTemp, heaterPower, historyRef.current, doorOpen);
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [simulate, drawOven, targetTemp, isRunning, isVisible, kp, ki, kd, doorOpen, heaterPower]);

  const handleReset = () => {
    const initialState = { temperature: AMBIENT_TEMP, integral: 0, prevError: 0 };
    stateRef.current = initialState;
    setState(initialState);
    historyRef.current = [];
    setTargetTemp(DEFAULT_TARGET_TEMP);
    setKp(DEFAULT_KP);
    setKi(DEFAULT_KI);
    setKd(DEFAULT_KD);
    setDoorOpen(false);
  };

  const presets = [{ name: 'Baking', temp: 350 }, { name: 'Broiling', temp: 450 }, { name: 'Low Heat', temp: 200 }];

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-950 rounded-3xl border border-zinc-800">
      <div className="flex-shrink min-w-0 mx-auto">
        <canvas ref={canvasRef} width={CANVAS_WIDTH * DPR} height={CANVAS_HEIGHT * DPR}
          className="rounded-lg w-full max-w-[400px]" style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }} />
      </div>
      
      <div className="flex flex-wrap gap-2 justify-center">
        {presets.map((preset) => (
          <button key={preset.name} onClick={() => setTargetTemp(preset.temp)}
            className={`px-3 py-1.5 rounded-xl text-sm transition-colors ${targetTemp === preset.temp ? 'bg-orange-600 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'}`}>
            {preset.name} ({preset.temp}°F)
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 px-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-mono text-blue-400 w-8">Kp</label>
          <input type="range" min="0.1" max="20" step="0.5" value={kp} onChange={(e) => setKp(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
          <span className="text-sm font-mono text-blue-400 w-12">{kp.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm font-mono text-green-400 w-8">Ki</label>
          <input type="range" min="0" max="2" step="0.05" value={ki} onChange={(e) => setKi(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500" />
          <span className="text-sm font-mono text-green-400 w-12">{ki.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm font-mono text-purple-400 w-8">Kd</label>
          <input type="range" min="0" max="10" step="0.5" value={kd} onChange={(e) => setKd(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500" />
          <span className="text-sm font-mono text-purple-400 w-12">{kd.toFixed(1)}</span>
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
          <button onClick={() => setDoorOpen(!doorOpen)}
            className={`p-2.5 rounded-xl transition-all ${doorOpen ? 'bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-400 text-white' : 'bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300'}`}
            title={doorOpen ? 'Close Door' : 'Open Door'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </button>
        </div>
        <div className="flex gap-2 font-mono text-xs">
          <div className="px-3 py-1.5 bg-zinc-900 rounded-xl"><span className="text-zinc-500">Heat:</span> <span className={heaterPower > 80 ? 'text-red-400' : heaterPower > 50 ? 'text-amber-400' : 'text-green-400'}>{Math.round(heaterPower)}%</span></div>
          <div className="px-3 py-1.5 bg-zinc-900 rounded-xl"><span className="text-zinc-500">Error:</span> <span className="text-red-400">{(targetTemp - state.temperature).toFixed(0)}°</span></div>
        </div>
      </div>
    </div>
  );
}
