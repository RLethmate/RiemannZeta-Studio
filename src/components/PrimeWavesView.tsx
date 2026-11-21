import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Plus, Minus } from 'lucide-react';
import {
  exactPrimePi,
  LiOffset,
  mobius,
  reEi,
  riemannBigPiApprox,
  sievePrimes,
  singleZeroHarmonic,
} from '../math/primes';
import type { ZetaZero } from '../math/zeros';
import { MathFormula } from './MathFormula';

interface PrimeWavesViewProps {
  zeros: ZetaZero[];
  selectedZeroIndex: number;
  onSelectZero: (index: number) => void;
  numZeros: number;
  onNumZerosChange: (n: number) => void;
}

const MAX_HARMONICS = 80;

export function PrimeWavesView({
  zeros,
  selectedZeroIndex,
  onSelectZero,
  numZeros,
  onNumZerosChange,
}: PrimeWavesViewProps) {
  const [xMax, setXMax] = useState(65);
  const [showLi, setShowLi] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveContainerRef = useRef<HTMLDivElement>(null);

  const [mainSize, setMainSize] = useState({ width: 720, height: 320 });
  const [waveSize, setWaveSize] = useState({ width: 720, height: 185 });

  const primes = useMemo(() => sievePrimes(220), []);
  const gammas = useMemo(() => zeros.map((z) => z.gamma), [zeros]);

  // Resize observers
  useEffect(() => {
    const obsList: ResizeObserver[] = [];
    if (mainContainerRef.current) {
      const obs = new ResizeObserver((entries) => {
        for (const e of entries) {
          setMainSize({
            width: Math.max(320, Math.floor(e.contentRect.width)),
            height: Math.max(240, Math.floor(e.contentRect.height)),
          });
        }
      });
      obs.observe(mainContainerRef.current);
      obsList.push(obs);
    }
    if (waveContainerRef.current) {
      const obs = new ResizeObserver((entries) => {
        for (const e of entries) {
          setWaveSize({
            width: Math.max(320, Math.floor(e.contentRect.width)),
            height: Math.max(150, Math.floor(e.contentRect.height)),
          });
        }
      });
      obs.observe(waveContainerRef.current);
      obsList.push(obs);
    }
    return () => obsList.forEach((o) => o.disconnect());
  }, []);

  // Animate N = 0 -> MAX_HARMONICS
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      onNumZerosChange(numZeros >= MAX_HARMONICS ? 0 : numZeros + 1);
    }, 180);
    return () => window.clearInterval(interval);
  }, [isPlaying, numZeros, onNumZerosChange]);

  // Precompute grid & per-zero harmonic contributions whenever xMax changes
  const precomputed = useMemo(() => {
    const gridCount = 280;
    const xMin = 2.0;
    const xs: number[] = [];
    const exactPi: number[] = [];
    const liVals: number[] = [];
    const baseR: number[] = [];

    const maxK = Math.min(MAX_HARMONICS, gammas.length);
    const deltas: Float64Array[] = Array.from(
      { length: maxK },
      () => new Float64Array(gridCount + 1)
    );

    const maxM = Math.max(1, Math.floor(Math.log2(xMax)));
    const mobiusList: { m: number; coeff: number }[] = [];
    for (let m = 1; m <= maxM; m++) {
      const mu = mobius(m);
      if (mu !== 0) mobiusList.push({ m, coeff: mu / m });
    }

    for (let i = 0; i <= gridCount; i++) {
      const x = xMin + (i / gridCount) * (xMax - xMin);
      xs.push(x);
      exactPi.push(exactPrimePi(x, primes));
      liVals.push(LiOffset(x));

      // Riemann R(x) (0 zeros)
      let rSum = 0;
      for (const { m, coeff } of mobiusList) {
        const rootX = Math.pow(x, 1 / m);
        if (rootX > 1.02) {
          rSum += coeff * riemannBigPiApprox(rootX, gammas, 0);
        }
      }
      baseR.push(rSum);

      // Each zero pair's exact Mobius-inverted contribution
      for (let k = 0; k < maxK; k++) {
        const g = gammas[k];
        let contrib = 0;
        for (const { m, coeff } of mobiusList) {
          const rootX = Math.pow(x, 1 / m);
          if (rootX <= 1.02) continue;
          const lnRoot = Math.log(rootX);
          contrib -= coeff * 2 * reEi(0.5 * lnRoot, g * lnRoot);
        }
        deltas[k][i] = contrib;
      }
    }

    return { xs, exactPi, liVals, baseR, deltas, gridCount };
  }, [xMax, primes, gammas]);

  // Sum first N zero contributions instantaneously
  const riemannCurve = useMemo(() => {
    const { baseR, deltas, gridCount } = precomputed;
    const count = Math.min(numZeros, deltas.length);
    const out = new Float64Array(gridCount + 1);
    for (let i = 0; i <= gridCount; i++) {
      let val = baseR[i];
      for (let k = 0; k < count; k++) {
        val += deltas[k][i];
      }
      out[i] = val;
    }
    return out;
  }, [precomputed, numZeros]);

  // Compute mean absolute error over grid
  const meanError = useMemo(() => {
    const { exactPi, gridCount } = precomputed;
    let err = 0;
    for (let i = 0; i <= gridCount; i++) {
      err += Math.abs(riemannCurve[i] - exactPi[i]);
    }
    return err / (gridCount + 1);
  }, [precomputed, riemannCurve]);

  // Draw primary prime-counting comparison chart
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const { width, height } = mainSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07090E';
    ctx.fillRect(0, 0, width, height);

    const padL = 48;
    const padR = 20;
    const padT = 18;
    const padB = 30;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxY = Math.max(
      10,
      precomputed.exactPi[precomputed.gridCount] * 1.12,
      precomputed.liVals[precomputed.gridCount] * 1.05
    );
    const toX = (x: number) => padL + ((x - 2) / (xMax - 2)) * plotW;
    const toY = (y: number) => padT + plotH - (Math.max(-1, y) / maxY) * plotH;

    // Grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#64748B';

    const yStep = maxY <= 20 ? 5 : maxY <= 45 ? 10 : 15;
    for (let y = 0; y <= maxY; y += yStep) {
      const py = toY(y);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(width - padR, py);
      ctx.stroke();
      ctx.fillText(y.toString(), 14, py + 3);
    }

    const xStep = xMax <= 40 ? 5 : xMax <= 90 ? 10 : 20;
    for (let x = 10; x <= xMax; x += xStep) {
      const px = toX(x);
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, height - padB);
      ctx.stroke();
      ctx.fillText(x.toString(), px - 6, height - 10);
    }

    // Subtle vertical markers at primes <= xMax (when xMax <= 75)
    if (xMax <= 75) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.1)';
      for (const p of primes) {
        if (p > xMax) break;
        const px = toX(p);
        ctx.beginPath();
        ctx.moveTo(px, padT);
        ctx.lineTo(px, height - padB);
        ctx.stroke();
      }
    }

    // Li(x) reference curve
    if (showLi) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      precomputed.xs.forEach((x, i) => {
        const px = toX(x);
        const py = toY(precomputed.liVals[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }

    // Exact pi(x) step function (amber)
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let prevCount = 0;
    ctx.moveTo(toX(2), toY(1));
    prevCount = 1;
    for (const p of primes) {
      if (p > xMax) break;
      if (p === 2) continue;
      const px = toX(p);
      ctx.lineTo(px, toY(prevCount));
      prevCount += 1;
      ctx.lineTo(px, toY(prevCount));
    }
    ctx.lineTo(toX(xMax), toY(prevCount));
    ctx.stroke();

    // Riemann explicit approximation pi_N(x) (cyan)
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    precomputed.xs.forEach((x, i) => {
      const px = toX(x);
      const py = toY(riemannCurve[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Hover crosshair
    if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx <= precomputed.gridCount) {
      const hx = toX(precomputed.xs[hoverIdx]);
      const hyR = toY(riemannCurve[hoverIdx]);
      const hyPi = toY(precomputed.exactPi[hoverIdx]);

      ctx.save();
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, height - padB);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(hx, hyPi, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#F59E0B';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(hx, hyR, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#06B6D4';
      ctx.fill();
    }
  }, [mainSize, xMax, precomputed, riemannCurve, primes, showLi, hoverIdx]);

  // Draw individual zero harmonic wave chart
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const { width, height } = waveSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07090E';
    ctx.fillRect(0, 0, width, height);

    const padL = 48;
    const padR = 20;
    const padT = 16;
    const padB = 26;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const selectedGamma = zeros[selectedZeroIndex]?.gamma ?? 14.134725;
    const samples = 280;
    const pts: { x: number; y: number }[] = [];
    let maxAmp = 0.25;

    for (let i = 0; i <= samples; i++) {
      const x = 2 + (i / samples) * (xMax - 2);
      const y = singleZeroHarmonic(x, selectedGamma);
      if (Math.abs(y) > maxAmp) maxAmp = Math.abs(y);
      pts.push({ x, y });
    }

    const toX = (x: number) => padL + ((x - 2) / (xMax - 2)) * plotW;
    const toY = (val: number) =>
      padT + plotH * 0.5 - (val / (maxAmp * 1.15)) * (plotH * 0.45);

    // Zero baseline
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, toY(0));
    ctx.lineTo(width - padR, toY(0));
    ctx.stroke();

    // Subtle overlay of gamma_1 for scale reference if user selected a higher zero
    if (selectedZeroIndex > 0 && zeros[0]) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const x = 2 + (i / samples) * (xMax - 2);
        const y = singleZeroHarmonic(x, zeros[0].gamma);
        const px = toX(x);
        const py = toY(y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Selected zero wave
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    pts.forEach((p, idx) => {
      const px = toX(p.x);
      const py = toY(p.y);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillText(`+${maxAmp.toFixed(2)}`, 10, padT + 8);
    ctx.fillText(`-${maxAmp.toFixed(2)}`, 10, height - padB);
  }, [waveSize, xMax, zeros, selectedZeroIndex]);

  const handleMainPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const padL = 48;
    const padR = 20;
    const plotW = mainSize.width - padL - padR;
    const ratio = Math.max(0, Math.min(1, (px - padL) / plotW));
    setHoverIdx(Math.round(ratio * precomputed.gridCount));
  };

  const inspectIdx = hoverIdx ?? Math.floor(precomputed.gridCount * 0.72);
  const inspectX = precomputed.xs[inspectIdx] ?? xMax;
  const inspectExact = precomputed.exactPi[inspectIdx] ?? 0;
  const inspectRiemann = riemannCurve[inspectIdx] ?? 0;
  const inspectLi = precomputed.liVals[inspectIdx] ?? 0;
  const selectedZero = zeros[selectedZeroIndex];

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-[640px] gap-4 p-4">
      {/* Left Stage */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Main Prime Counting Chart */}
        <div className="rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-2.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Primzahl-Zählfunktion π(x) und Riemanns explizite Formel
              </h2>
              <div className="flex items-center gap-3 mt-0.5 font-mono text-[11px] text-slate-400">
                <span className="text-amber-400">Bernstein: π(x) exakt</span>
                <span aria-hidden="true">·</span>
                <span className="text-cyan-400">Cyan: πₙ(x) mit {numZeros} Nullstellenpaaren</span>
                {showLi && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-400">Gestrichelt: Li(x)</span>
                  </>
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showLi}
                onChange={(e) => setShowLi(e.target.checked)}
                className="accent-cyan-500 h-3.5 w-3.5 cursor-pointer"
              />
              <span>Li(x) anzeigen</span>
            </label>
          </div>

          <div ref={mainContainerRef} className="h-[310px] w-full relative">
            <canvas
              ref={mainCanvasRef}
              onPointerMove={handleMainPointerMove}
              onPointerLeave={() => setHoverIdx(null)}
              className="h-full w-full block cursor-crosshair"
            />
          </div>
        </div>

        {/* Secondary Chart: Individual Zero Harmonic Wave */}
        <div className="flex-1 rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden flex flex-col min-h-[210px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Einzelwelle der Nullstelle ρ{selectedZero?.index ?? 1} (γ ={' '}
                {selectedZero?.gamma.toFixed(4) ?? '14.1347'})
              </h3>
              <p className="text-[11px] text-slate-400">
                Jede Nullstelle erzeugt eine gedämpfte Schwingung −2·Re(Ei(ρ·ln x)) in der Primzahldichte
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Frequenz wählen:</span>
              <select
                value={selectedZeroIndex}
                onChange={(e) => onSelectZero(parseInt(e.target.value, 10))}
                className="rounded-md border border-slate-800 bg-[#07090E] px-2.5 py-1 font-mono text-xs text-amber-300 focus:border-cyan-500 focus:outline-none cursor-pointer"
              >
                {zeros.slice(0, 50).map((z, idx) => (
                  <option key={z.index} value={idx}>
                    ρ{z.index} (γ = {z.gamma.toFixed(3)})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div ref={waveContainerRef} className="flex-1 min-h-[160px] relative">
            <canvas ref={waveCanvasRef} className="h-full w-full block" />
          </div>
        </div>
      </div>

      {/* Right Control & Concept Deck */}
      <aside className="w-full lg:w-[360px] shrink-0 flex flex-col gap-4">
        {/* Live Measurement at x */}
        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Vergleich am Punkt x
            </h2>
            <span className="font-mono text-xs text-slate-200 tabular-nums">
              x = {inspectX.toFixed(2)}
            </span>
          </div>

          <div className="mt-3 space-y-2.5 font-mono text-sm tabular-nums">
            <div className="flex items-baseline justify-between border-b border-slate-800/70 pb-2">
              <span className="text-xs text-slate-400">Exakt π(x)</span>
              <span className="text-amber-300 font-semibold">{inspectExact}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-slate-800/70 pb-2">
              <span className="text-xs text-slate-400">Riemann πₙ(x)</span>
              <span className="text-cyan-300 font-semibold">{inspectRiemann.toFixed(3)}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-slate-800/70 pb-2">
              <span className="text-xs text-slate-400">Gauß Li(x)</span>
              <span className="text-slate-300">{inspectLi.toFixed(3)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-0.5">
              <div>
                <div className="text-[11px] text-slate-500">Lokale Differenz</div>
                <div className="text-sm font-semibold text-slate-100">
                  {(inspectRiemann - inspectExact).toFixed(3)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Mittl. Fehler (0..x_max)</div>
                <div className="text-sm font-semibold text-cyan-300">
                  {meanError.toFixed(3)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Harmonics & Range Controls */}
        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-500/15 border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{isPlaying ? 'Stoppen' : 'Nullstellen aufsummieren'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                onNumZerosChange(0);
              }}
              title="Auf 0 Nullstellen zurücksetzen"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-[#07090E] text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-400">Aktive Nullstellenpaare N</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    onNumZerosChange(Math.max(0, numZeros - 1));
                  }}
                  aria-label="Nullstelle verringern"
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-[#07090E] text-slate-300 hover:text-white cursor-pointer"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-10 text-center font-mono font-semibold text-cyan-300 tabular-nums">
                  {numZeros}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    onNumZerosChange(Math.min(MAX_HARMONICS, numZeros + 1));
                  }}
                  aria-label="Nullstelle hinzufügen"
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-[#07090E] text-slate-300 hover:text-white cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={MAX_HARMONICS}
              step={1}
              value={numZeros}
              onChange={(e) => {
                setIsPlaying(false);
                onNumZerosChange(parseInt(e.target.value, 10));
              }}
              className="obs-slider w-full"
            />
            <div className="mt-2 flex gap-1.5">
              {[0, 5, 15, 40, 80].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    onNumZerosChange(preset);
                  }}
                  className={`flex-1 rounded border py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                    numZeros === preset
                      ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                      : 'border-slate-800 bg-[#07090E] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  N={preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Zahlenbereich Obergrenze x_max</span>
              <span className="font-mono text-slate-200 tabular-nums">{xMax}</span>
            </div>
            <input
              type="range"
              min={25}
              max={160}
              step={5}
              value={xMax}
              onChange={(e) => setXMax(parseInt(e.target.value, 10))}
              className="obs-slider w-full"
            />
          </div>
        </section>

        {/* Contextual Explanation */}
        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] p-4 text-xs leading-relaxed text-slate-300">
          <h3 className="font-semibold text-slate-100 mb-1.5">
            Die „Musik der Primzahlen“
          </h3>
          <p className="text-slate-400 mb-2">
            Bei <span className="font-mono text-slate-200">N = 0</span> ergibt sich Riemanns glatte Näherung <MathFormula tex="R(x)" />. Jedes hinzugefügte Nullstellenpaar <MathFormula tex="\rho_k = \tfrac{1}{2} \pm i\gamma_k" /> korrigiert den Fehler wie eine Fourier-Oberschwingung — an den Stellen der Primzahlen summieren sich die Wellen konstruktiv zu einer scharfen Stufe.
          </p>
        </section>
      </aside>
    </div>
  );
}
