import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
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

interface SynchronizedLabViewProps {
  zeros: ZetaZero[];
  selectedZeroIndex: number;
  onSelectZero: (index: number) => void;
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
    r = c; g = x; b = 0;
  } else if (sector === 1) {
    r = x; g = c; b = 0;
  } else if (sector === 2) {
    r = 0; g = c; b = x;
  } else if (sector === 3) {
    r = 0; g = x; b = c;
  } else if (sector === 4) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function phaseColor(re: number, im: number): [number, number, number] {
  if (!Number.isFinite(re) || !Number.isFinite(im)) return [248, 250, 252];
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

export function SynchronizedLabView({
  zeros,
  selectedZeroIndex,
  onSelectZero,
}: SynchronizedLabViewProps) {
  const [tCursor, setTCursor] = useState(11.5);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [xMax, setXMax] = useState(60);
  const [showLi, setShowLi] = useState(true);
  const [showMagnitude, setShowMagnitude] = useState(true);
  const [flashZeroIndex, setFlashZeroIndex] = useState<number | null>(null);

  const zCanvasRef = useRef<HTMLCanvasElement>(null);
  const zContainerRef = useRef<HTMLDivElement>(null);
  const spiralCanvasRef = useRef<HTMLCanvasElement>(null);
  const spiralContainerRef = useRef<HTMLDivElement>(null);
  const complexCanvasRef = useRef<HTMLCanvasElement>(null);
  const complexContainerRef = useRef<HTMLDivElement>(null);
  const primeCanvasRef = useRef<HTMLCanvasElement>(null);
  const primeContainerRef = useRef<HTMLDivElement>(null);

  const [zSize, setZSize] = useState({ width: 900, height: 185 });
  const [spiralSize, setSpiralSize] = useState({ width: 440, height: 240 });
  const [complexSize, setComplexSize] = useState({ width: 440, height: 240 });
  const [primeSize, setPrimeSize] = useState({ width: 900, height: 240 });

  // Cached vertical strip for 60fps smooth Complex Plane scrolling along critical line
  const stripCacheRef = useRef<{
    canvas: HTMLCanvasElement;
    tBase: number;
    tSpan: number;
    reMin: number;
    reMax: number;
    pxPerUnit: number;
  } | null>(null);

  const tCursorRef = useRef(tCursor);
  tCursorRef.current = tCursor;

  const primes = useMemo(() => sievePrimes(220), []);
  const gammas = useMemo(() => zeros.map((z) => z.gamma), [zeros]);

  // Number of non-trivial zeros passed so far determines N in pi_N(x)
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
      return () => window.clearTimeout(timer);
    }
    prevCountRef.current = activeZeroCount;
  }, [activeZeroCount, onSelectZero]);

  // Resize observers for all 4 canvases
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
            width: Math.max(240, Math.floor(e.contentRect.width)),
            height: Math.max(minH, Math.floor(e.contentRect.height)),
          });
        }
      });
      obs.observe(el);
      observers.push(obs);
    };
    watch(zContainerRef.current, setZSize, 160);
    watch(spiralContainerRef.current, setSpiralSize, 200);
    watch(complexContainerRef.current, setComplexSize, 200);
    watch(primeContainerRef.current, setPrimeSize, 210);
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // Playback loop along critical line
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let last = performance.now();

    function tick(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const next = tCursorRef.current + dt * 2.0 * playSpeed;
      const wrapped = next > T_MAX ? T_MIN : next;
      tCursorRef.current = wrapped;
      setTCursor(wrapped);
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, playSpeed]);

  // Precompute Hardy Z(t) once across [0, 215] for lag-free 60fps scrolling
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

  // 1. Draw Row 1: Hardy Z(t)
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
    const padT = 14;
    const padB = 24;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const tEnd = tWindowStart + zWindowSpan;
    const maxY = zCurveSamples.maxY;

    const toX = (t: number) => padL + ((t - tWindowStart) / zWindowSpan) * plotW;
    const toY = (val: number) => padT + plotH * 0.5 - (val / maxY) * (plotH * 0.46);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#64748B';

    for (const yTick of [-2, 0, 2]) {
      if (Math.abs(yTick) > maxY) continue;
      const py = toY(yTick);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(width - padR, py);
      ctx.stroke();
      ctx.fillText(yTick.toString(), 14, py + 3);
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
      ctx.fillStyle = '#64748B';
      ctx.fillText(t.toFixed(0), px - 6, height - 7);
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

    // Non-trivial zeros in window
    for (const z of zeros) {
      if (z.gamma < tWindowStart || z.gamma > tEnd) continue;
      const px = toX(z.gamma);
      const isPassed = z.gamma <= tCursor + 1e-4;
      const isFlashing = flashZeroIndex === z.index - 1;

      ctx.beginPath();
      ctx.arc(px, zeroY, isFlashing ? 6.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isPassed ? '#F59E0B' : '#334155';
      ctx.fill();
      ctx.strokeStyle = isPassed ? '#FDE68A' : '#64748B';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = isPassed ? '#FDE68A' : '#94A3B8';
      ctx.font = `${isFlashing ? '600' : '400'} 10px "IBM Plex Mono", monospace`;
      ctx.fillText(`γ${z.index}`, px - 8, zeroY - 9);
    }

    // Active tCursor vertical hairline
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
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [zSize, tWindowStart, zCurveSamples, showMagnitude, zeros, tCursor, flashZeroIndex]);

  // 2A. Draw Row 2 Left: Value-Plane Spiral zeta(1/2 + it)
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
    const steps = 200;
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

    // Target origin (0, 0)
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    for (let i = 1; i < trail.length; i++) {
      const alpha = 0.12 + 0.88 * Math.pow(i / trail.length, 1.4);
      const p0 = toPx(trail[i - 1].re, trail[i - 1].im);
      const p1 = toPx(trail[i].re, trail[i].im);
      ctx.strokeStyle = `rgba(6, 182, 212, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    const head = trail[trail.length - 1];
    if (head) {
      const hp = toPx(head.re, head.im);
      const dist = Math.hypot(head.re, head.im);
      const nearOrigin = dist < 0.12;
      if (nearOrigin) {
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = nearOrigin ? '#F59E0B' : '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    ctx.fillStyle = '#94A3B8';
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillText('Re(ζ)', width - 38, cy - 6);
    ctx.fillText('Im(ζ)', cx + 6, 14);
  }, [spiralSize, tCursor]);

  // 2B. Draw Row 2 Right: Complex Plane domain-colored window with moving point s = 1/2 + it
  useEffect(() => {
    const canvas = complexCanvasRef.current;
    if (!canvas) return;
    const { width, height } = complexSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reMin = -1.2;
    const reMax = 2.2;
    const reSpan = reMax - reMin;
    const imSpan = 7.6; // visible height in complex units
    const imMin = tCursor - imSpan * 0.5;
    const imMax = tCursor + imSpan * 0.5;

    // Ensure cached vertical domain-coloring strip covers [imMin, imMax]
    const cache = stripCacheRef.current;
    const needsRebuild =
      !cache ||
      imMin < cache.tBase + 0.5 ||
      imMax > cache.tBase + cache.tSpan - 0.5;

    if (needsRebuild) {
      const tSpan = 20;
      const tBase = Math.max(-2, tCursor - tSpan * 0.45);
      const pxPerUnit = 38;
      const bufW = Math.round(reSpan * pxPerUnit);
      const bufH = Math.round(tSpan * pxPerUnit);
      const off = document.createElement('canvas');
      off.width = bufW;
      off.height = bufH;
      const offCtx = off.getContext('2d');
      if (offCtx) {
        const img = offCtx.createImageData(bufW, bufH);
        const data = img.data;
        const step = 2; // crisp 2x2 rendering in ~12ms
        for (let py = 0; py < bufH; py += step) {
          const im = tBase + tSpan - (py / bufH) * tSpan;
          for (let px = 0; px < bufW; px += step) {
            const re = reMin + (px / bufW) * reSpan;
            const val = zeta({ re, im }, 'fast');
            const [r, g, b] = phaseColor(val.re, val.im);
            for (let dy = 0; dy < step && py + dy < bufH; dy++) {
              for (let dx = 0; dx < step && px + dx < bufW; dx++) {
                const idx = ((py + dy) * bufW + (px + dx)) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255;
              }
            }
          }
        }
        offCtx.putImageData(img, 0, 0);
        stripCacheRef.current = {
          canvas: off,
          tBase,
          tSpan,
          reMin,
          reMax,
          pxPerUnit,
        };
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07090E';
    ctx.fillRect(0, 0, width, height);

    const activeCache = stripCacheRef.current;
    if (activeCache) {
      const srcYTop =
        ((activeCache.tBase + activeCache.tSpan - imMax) / activeCache.tSpan) *
        activeCache.canvas.height;
      const srcHeight = (imSpan / activeCache.tSpan) * activeCache.canvas.height;
      ctx.drawImage(
        activeCache.canvas,
        0,
        srcYTop,
        activeCache.canvas.width,
        srcHeight,
        0,
        0,
        width,
        height
      );
    }

    const toScreenX = (re: number) => ((re - reMin) / reSpan) * width;
    const toScreenY = (im: number) => ((imMax - im) / imSpan) * height;

    // Critical strip borders (0 and 1) & Critical line (0.5)
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 1;
    for (const rLine of [0, 1]) {
      const x = toScreenX(rLine);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const xHalf = toScreenX(0.5);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xHalf, 0);
    ctx.lineTo(xHalf, height);
    ctx.stroke();
    ctx.restore();

    // Axis ticks on σ = 0, ½, 1
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
    ctx.fillText('σ=0', toScreenX(0) + 4, 14);
    ctx.fillStyle = '#67E8F9';
    ctx.fillText('σ=½', xHalf + 5, 14);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
    ctx.fillText('σ=1', toScreenX(1) + 4, 14);

    // Non-trivial zeros visible in complex strip
    for (const z of zeros) {
      if (z.gamma < imMin - 0.5 || z.gamma > imMax + 0.5) continue;
      const zy = toScreenY(z.gamma);
      const isPassed = z.gamma <= tCursor + 1e-4;
      ctx.beginPath();
      ctx.arc(xHalf, zy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = isPassed ? '#F59E0B' : 'rgba(245, 158, 11, 0.55)';
      ctx.fill();
      ctx.strokeStyle = '#07090E';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#FDE68A';
      ctx.fillText(`ρ${z.index} (${z.gamma.toFixed(2)}i)`, xHalf + 9, zy + 3);
    }

    // Current live point s = 1/2 + i*tCursor
    const ptY = toScreenY(tCursor);
    ctx.beginPath();
    ctx.arc(xHalf, ptY, 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.5)';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(xHalf, ptY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(`s = ½ + ${tCursor.toFixed(2)}i`, xHalf + 13, ptY - 7);
  }, [complexSize, tCursor, zeros]);

  // Precompute prime counting curves & per-zero deltas whenever xMax changes
  const primePrecomputed = useMemo(() => {
    const gridCount = 260;
    const xMin = 2.0;
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
  }, [xMax, primes, gammas]);

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

  // 3. Draw Row 3: Prime Counting pi(x), Li(x) & pi_N(x)
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
    const padT = 14;
    const padB = 26;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxY = Math.max(
      10,
      primePrecomputed.exactPi[primePrecomputed.gridCount] * 1.12,
      primePrecomputed.liVals[primePrecomputed.gridCount] * 1.05
    );
    const toX = (x: number) => padL + ((x - 2) / (xMax - 2)) * plotW;
    const toY = (y: number) => padT + plotH - (Math.max(-1, y) / maxY) * plotH;

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
      ctx.fillText(x.toString(), px - 6, height - 8);
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
  }, [primeSize, xMax, primePrecomputed, riemannCurve, primes, showLi]);

  const currentZeta = useMemo(() => zeta({ re: 0.5, im: tCursor }, 'high'), [tCursor]);
  const currentHardy = useMemo(() => hardyZ(tCursor), [tCursor]);
  const latestZero = activeZeroCount > 0 ? zeros[activeZeroCount - 1] : null;
  const nextZero = zeros[activeZeroCount] ?? null;

  const handleZPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1 && e.type === 'pointermove') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const padL = 44;
    const padR = 16;
    const plotW = zSize.width - padL - padR;
    const ratio = Math.max(0, Math.min(1, (px - padL) / plotW));
    const nextT = Math.max(T_MIN, Math.min(T_MAX, tWindowStart + ratio * zWindowSpan));
    setIsPlaying(false);
    setTCursor(nextT);
  };

  return (
    <div className="flex flex-col gap-3 p-4 max-w-[1440px] w-full mx-auto">
      {/* Synchronized Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#0B0E17] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/15 border border-cyan-500/40 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Entlang der Geraden fahren'}</span>
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
              setTCursor(11.5);
              onSelectZero(0);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#07090E] px-3 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Zurücksetzen</span>
          </button>
        </div>

        {/* Live Synchronized Scrubber & Readouts */}
        <div className="flex flex-wrap items-center gap-5 flex-1 justify-end min-w-[280px]">
          <div className="flex items-center gap-3 min-w-[210px] flex-1 max-w-[320px]">
            <span className="text-xs text-slate-400 whitespace-nowrap">Position t</span>
            <input
              type="range"
              min={T_MIN}
              max={T_MAX}
              step={0.05}
              value={tCursor}
              onChange={(e) => {
                setIsPlaying(false);
                setTCursor(parseFloat(e.target.value));
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
              Nullstellen N = {activeZeroCount}
            </span>
          </div>
        </div>
      </div>

      {/* Curve 1 (Top): Hardy Z(t) along Critical Line */}
      <section className="rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              1. Kritische Gerade — Hardy-Funktion Z(t)
            </h2>
            <span className="text-xs text-slate-400">
              {nextZero
                ? `Nächste Nullstelle: ρ${nextZero.index} bei t = ${nextZero.gamma.toFixed(4)}`
                : 'Alle 80 Nullstellen durchlaufen'}
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
        <div ref={zContainerRef} className="h-[180px] w-full">
          <canvas
            ref={zCanvasRef}
            onPointerDown={handleZPointer}
            onPointerMove={handleZPointer}
            className="h-full w-full block cursor-crosshair touch-none"
          />
        </div>
      </section>

      {/* Curve 2 (Middle): Value-Plane Spiral + Moving Point in Complex Plane */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                2a. Wertebenen-Spirale ζ(½ + it)
              </h2>
              <p className="text-[11px] text-slate-400">
                Trifft den Ursprung (0, 0) exakt beim Nulldurchgang
              </p>
            </div>
            <span className="font-mono text-xs text-cyan-300 tabular-nums">
              {formatComplex(currentZeta, 3)}
            </span>
          </div>
          <div ref={spiralContainerRef} className="h-[235px] w-full">
            <canvas ref={spiralCanvasRef} className="h-full w-full block" />
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                2b. Punkt in der Komplexen Ebene (σ = ½)
              </h2>
              <p className="text-[11px] text-slate-400">
                Wandert live entlang der kritischen Geraden durch jeden Phasenwirbel
              </p>
            </div>
            <span className="font-mono text-xs text-slate-200 tabular-nums">
              |ζ| = {cAbs(currentZeta).toFixed(3)}
            </span>
          </div>
          <div ref={complexContainerRef} className="h-[235px] w-full">
            <canvas ref={complexCanvasRef} className="h-full w-full block" />
          </div>
        </section>
      </div>

      {/* Curve 3 (Bottom): Prime Counting pi(x), Li(x) & pi_N(x) */}
      <section
        className={`rounded-xl border bg-[#0B0E17] overflow-hidden transition-colors duration-200 ${
          flashZeroIndex !== null ? 'border-amber-500/60' : 'border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              3. Primzahl-Zählfunktion π(x), Li(x) &amp; Explizite Formel πₙ(x)
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">
              <span className="text-amber-400">Bernstein: π(x) exakt</span>
              <span aria-hidden="true">·</span>
              <span className="text-cyan-400">
                Cyan: πₙ(x) mit {activeZeroCount} Nullstellenpaaren
              </span>
              {latestZero && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className={flashZeroIndex !== null ? 'text-amber-300 font-semibold' : 'text-slate-300'}>
                    Zuletzt aufsummiert: ρ{latestZero.index} (γ = {latestZero.gamma.toFixed(4)})
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">x_max:</span>
              <input
                type="range"
                min={25}
                max={140}
                step={5}
                value={xMax}
                onChange={(e) => setXMax(parseInt(e.target.value, 10))}
                className="obs-slider w-24"
              />
              <span className="font-mono text-slate-200 tabular-nums w-7">{xMax}</span>
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

        <div ref={primeContainerRef} className="h-[245px] w-full">
          <canvas ref={primeCanvasRef} className="h-full w-full block" />
        </div>
      </section>
    </div>
  );
}
