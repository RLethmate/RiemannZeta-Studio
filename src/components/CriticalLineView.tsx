import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, ArrowRight } from 'lucide-react';
import { cAbs, formatComplex, hardyZ, riemannSiegelTheta, zeta } from '../math/complex';
import type { ZetaZero } from '../math/zeros';
import { MathFormula } from './MathFormula';

interface CriticalLineViewProps {
  zeros: ZetaZero[];
  selectedZeroIndex: number;
  onSelectZero: (index: number) => void;
  onJumpToComplex: (gamma: number) => void;
  onJumpToPrimes: (zeroIndex: number) => void;
}

export function CriticalLineView({
  zeros,
  selectedZeroIndex,
  onSelectZero,
  onJumpToComplex,
  onJumpToPrimes,
}: CriticalLineViewProps) {
  const initialZero = zeros[selectedZeroIndex]?.gamma ?? 14.134725;
  const [tStart, setTStart] = useState(() => Math.max(0, Math.floor(initialZero - 12)));
  const [windowSpan, setWindowSpan] = useState(32);
  const [tCursor, setTCursor] = useState(initialZero);
  const [showMagnitude, setShowMagnitude] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [zeroSearch, setZeroSearch] = useState('');

  const zCanvasRef = useRef<HTMLCanvasElement>(null);
  const zContainerRef = useRef<HTMLDivElement>(null);
  const spiralCanvasRef = useRef<HTMLCanvasElement>(null);
  const spiralContainerRef = useRef<HTMLDivElement>(null);

  const [zSize, setZSize] = useState({ width: 720, height: 270 });
  const [spiralSize, setSpiralSize] = useState({ width: 340, height: 260 });

  const tCursorRef = useRef(tCursor);
  tCursorRef.current = tCursor;
  const tStartRef = useRef(tStart);
  tStartRef.current = tStart;

  // Sync window when external zero selection changes
  useEffect(() => {
    const target = zeros[selectedZeroIndex];
    if (!target) return;
    setTCursor(target.gamma);
    if (target.gamma < tStartRef.current + 2 || target.gamma > tStartRef.current + windowSpan - 2) {
      setTStart(Math.max(0, target.gamma - windowSpan * 0.45));
    }
  }, [selectedZeroIndex, zeros, windowSpan]);

  // Playback loop along t
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let last = performance.now();

    function tick(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const next = tCursorRef.current + dt * 2.2 * playSpeed;
      const wrapped = next > 240 ? 10 : next;
      tCursorRef.current = wrapped;
      setTCursor(wrapped);

      const curStart = tStartRef.current;
      if (wrapped < curStart + 2 || wrapped > curStart + windowSpan - 2) {
        const nextStart = Math.max(0, Math.min(240 - windowSpan, wrapped - windowSpan * 0.35));
        tStartRef.current = nextStart;
        setTStart(nextStart);
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, playSpeed, windowSpan]);

  // Observe container sizes
  useEffect(() => {
    const observers: ResizeObserver[] = [];
    if (zContainerRef.current) {
      const obs = new ResizeObserver((entries) => {
        for (const e of entries) {
          setZSize({
            width: Math.max(320, Math.floor(e.contentRect.width)),
            height: Math.max(200, Math.floor(e.contentRect.height)),
          });
        }
      });
      obs.observe(zContainerRef.current);
      observers.push(obs);
    }
    if (spiralContainerRef.current) {
      const obs = new ResizeObserver((entries) => {
        for (const e of entries) {
          setSpiralSize({
            width: Math.max(240, Math.floor(e.contentRect.width)),
            height: Math.max(200, Math.floor(e.contentRect.height)),
          });
        }
      });
      obs.observe(spiralContainerRef.current);
      observers.push(obs);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // Sample Hardy Z(t) and |zeta(1/2+it)| across visible window
  const curveSamples = useMemo(() => {
    const count = 420;
    const tEnd = tStart + windowSpan;
    const pts: { t: number; z: number; abs: number }[] = [];
    let maxAbs = 2.5;
    for (let i = 0; i <= count; i++) {
      const t = tStart + (i / count) * windowSpan;
      const zVal = hardyZ(t);
      const absVal = Math.abs(zVal);
      if (absVal > maxAbs) maxAbs = absVal;
      pts.push({ t, z: zVal, abs: absVal });
    }
    return { pts, tEnd, maxY: Math.min(8, Math.max(2.6, maxAbs * 1.15)) };
  }, [tStart, windowSpan]);

  // Draw Hardy Z(t) chart
  useEffect(() => {
    const canvas = zCanvasRef.current;
    if (!canvas) return;
    const { width, height } = zSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07090E';
    ctx.fillRect(0, 0, width, height);

    const padL = 44;
    const padR = 16;
    const padT = 18;
    const padB = 28;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const tEnd = tStart + windowSpan;
    const maxY = curveSamples.maxY;

    const toX = (t: number) => padL + ((t - tStart) / windowSpan) * plotW;
    const toY = (val: number) => padT + plotH * 0.5 - (val / maxY) * (plotH * 0.48);

    // Subtle horizontal grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#FFFFFF';

    for (const yTick of [-2, -1, 0, 1, 2]) {
      if (Math.abs(yTick) > maxY) continue;
      const py = toY(yTick);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(width - padR, py);
      ctx.stroke();
      ctx.fillText(yTick.toString(), 12, py + 3);
    }

    // Zero line (stronger)
    const zeroY = toY(0);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(width - padR, zeroY);
    ctx.stroke();

    // Vertical t ticks
    const tickStep = windowSpan <= 16 ? 2 : windowSpan <= 36 ? 5 : 10;
    const firstTick = Math.ceil(tStart / tickStep) * tickStep;
    for (let t = firstTick; t <= tEnd; t += tickStep) {
      const px = toX(t);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, height - padB);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(t.toFixed(0), px - 6, height - 10);
    }

    // Optional |zeta(1/2+it)| dashed envelope
    if (showMagnitude) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      curveSamples.pts.forEach((p, idx) => {
        const px = toX(p.t);
        const py = toY(p.abs);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }

    // Hardy Z(t) solid curve
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    curveSamples.pts.forEach((p, idx) => {
      const px = toX(p.t);
      const py = toY(p.z);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Zero crossing dots
    const selectedZero = zeros[selectedZeroIndex];
    for (const z of zeros) {
      if (z.gamma < tStart || z.gamma > tEnd) continue;
      const px = toX(z.gamma);
      const isSelected = selectedZero && z.index === selectedZero.index;

      ctx.beginPath();
      ctx.arc(px, zeroY, isSelected ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#F59E0B' : '#FBBF24';
      ctx.fill();
      ctx.strokeStyle = '#07090E';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (windowSpan <= 45 || isSelected) {
        ctx.fillStyle = isSelected ? '#FDE68A' : '#94A3B8';
        ctx.font = `${isSelected ? '600' : '400'} 10px "IBM Plex Mono", monospace`;
        ctx.fillText(`γ${z.index}`, px - 8, zeroY - 9);
      }
    }

    // Active tCursor vertical hairline
    if (tCursor >= tStart && tCursor <= tEnd) {
      const cx = toX(tCursor);
      const cy = toY(hardyZ(tCursor));
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, padT);
      ctx.lineTo(cx, height - padB);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [zSize, tStart, windowSpan, curveSamples, showMagnitude, zeros, selectedZeroIndex, tCursor]);

  // Draw complex spiral zeta(1/2 + it) around tCursor
  useEffect(() => {
    const canvas = spiralCanvasRef.current;
    if (!canvas) return;
    const { width, height } = spiralSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07090E';
    ctx.fillRect(0, 0, width, height);

    const trailSpan = 4.2;
    const startTau = Math.max(0, tCursor - trailSpan);
    const steps = 220;
    const trail: { re: number; im: number }[] = [];
    let maxCoord = 2.2;

    for (let i = 0; i <= steps; i++) {
      const tau = startTau + (i / steps) * (tCursor - startTau);
      const val = zeta({ re: 0.5, im: tau }, 'high');
      trail.push(val);
      maxCoord = Math.max(maxCoord, Math.abs(val.re), Math.abs(val.im));
    }

    const scale = (Math.min(width, height) * 0.42) / Math.min(5.5, maxCoord * 1.12);
    const cx = width * 0.5;
    const cy = height * 0.5;
    const toPx = (re: number, im: number) => ({
      x: cx + re * scale,
      y: cy - im * scale,
    });

    // Axes through origin (0, 0)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();

    // Unit circle reference
    ctx.beginPath();
    ctx.arc(cx, cy, scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.stroke();

    // Origin zero target
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Trajectory with fading trail
    for (let i = 1; i < trail.length; i++) {
      const alpha = 0.12 + 0.88 * Math.pow(i / trail.length, 1.4);
      const p0 = toPx(trail[i - 1].re, trail[i - 1].im);
      const p1 = toPx(trail[i].re, trail[i].im);
      ctx.strokeStyle = `rgba(6, 182, 212, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // Head dot
    const head = trail[trail.length - 1];
    if (head) {
      const hp = toPx(head.re, head.im);
      const isNearZero = Math.hypot(head.re, head.im) < 0.08;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = isNearZero ? '#F59E0B' : '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.fillStyle = '#94A3B8';
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillText('Re(ζ)', width - 38, cy - 6);
    ctx.fillText('Im(ζ)', cx + 6, 14);
  }, [spiralSize, tCursor]);

  const currentZeta = useMemo(() => zeta({ re: 0.5, im: tCursor }, 'high'), [tCursor]);
  const currentHardy = useMemo(() => hardyZ(tCursor), [tCursor]);
  const currentTheta = useMemo(() => riemannSiegelTheta(tCursor), [tCursor]);

  const filteredZeros = useMemo(() => {
    const q = zeroSearch.trim();
    if (!q) return zeros;
    return zeros.filter(
      (z) =>
        z.index.toString().includes(q) ||
        z.gamma.toFixed(4).includes(q)
    );
  }, [zeros, zeroSearch]);

  const handleZChartPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1 && e.type === 'pointermove') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const padL = 44;
    const padR = 16;
    const plotW = zSize.width - padL - padR;
    const ratio = Math.max(0, Math.min(1, (px - padL) / plotW));
    const tVal = tStart + ratio * windowSpan;

    // Snap to nearby zero if clicked within ~0.35 units
    if (e.type === 'pointerdown') {
      for (let i = 0; i < zeros.length; i++) {
        if (Math.abs(zeros[i].gamma - tVal) < Math.max(0.25, windowSpan * 0.015)) {
          onSelectZero(i);
          setTCursor(zeros[i].gamma);
          return;
        }
      }
    }
    setTCursor(tVal);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-[640px] gap-4 p-4">
      {/* Left Main Stage */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Top Chart: Hardy Z(t) */}
        <div className="rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-2.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Hardy-Z-Funktion auf der kritischen Geraden (Re(s) = ½)
              </h2>
              <p className="text-xs text-slate-400">
                Vorzeichenwechsel von Z(t) markieren exakt die nicht-trivialen Nullstellen. Klicken zum Abtasten.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showMagnitude}
                onChange={(e) => setShowMagnitude(e.target.checked)}
                className="accent-amber-500 h-3.5 w-3.5 cursor-pointer"
              />
              <span>|ζ(½ + it)| Einhüllende</span>
            </label>
          </div>
          <div ref={zContainerRef} className="h-[260px] w-full relative">
            <canvas
              ref={zCanvasRef}
              onPointerDown={handleZChartPointer}
              onPointerMove={handleZChartPointer}
              className="h-full w-full block cursor-crosshair touch-none"
            />
          </div>
        </div>

        {/* Bottom Split: Spiral + First 100 Zeros Table */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[290px]">
          {/* Complex Value Plane Spiral */}
          <div className="rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden flex flex-col">
            <div className="border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Wertebenen-Spirale ζ(½ + it)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Durchquert den Ursprung (0, 0) bei jeder Nullstelle
                </p>
              </div>
              <span className="font-mono text-xs text-cyan-300 tabular-nums">
                t = {tCursor.toFixed(3)}
              </span>
            </div>
            <div ref={spiralContainerRef} className="flex-1 min-h-[220px] relative">
              <canvas ref={spiralCanvasRef} className="h-full w-full block" />
            </div>
          </div>

          {/* First 100 Zeros Catalog */}
          <div className="rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden flex flex-col">
            <div className="border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 whitespace-nowrap">
                Erste 100 Nullstellen
              </h3>
              <input
                type="text"
                value={zeroSearch}
                onChange={(e) => setZeroSearch(e.target.value)}
                placeholder="Nr. oder γ suchen…"
                className="w-36 rounded-md border border-slate-800 bg-[#07090E] px-2.5 py-1 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto max-h-[250px]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#0B0E17] border-b border-slate-800 text-[11px] font-mono text-slate-500">
                  <tr>
                    <th className="py-2 px-3 font-medium">n</th>
                    <th className="py-2 px-3 font-medium">γₙ (Imaginärteil)</th>
                    <th className="py-2 px-3 font-medium text-right">Abstand Δγ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-xs tabular-nums">
                  {filteredZeros.map((z) => {
                    const isSelected = z.index - 1 === selectedZeroIndex;
                    return (
                      <tr
                        key={z.index}
                        onClick={() => {
                          onSelectZero(z.index - 1);
                          setTCursor(z.gamma);
                          setIsPlaying(false);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber-500/15 text-amber-200'
                            : 'text-slate-300 hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-1.5 px-3 text-slate-400">#{z.index}</td>
                        <td className="py-1.5 px-3 font-medium">{z.gamma.toFixed(6)}</td>
                        <td className="py-1.5 px-3 text-right text-slate-400">
                          {z.spacing !== null ? z.spacing.toFixed(4) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Right Control & Concept Deck */}
      <aside className="w-full lg:w-[360px] shrink-0 flex flex-col gap-4">
        {/* Live Telemetry */}
        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Messwerte bei s = ½ + it
          </h2>
          <div className="mt-3 space-y-2.5 font-mono text-sm tabular-nums">
            <div className="flex items-baseline justify-between border-b border-slate-800/70 pb-2">
              <span className="text-xs text-slate-400">Position t</span>
              <span className="text-slate-100 font-semibold">{tCursor.toFixed(6)}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-slate-800/70 pb-2">
              <span className="text-xs text-slate-400">Hardy Z(t)</span>
              <span
                className={`font-semibold ${
                  Math.abs(currentHardy) < 0.02 ? 'text-amber-300' : 'text-cyan-300'
                }`}
              >
                {currentHardy.toFixed(6)}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-b border-slate-800/70 pb-2">
              <span className="text-xs text-slate-400">ζ(½ + it)</span>
              <span className="text-slate-200 text-xs">{formatComplex(currentZeta, 4)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-0.5">
              <div>
                <div className="text-[11px] text-slate-500">Betrag |ζ|</div>
                <div className="text-sm font-semibold text-slate-100">
                  {cAbs(currentZeta).toFixed(5)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Phase ϑ(t)</div>
                <div className="text-sm font-semibold text-slate-100">
                  {currentTheta.toFixed(4)} rad
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Playback & Window Controls */}
        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-500/15 border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Entlang Gerader fahren'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                onSelectZero(0);
                setTStart(0);
                setWindowSpan(32);
                setTCursor(zeros[0]?.gamma ?? 14.134725);
              }}
              title="Zurücksetzen"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-[#07090E] text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Fein-Position t im Fenster</span>
              <span className="font-mono text-slate-200 tabular-nums">{tCursor.toFixed(3)}</span>
            </div>
            <input
              type="range"
              min={tStart}
              max={tStart + windowSpan}
              step={0.01}
              value={tCursor}
              onChange={(e) => {
                setIsPlaying(false);
                setTCursor(parseFloat(e.target.value));
              }}
              className="obs-slider w-full"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Fenster-Start t_min</span>
              <span className="font-mono text-slate-200 tabular-nums">{tStart.toFixed(0)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={215}
              step={1}
              value={tStart}
              onChange={(e) => {
                const nextStart = parseFloat(e.target.value);
                setTStart(nextStart);
                setTCursor((c) => Math.max(nextStart, Math.min(nextStart + windowSpan, c)));
              }}
              className="obs-slider w-full"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-400">Zoombreite Δt</span>
            <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#07090E] p-0.5">
              {[16, 32, 60].map((span) => (
                <button
                  key={span}
                  type="button"
                  onClick={() => setWindowSpan(span)}
                  className={`px-2 py-1 rounded text-xs font-mono cursor-pointer transition-colors ${
                    windowSpan === span
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {span}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#07090E] p-0.5">
              {[0.5, 1, 2].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setPlaySpeed(spd)}
                  className={`px-2 py-1 rounded text-xs font-mono cursor-pointer transition-colors ${
                    playSpeed === spd
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {spd}×
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onJumpToComplex(tCursor)}
              className="inline-flex items-center justify-between rounded-lg border border-slate-800 bg-[#07090E] px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              <span>Punkt ½ + {tCursor.toFixed(2)}i in ℂ anzeigen</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onJumpToPrimes(selectedZeroIndex)}
              className="inline-flex items-center justify-between rounded-lg border border-slate-800 bg-[#07090E] px-3 py-2 text-xs font-medium text-slate-200 hover:border-amber-500/40 hover:text-amber-300 transition-colors cursor-pointer"
            >
              <span>Welle von ρ{selectedZeroIndex + 1} bei Primzahlen testen</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        {/* Contextual Explanation */}
        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] p-4 text-xs leading-relaxed text-slate-300">
          <h3 className="font-semibold text-slate-100 mb-1.5">
            Warum die Hardy-Z-Funktion?
          </h3>
          <p className="text-slate-400">
            Durch Drehung um den Riemann-Siegel-Winkel <MathFormula tex="\vartheta(t)" /> wird{' '}
            <MathFormula tex="Z(t) = e^{i\vartheta(t)}\zeta(\tfrac{1}{2}+it)" /> streng reell, behält aber denselben Betrag{' '}
            <MathFormula tex="|Z(t)| = |\zeta(\tfrac{1}{2}+it)|" />. Damit lässt sich jede Nullstelle eindeutig über einen Vorzeichenwechsel nachweisen.
          </p>
        </section>
      </aside>
    </div>
  );
}
