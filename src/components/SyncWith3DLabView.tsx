import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';
import { cAbs, formatComplex, hardyZ, zeta } from '../math/complex';
import type { ZetaZero } from '../math/zeros';
import {
  exactPrimePi,
  LiOffset,
  mobius,
  reEi,
  riemannBigPiApprox,
  sievePrimes,
} from '../math/primes';
import { ComplexPlane3D } from './ComplexPlane3D';

interface SyncWith3DLabViewProps {
  zeros: ZetaZero[];
  selectedZeroIndex: number;
  onSelectZero: (index: number) => void;
  centerRe: number;
  centerIm: number;
  zoom: number;
  onViewportChange: (re: number, im: number, zoom: number) => void;
}

const MAX_SYNC_ZEROS = 80;
const T_MIN = 8;
const T_MAX = 205;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c * 0.5;
  let r = 0;
  let g = 0;
  let b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) {
    r = c; g = x;
  } else if (sector === 1) {
    r = x; g = c;
  } else if (sector === 2) {
    g = c; b = x;
  } else if (sector === 3) {
    g = x; b = c;
  } else if (sector === 4) {
    r = x; b = c;
  } else {
    r = c; b = x;
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function colorForZetaVal(re: number, im: number): [number, number, number] {
  if (!Number.isFinite(re) || !Number.isFinite(im)) return [7, 9, 14];
  const mag = Math.hypot(re, im);
  const arg = Math.atan2(im, re);
  const hue = (arg + Math.PI) / (2 * Math.PI);
  const logMag = Math.log2(mag + 1e-10);
  const frac = logMag - Math.floor(logMag);
  const contour = 0.88 + 0.12 * Math.cos(frac * Math.PI * 2);

  let lightness: number;
  if (mag < 1) {
    lightness = 0.1 + 0.42 * Math.pow(mag, 0.42);
  } else {
    lightness = 0.52 + 0.44 * (1 - 1 / (1 + 0.35 * Math.log(mag + 1)));
  }
  lightness = Math.max(0.05, Math.min(0.97, lightness * contour));
  return hslToRgb(hue, 0.86, lightness);
}

export function SyncWith3DLabView({
  zeros,
  selectedZeroIndex,
  onSelectZero,
  centerRe,
  centerIm,
  zoom,
  onViewportChange,
}: SyncWith3DLabViewProps) {
  const [tCursor, setTCursor] = useState(8.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [xMin, setXMin] = useState(2);
  const [xMax, setXMax] = useState(60);
  const [yMin, setYMin] = useState<number | null>(null);
  const [yMax, setYMax] = useState<number | null>(null);
  const [showLi, setShowLi] = useState(true);
  const [showMagnitude, setShowMagnitude] = useState(true);
  const [flashZeroIndex, setFlashZeroIndex] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [primeDrag, setPrimeDrag] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sustainedOscRef = useRef<OscillatorNode | null>(null);
  const sustainedGainRef = useRef<GainNode | null>(null);

  const zCanvasRef = useRef<HTMLCanvasElement>(null);
  const zContainerRef = useRef<HTMLDivElement>(null);
  const spiralCanvasRef = useRef<HTMLCanvasElement>(null);
  const spiralContainerRef = useRef<HTMLDivElement>(null);
  const primeCanvasRef = useRef<HTMLCanvasElement>(null);
  const primeContainerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [zSize, setZSize] = useState({ width: 680, height: 165 });
  const [spiralSize, setSpiralSize] = useState({ width: 360, height: 410 });
  const [primeSize, setPrimeSize] = useState({ width: 900, height: 210 });

  const tCursorRef = useRef(tCursor);
  tCursorRef.current = tCursor;

  const primes = useMemo(() => sievePrimes(220), []);
  const gammas = useMemo(() => zeros.map((z) => z.gamma), [zeros]);

  const activeZeroCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < zeros.length && count < MAX_SYNC_ZEROS; i++) {
      if (zeros[i].gamma <= tCursor + 1e-4) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }, [zeros, tCursor]);

  const prevCountRef = useRef(activeZeroCount);
  useEffect(() => {
    if (activeZeroCount > prevCountRef.current) {
      const crossedIdx = activeZeroCount - 1;
      setFlashZeroIndex(crossedIdx);
      onSelectZero(crossedIdx);
      const timer = window.setTimeout(() => setFlashZeroIndex(null), 900);
      prevCountRef.current = activeZeroCount;

      // Scroll table to active zero row smoothly
      const activeRow = document.getElementById(`sync-zero-row-${crossedIdx}`);
      activeRow?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      return () => window.clearTimeout(timer);
    }
    prevCountRef.current = activeZeroCount;
  }, [activeZeroCount, onSelectZero]);

  // Resize observers
  useEffect(() => {
    const observers: ResizeObserver[] = [];
    const watch = (
      el: HTMLDivElement | null,
      setter: (s: { width: number; height: number }) => void,
      minH: number
    ) => {
      if (!el) return;
      const obs = new ResizeObserver((entries) => {
        for (const e of entries) {
          setter({
            width: Math.max(220, Math.floor(e.contentRect.width)),
            height: Math.max(minH, Math.floor(e.contentRect.height)),
          });
        }
      });
      obs.observe(el);
      observers.push(obs);
    };
    watch(zContainerRef.current, setZSize, 140);
    watch(spiralContainerRef.current, setSpiralSize, 350);
    watch(primeContainerRef.current, setPrimeSize, 180);
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // Persistent Synth Sound Effect for Traversal (Pitch bend without clicks)
  useEffect(() => {
    if (!soundEnabled) {
      try {
        sustainedGainRef.current?.gain.setValueAtTime(0, audioCtxRef.current?.currentTime || 0);
        sustainedOscRef.current?.stop();
        sustainedOscRef.current?.disconnect();
        sustainedOscRef.current = null;
      } catch {}
      return;
    }
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.025, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      sustainedOscRef.current = osc;
      sustainedGainRef.current = gain;
    } catch {}

    return () => {
      try {
        sustainedOscRef.current?.stop();
        sustainedOscRef.current?.disconnect();
        sustainedOscRef.current = null;
      } catch {}
    };
  }, [soundEnabled]);

  const updateAudioPitch = (t: number, hardyVal: number) => {
    if (!soundEnabled || !audioCtxRef.current || !sustainedOscRef.current) return;
    try {
      const ctx = audioCtxRef.current;
      let nearZero = false;
      for (const z of zeros) {
        if (Math.abs(z.gamma - t) < 0.08) {
          nearZero = true;
          break;
        }
      }

      const absVal = Math.min(5, Math.abs(hardyVal));
      const targetFreq = Math.max(130, Math.min(520, 440 - absVal * 65));
      sustainedOscRef.current.frequency.linearRampToValueAtTime(targetFreq, ctx.currentTime + 0.06);

      if (nearZero) {
        const pingOsc = ctx.createOscillator();
        const pingGain = ctx.createGain();
        pingOsc.type = 'sine';
        pingOsc.frequency.setValueAtTime(880, ctx.currentTime);
        pingOsc.frequency.setValueAtTime(1320, ctx.currentTime + 0.05);
        pingGain.gain.setValueAtTime(0.08, ctx.currentTime);
        pingGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
        pingOsc.connect(pingGain);
        pingGain.connect(ctx.destination);
        pingOsc.start();
        pingOsc.stop(ctx.currentTime + 0.25);
      }
    } catch {}
  };

  // Playback loop along critical line
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let last = performance.now();

    function tick(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const next = tCursorRef.current + dt * 1.8 * playSpeed;
      const wrapped = next > T_MAX ? T_MIN : next;
      tCursorRef.current = wrapped;
      setTCursor(wrapped);
      onViewportChange(centerRe, wrapped, zoom);
      updateAudioPitch(wrapped, hardyZ(wrapped));
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, playSpeed, centerRe, zoom, onViewportChange, soundEnabled, zeros]);

  // Precompute Hardy Z(t) table
  const hardyTable = useMemo(() => {
    const dt = 0.06;
    const tMaxTable = 215;
    const count = Math.ceil(tMaxTable / dt);
    const ts = new Float64Array(count + 1);
    const zs = new Float64Array(count + 1);
    for (let i = 0; i <= count; i++) {
      const t = i * dt;
      ts[i] = t;
      zs[i] = hardyZ(t);
    }
    return { dt, ts, zs, count };
  }, []);

  const zWindowSpan = 28;
  const tWindowStart = Math.max(0, Math.min(T_MAX - zWindowSpan + 8, tCursor - zWindowSpan * 0.45));

  const zCurveSamples = useMemo(() => {
    const tEnd = tWindowStart + zWindowSpan;
    const iStart = Math.max(0, Math.floor(tWindowStart / hardyTable.dt));
    const iEnd = Math.min(hardyTable.count, Math.ceil(tEnd / hardyTable.dt));
    const pts: { t: number; z: number; abs: number }[] = [];
    let maxAbs = 2.5;
    for (let i = iStart; i <= iEnd; i++) {
      const zVal = hardyTable.zs[i];
      const absVal = Math.abs(zVal);
      if (absVal > maxAbs) maxAbs = absVal;
      pts.push({ t: hardyTable.ts[i], z: zVal, abs: absVal });
    }
    return { pts, maxY: Math.min(8, Math.max(2.6, maxAbs * 1.15)) };
  }, [hardyTable, tWindowStart]);

  // 1. Draw Hardy Z(t)
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

    const padL = 40;
    const padR = 14;
    const padT = 10;
    const padB = 22;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const tEnd = tWindowStart + zWindowSpan;
    const maxY = zCurveSamples.maxY;

    const toX = (t: number) => padL + ((t - tWindowStart) / zWindowSpan) * plotW;
    const toY = (val: number) => padT + plotH * 0.5 - (val / maxY) * (plotH * 0.46);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#FFFFFF';

    for (const yTick of [-2, 0, 2]) {
      if (Math.abs(yTick) > maxY) continue;
      const py = toY(yTick);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(width - padR, py);
      ctx.stroke();
      ctx.fillText(yTick.toString(), 10, py + 3);
    }

    const zeroY = toY(0);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(width - padR, zeroY);
    ctx.stroke();

    const firstTick = Math.ceil(tWindowStart / 5) * 5;
    for (let t = firstTick; t <= tEnd; t += 5) {
      const px = toX(t);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, height - padB);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(t.toFixed(0), px - 6, height - 6);
    }

    if (showMagnitude) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.42)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      zCurveSamples.pts.forEach((p, idx) => {
        const px = toX(p.t);
        const py = toY(p.abs);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    zCurveSamples.pts.forEach((p, idx) => {
      const px = toX(p.t);
      const py = toY(p.z);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    for (const z of zeros) {
      if (z.gamma < tWindowStart || z.gamma > tEnd) continue;
      const px = toX(z.gamma);
      const isPassed = z.gamma <= tCursor + 1e-4;
      const isFlashing = flashZeroIndex === z.index - 1;

      ctx.beginPath();
      ctx.arc(px, zeroY, isFlashing ? 6.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isPassed ? '#F59E0B' : '#334155';
      ctx.fill();
      ctx.strokeStyle = isPassed ? '#FDE68A' : '#64748B';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isFlashing || z.index <= 12) {
        ctx.fillStyle = isPassed ? '#FDE68A' : '#94A3B8';
        ctx.font = `${isFlashing ? '600' : '400'} 9px "IBM Plex Mono", monospace`;
        ctx.fillText(`γ${z.index}`, px - 7, zeroY - 8);
      }
    }

    const cx = toX(tCursor);
    const cy = toY(hardyZ(tCursor));
    ctx.save();
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, padT);
    ctx.lineTo(cx, height - padB);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [zSize, tWindowStart, zCurveSamples, showMagnitude, zeros, tCursor, flashZeroIndex]);

  // 2. Draw Values-Plane Spiral zeta(1/2 + it)
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

    const trailSpan = 5.0;
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

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
    ctx.stroke();

    // Origin zero target (0,0)
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    for (let i = 1; i < trail.length; i++) {
      const alpha = 0.15 + 0.85 * Math.pow(i / trail.length, 1.4);
      const p0 = toPx(trail[i - 1].re, trail[i - 1].im);
      const p1 = toPx(trail[i].re, trail[i].im);
      ctx.strokeStyle = `rgba(6, 182, 212, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    const head = trail[trail.length - 1];
    if (head) {
      const hp = toPx(head.re, head.im);
      const dist = Math.hypot(head.re, head.im);
      const nearOrigin = dist < 0.15;
      if (nearOrigin) {
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = nearOrigin ? '#F59E0B' : '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = '#94A3B8';
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillText('Re(ζ)', width - 38, cy - 6);
    ctx.fillText('Im(ζ)', cx + 6, 14);
  }, [spiralSize, tCursor]);

  // Prime Precomputed
  const primePrecomputed = useMemo(() => {
    const gridCount = 260;
    const xs: number[] = [];
    const exactPi: number[] = [];
    const liVals: number[] = [];
    const baseR: number[] = [];

    const maxK = Math.min(MAX_SYNC_ZEROS, gammas.length);
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

      let rSum = 0;
      for (const { m, coeff } of mobiusList) {
        const rootX = Math.pow(x, 1 / m);
        if (rootX > 1.02) {
          rSum += coeff * riemannBigPiApprox(rootX, gammas, 0);
        }
      }
      baseR.push(rSum);

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
  }, [xMin, xMax, primes, gammas]);

  const riemannCurve = useMemo(() => {
    const { baseR, deltas, gridCount } = primePrecomputed;
    const count = Math.min(activeZeroCount, deltas.length);
    const out = new Float64Array(gridCount + 1);
    for (let i = 0; i <= gridCount; i++) {
      let val = baseR[i];
      for (let k = 0; k < count; k++) {
        val += deltas[k][i];
      }
      out[i] = val;
    }
    return out;
  }, [primePrecomputed, activeZeroCount]);

  // 3. Draw Prime Counting pi(x), Li(x) & pi_N(x)
  useEffect(() => {
    const canvas = primeCanvasRef.current;
    if (!canvas) return;
    const { width, height } = primeSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07090E';
    ctx.fillRect(0, 0, width, height);

    const padL = 44;
    const padR = 18;
    const padT = 12;
    const padB = 24;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const autoMaxY = Math.max(
      10,
      primePrecomputed.exactPi[primePrecomputed.gridCount] * 1.12,
      primePrecomputed.liVals[primePrecomputed.gridCount] * 1.05
    );
    const effYMin = yMin ?? 0;
    const effYMax = yMax ?? autoMaxY;

    const toX = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
    const toY = (y: number) => padT + plotH - ((y - effYMin) / (effYMax - effYMin)) * plotH;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#FFFFFF';

    const ySpan = effYMax - effYMin;
    const yStep = ySpan <= 10 ? 2 : ySpan <= 30 ? 5 : ySpan <= 80 ? 10 : 20;
    const startYTick = Math.ceil(effYMin / yStep) * yStep;
    for (let y = startYTick; y <= effYMax; y += yStep) {
      const py = toY(y);
      if (py >= padT && py <= height - padB) {
        ctx.beginPath();
        ctx.moveTo(padL, py);
        ctx.lineTo(width - padR, py);
        ctx.stroke();
        ctx.fillText(y.toString(), 10, py + 3);
      }
    }

    const span = xMax - xMin;
    const xStep = span <= 20 ? 2 : span <= 45 ? 5 : span <= 90 ? 10 : 20;
    const startTick = Math.ceil(xMin / xStep) * xStep;
    for (let x = startTick; x <= xMax; x += xStep) {
      const px = toX(x);
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, height - padB);
      ctx.stroke();
      ctx.fillText(x.toString(), px - 6, height - 7);
    }

    if (showLi) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      primePrecomputed.xs.forEach((x, i) => {
        const px = toX(x);
        const py = toY(primePrecomputed.liVals[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }

    // Exact pi(x)
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX(2), toY(1));
    let prevCount = 1;
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

    // Primzahl-Beschriftung über jeder Treppenstufe (fester Pixelabstand zur Kurve)
    {
      const stemGap = 3; // Abstand Kurve -> Strichanfang
      const stemLen = 9; // Strichlänge
      const textGap = 2; // Abstand Strichende -> Text
      ctx.save();
      ctx.beginPath();
      ctx.rect(padL, padT, plotW, plotH);
      ctx.clip();
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
      ctx.lineWidth = 1;

      let count = 0;
      let lastBox: { x1: number; x2: number; y1: number; y2: number } | null = null;
      for (const p of primes) {
        if (p > xMax) break;
        count += 1;
        if (p < xMin) continue;
        const px = toX(p);
        const stepTop = toY(count);
        const y0 = stepTop - stemGap;
        const y1 = y0 - stemLen;
        ctx.beginPath();
        ctx.moveTo(px, y0);
        ctx.lineTo(px, y1);
        ctx.stroke();

        const label = String(p);
        const tw = ctx.measureText(label).width;
        const baseline = y1 - textGap;
        const box = { x1: px - tw / 2 - 2, x2: px + tw / 2 + 2, y1: baseline - 10, y2: baseline + 1 };
        const overlaps =
          lastBox !== null &&
          box.x1 < lastBox.x2 &&
          box.x2 > lastBox.x1 &&
          box.y1 < lastBox.y2 &&
          box.y2 > lastBox.y1;
        if (!overlaps) {
          ctx.fillStyle = '#FCD34D';
          ctx.fillText(label, px, baseline);
          lastBox = box;
        }
      }
      ctx.restore();
    }

    // Riemann pi_N(x)
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    primePrecomputed.xs.forEach((x, i) => {
      const px = toX(x);
      const py = toY(riemannCurve[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Draw active 2D drag selection box if dragging
    if (primeDrag) {
      const x1 = Math.min(primeDrag.startX, primeDrag.currentX);
      const x2 = Math.max(primeDrag.startX, primeDrag.currentX);
      const y1 = Math.min(primeDrag.startY, primeDrag.currentY);
      const y2 = Math.max(primeDrag.startY, primeDrag.currentY);
      ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
  }, [primeSize, xMin, xMax, yMin, yMax, primePrecomputed, riemannCurve, primes, showLi, primeDrag]);

  const currentHardy = useMemo(() => hardyZ(tCursor), [tCursor]);
  const currentZeta = useMemo(() => zeta({ re: 0.5, im: tCursor }, 'high'), [tCursor]);
  const latestZero = activeZeroCount > 0 ? zeros[activeZeroCount - 1] : null;
  const nextZero = zeros[activeZeroCount] ?? null;

  const handleZPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1 && e.type === 'pointermove') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const padL = 40;
    const padR = 14;
    const plotW = zSize.width - padL - padR;
    const ratio = Math.max(0, Math.min(1, (px - padL) / plotW));
    const nextT = Math.max(T_MIN, Math.min(T_MAX, tWindowStart + ratio * zWindowSpan));
    setIsPlaying(false);
    setTCursor(nextT);
    onViewportChange(centerRe, nextT, zoom);
  };

  const handlePrimePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPrimeDrag({ startX: x, startY: y, currentX: x, currentY: y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePrimePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!primeDrag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(44, Math.min(primeSize.width - 18, e.clientX - rect.left));
    const y = Math.max(12, Math.min(primeSize.height - 24, e.clientY - rect.top));
    setPrimeDrag((d) => (d ? { ...d, currentX: x, currentY: y } : null));
  };

  const handlePrimePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!primeDrag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const endX = Math.max(44, Math.min(primeSize.width - 18, e.clientX - rect.left));
    const endY = Math.max(12, Math.min(primeSize.height - 24, e.clientY - rect.top));
    const padL = 44;
    const padR = 18;
    const padT = 12;
    const padB = 24;
    const plotW = primeSize.width - padL - padR;
    const plotH = primeSize.height - padT - padB;

    const x1Px = Math.min(primeDrag.startX, endX);
    const x2Px = Math.max(primeDrag.startX, endX);
    const y1Px = Math.min(primeDrag.startY, endY);
    const y2Px = Math.max(primeDrag.startY, endY);

    if (x2Px - x1Px > 12 && y2Px - y1Px > 12) {
      const ratioX1 = (x1Px - padL) / plotW;
      const ratioX2 = (x2Px - padL) / plotW;
      const newXMin = Math.max(2, xMin + ratioX1 * (xMax - xMin));
      const newXMax = Math.max(newXMin + 3, xMin + ratioX2 * (xMax - xMin));

      const autoMaxY = Math.max(
        10,
        primePrecomputed.exactPi[primePrecomputed.gridCount] * 1.12,
        primePrecomputed.liVals[primePrecomputed.gridCount] * 1.05
      );
      const effYMin = yMin ?? 0;
      const effYMax = yMax ?? autoMaxY;

      const ratioY1 = 1 - (y2Px - padT) / plotH;
      const ratioY2 = 1 - (y1Px - padT) / plotH;
      const newYMin = Math.max(0, effYMin + ratioY1 * (effYMax - effYMin));
      const newYMax = Math.max(newYMin + 2, effYMin + ratioY2 * (effYMax - effYMin));

      setXMin(newXMin);
      setXMax(newXMax);
      setYMin(newYMin);
      setYMax(newYMax);
    }
    setPrimeDrag(null);
  };

  return (
    <div className="flex flex-col gap-3 p-4 max-w-[1440px] w-full mx-auto">
      {/* Top Bar with Playback & Nullstellen aufsummieren button */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#0B0E17] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/15 border border-cyan-500/40 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Nullstellen aufsummieren (Fahren)'}</span>
          </button>

          <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#07090E] p-0.5">
            {[0.5, 1, 2, 4].map((spd) => (
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

          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setTCursor(8.0);
              onSelectZero(0);
              onViewportChange(centerRe, 8.0, zoom);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#07090E] px-3 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Zurücksetzen</span>
          </button>

          <button
            type="button"
            onClick={() => setSoundEnabled((s) => !s)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              soundEnabled
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                : 'border-slate-800 bg-[#07090E] text-slate-400 hover:text-slate-200'
            }`}
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-amber-400" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span>{soundEnabled ? 'Ton an' : 'Ton aus'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-5 flex-1 justify-end min-w-[280px]">
          <div className="flex items-center gap-3 min-w-[210px] flex-1 max-w-[320px]">
            <span className="text-xs text-slate-400 whitespace-nowrap">t (Imaginärteil)</span>
            <input
              type="range"
              min={T_MIN}
              max={T_MAX}
              step={0.05}
              value={tCursor}
              onChange={(e) => {
                setIsPlaying(false);
                const val = parseFloat(e.target.value);
                setTCursor(val);
                onViewportChange(centerRe, val, zoom);
              }}
              className="obs-slider flex-1"
            />
            <span className="font-mono text-xs text-cyan-300 tabular-nums w-14 text-right">
              {tCursor.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs tabular-nums text-slate-300">
            <span>Z(t) = {currentHardy.toFixed(3)}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className={flashZeroIndex !== null ? 'text-amber-300 font-semibold' : 'text-amber-400'}>
              Aktive N = {activeZeroCount}
            </span>
          </div>
        </div>
      </div>

      {/* Row: 3D Gebirge (Left) + Wertebenen-Spirale & Zeros Table (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* Left: 3D Gebirge */}
        <section className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden min-h-[410px] flex flex-col">
          <div className="border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs">
            <h2 className="font-semibold text-slate-200 uppercase tracking-wider">
              3D Betrags-Gebirge ζ(s) — Gekoppelt mit t = {tCursor.toFixed(2)}
            </h2>
            <span className="font-mono text-cyan-400">
              Re(s) ∈ [{ (centerRe - 180/zoom).toFixed(1) }, { (centerRe + 180/zoom).toFixed(1) }] · Im(s) = {tCursor.toFixed(2)}
            </span>
          </div>
          <div className="flex-1 relative w-full min-h-[360px]">
            <ComplexPlane3D
              centerRe={centerRe}
              centerIm={tCursor}
              zoom={zoom}
              onViewportChange={(re, im, z) => onViewportChange(re, im, z)}
              zeros={zeros}
              selectedZeroIndex={activeZeroCount > 0 ? activeZeroCount - 1 : 0}
              showStrip={true}
              showMarkers={true}
              showAxisLabels={true}
              activeTravelerIm={tCursor}
              onHoverPoint={() => {}}
              onPinPoint={() => {}}
            />
          </div>
        </section>

        {/* Right: Wertebenen-Spirale & Synchronized First 100 Zeros Table */}
        <section className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden flex flex-col min-h-[410px]">
          <div className="border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs">
            <h2 className="font-semibold text-slate-200 uppercase tracking-wider">
              Wertebenen-Spirale ζ(½ + it)
            </h2>
            <span className="font-mono text-cyan-300 tabular-nums">
              {formatComplex(currentZeta, 3)}
            </span>
          </div>
          <div ref={spiralContainerRef} className="h-[210px] w-full relative">
            <canvas ref={spiralCanvasRef} className="h-full w-full block" />
          </div>

          {/* Synchronized Zeros Table with Orange Active Highlight */}
          <div className="border-t border-slate-800 flex-1 flex flex-col min-h-[180px]">
            <div className="bg-[#07090E] px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Nullstellen-Katalog (Aktiv: {activeZeroCount})</span>
              <span className="text-amber-400">γₙ im Fokus</span>
            </div>
            <div ref={tableContainerRef} className="flex-1 overflow-y-auto max-h-[170px]">
              <table className="w-full text-left border-collapse">
                <tbody className="divide-y divide-slate-800/60 font-mono text-xs tabular-nums">
                  {zeros.map((z) => {
                    const isPassed = z.index <= activeZeroCount;
                    const isActive = z.index === activeZeroCount;
                    return (
                      <tr
                        key={z.index}
                        id={`sync-zero-row-${z.index - 1}`}
                        onClick={() => {
                          setIsPlaying(false);
                          setTCursor(z.gamma);
                          onViewportChange(centerRe, z.gamma, zoom);
                          onSelectZero(z.index - 1);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-amber-500/25 text-amber-200 font-bold'
                            : isPassed
                            ? 'bg-cyan-500/10 text-cyan-200'
                            : 'text-slate-400 hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-1 px-3">ρ{z.index}</td>
                        <td className="py-1 px-3">γ = {z.gamma.toFixed(4)}</td>
                        <td className="py-1 px-3 text-right">
                          {isPassed ? '✓ aktiv' : '· wartend'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* Graph 1: Hardy Z(t) */}
      <section className="rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Kritische Gerade — Hardy-Funktion Z(t)
            </h2>
            <span className="text-xs text-slate-400">
              {nextZero
                ? `Nächste Nullstelle: ρ${nextZero.index} bei t = ${nextZero.gamma.toFixed(4)}`
                : 'Alle Nullstellen durchlaufen'}
            </span>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={showMagnitude}
              onChange={(e) => setShowMagnitude(e.target.checked)}
              className="accent-amber-500 h-3.5 w-3.5 cursor-pointer"
            />
            <span>|ζ(½ + it)|</span>
          </label>
        </div>
        <div ref={zContainerRef} className="h-[145px] w-full">
          <canvas
            ref={zCanvasRef}
            onPointerDown={handleZPointer}
            onPointerMove={handleZPointer}
            className="h-full w-full block cursor-crosshair touch-none"
          />
        </div>
      </section>

      {/* Graph 2: Prime Counting pi(x) & pi_N(x) */}
      <section
        className={`rounded-xl border bg-[#0B0E17] overflow-hidden transition-colors duration-200 ${
          flashZeroIndex !== null ? 'border-amber-500/60' : 'border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Primzahl-Zählfunktion π(x) &amp; Explizite Formel πₙ(x) (mit beiden Linien)
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">
              <span className="text-amber-400">Bernstein: π(x) exakt</span>
              <span aria-hidden="true">·</span>
              <span className="text-cyan-400">
                Cyan: πₙ(x) mit N = {activeZeroCount} Nullstellenpaaren
              </span>
              {latestZero && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className={flashZeroIndex !== null ? 'text-amber-300 font-semibold' : 'text-slate-300'}>
                    Aktive Frequenz: ρ{latestZero.index} (γ = {latestZero.gamma.toFixed(4)})
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Bereich [{xMin.toFixed(0)} … {xMax}]</span>
              <input
                type="range"
                min={12}
                max={160}
                step={2}
                value={xMax}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setXMax(val);
                  if (xMin >= val - 5) setXMin(Math.max(2, val - 35));
                }}
                className="obs-slider w-24"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const span = Math.max(8, (xMax - xMin) * 0.75);
                  const mid = (xMin + xMax) / 2;
                  setXMin(Math.max(2, mid - span / 2));
                  setXMax(Math.min(200, mid + span / 2));
                }}
                title="Hineinzoomen"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-800 bg-[#07090E] text-slate-300 hover:text-white cursor-pointer"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const span = Math.min(180, (xMax - xMin) * 1.35);
                  const mid = (xMin + xMax) / 2;
                  setXMin(Math.max(2, mid - span / 2));
                  setXMax(Math.min(200, mid + span / 2));
                }}
                title="Herauszoomen"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-800 bg-[#07090E] text-slate-300 hover:text-white cursor-pointer"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setXMin(2);
                  setXMax(60);
                  setYMin(null);
                  setYMax(null);
                }}
                title="Zoom zurücksetzen"
                className="inline-flex h-7 px-2 items-center justify-center rounded border border-slate-800 bg-[#07090E] text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Reset
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showLi}
                onChange={(e) => setShowLi(e.target.checked)}
                className="accent-cyan-500 h-3.5 w-3.5 cursor-pointer"
              />
              <span>Li(x)</span>
            </label>
          </div>
        </div>

        <div ref={primeContainerRef} className="h-[190px] w-full">
          <canvas
            ref={primeCanvasRef}
            onPointerDown={handlePrimePointerDown}
            onPointerMove={handlePrimePointerMove}
            onPointerUp={handlePrimePointerUp}
            onPointerLeave={() => setPrimeDrag(null)}
            onWheel={(e) => {
              e.preventDefault();
              const range = xMax - xMin;
              const factor = e.deltaY < 0 ? 0.82 : 1.2;
              const newRange = Math.max(5, Math.min(150, range * factor));
              const mid = (xMin + xMax) / 2;
              const nextMin = Math.max(2, mid - newRange / 2);
              const nextMax = Math.min(200, nextMin + newRange);
              setXMin(nextMin);
              setXMax(nextMax);
            }}
            className="h-full w-full block cursor-crosshair touch-none"
          />
        </div>
      </section>
    </div>
  );
}
