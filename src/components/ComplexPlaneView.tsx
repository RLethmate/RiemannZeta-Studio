import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Compass, RotateCcw, ZoomIn, ZoomOut, ArrowRight } from 'lucide-react';
import { cAbs, cArg, formatComplex, zeta } from '../math/complex';
import type { ZetaZero } from '../math/zeros';
import { MathFormula } from './MathFormula';
import { ComplexPlane3D } from './ComplexPlane3D';

export type ComplexColorMode = 'phase' | 'magnitude' | 'nodal' | '3d';

interface ComplexPlaneViewProps {
  centerRe: number;
  centerIm: number;
  zoom: number; // pixels per unit
  onViewportChange: (centerRe: number, centerIm: number, zoom: number) => void;
  zeros: ZetaZero[];
  selectedZeroIndex: number;
  onSelectZero: (index: number) => void;
  onJumpToCriticalZero: (index: number) => void;
}

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

function colorForZeta(re: number, im: number, mode: ComplexColorMode): [number, number, number] {
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    return [248, 250, 252];
  }
  const mag = Math.hypot(re, im);

  if (mode === 'phase') {
    const arg = Math.atan2(im, re); // [-pi, pi]
    const hue = (arg + Math.PI) / (2 * Math.PI);
    const logMag = Math.log2(mag + 1e-10);
    // Subtle logarithmic contour lines
    const frac = logMag - Math.floor(logMag);
    const contour = 0.88 + 0.12 * Math.cos(frac * Math.PI * 2);

    // Lightness maps zeros -> dark well, moderate values -> rich saturated hues, pole -> white
    let lightness: number;
    if (mag < 1) {
      lightness = 0.1 + 0.42 * Math.pow(mag, 0.42);
    } else {
      lightness = 0.52 + 0.44 * (1 - 1 / (1 + 0.35 * Math.log(mag + 1)));
    }
    lightness = Math.max(0.05, Math.min(0.97, lightness * contour));
    return hslToRgb(hue, 0.86, lightness);
  }

  if (mode === 'magnitude') {
    const logM = Math.log10(mag + 1e-5);
    // Map [-3.5, 2.0] -> [0, 1]
    const t = Math.max(0, Math.min(1, (logM + 3.5) / 5.5));
    const contour = Math.abs((logM * 2) - Math.round(logM * 2)) < 0.06 ? 1.16 : 1.0;
    let r = 7;
    let g = 9;
    let b = 14;
    if (t < 0.35) {
      const k = t / 0.35;
      r = 7 + k * 14;
      g = 9 + k * 48;
      b = 14 + k * 140;
    } else if (t < 0.68) {
      const k = (t - 0.35) / 0.33;
      r = 21 - k * 15;
      g = 57 + k * 125;
      b = 154 + k * 58;
    } else {
      const k = (t - 0.68) / 0.32;
      r = 6 + k * 244;
      g = 182 + k * 36;
      b = 212 - k * 150;
    }
    return [
      Math.min(255, Math.round(r * contour)),
      Math.min(255, Math.round(g * contour)),
      Math.min(255, Math.round(b * contour)),
    ];
  }

  // 'nodal': Re(zeta) = 0 (cyan) and Im(zeta) = 0 (amber)
  const scale = 1 / (1 + mag * 0.45);
  const reBand = Math.exp(-Math.pow((re * scale) / 0.085, 2));
  const imBand = Math.exp(-Math.pow((im * scale) / 0.085, 2));
  const r = Math.min(255, Math.round(10 + 6 * reBand + 245 * imBand));
  const g = Math.min(255, Math.round(14 + 182 * reBand + 158 * imBand));
  const b = Math.min(255, Math.round(24 + 212 * reBand + 11 * imBand));
  return [r, g, b];
}

const BOOKMARKS = [
  {
    id: 'strip',
    label: 'Kritischer Streifen',
    centerRe: 0.5,
    centerIm: 12.0,
    zoom: 30,
    note: 'Überblick über 0 ≤ σ ≤ 1 mit Polstelle bei s = 1 und den ersten Nullstellen.',
  },
  {
    id: 'pole',
    label: 'Polstelle s = 1',
    centerRe: 1.0,
    centerIm: 0.0,
    zoom: 75,
    note: 'Einfacher Pol: Alle Phasenfarben laufen im Uhrzeigersinn zusammen, der Betrag wächst unbegrenzt.',
  },
  {
    id: 'rho1',
    label: 'Erste Nullstelle ρ₁',
    centerRe: 0.5,
    centerIm: 14.1347,
    zoom: 95,
    note: 'Erste nicht-triviale Nullstelle bei ½ + 14,1347i — ein deutlicher Phasenwirbel gegen den Uhrzeigersinn.',
  },
  {
    id: 'trivial',
    label: 'Triviale Nullstellen',
    centerRe: -4.0,
    centerIm: 0.0,
    zoom: 56,
    note: 'Durch den Faktor sin(πs/2) der Funktionalgleichung verschwindet ζ(s) bei s = −2, −4, −6, …',
  },
];

export function ComplexPlaneView({
  centerRe,
  centerIm,
  zoom,
  onViewportChange,
  zeros,
  selectedZeroIndex,
  onSelectZero,
  onJumpToCriticalZero,
}: ComplexPlaneViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [colorMode, setColorMode] = useState<ComplexColorMode>('phase');
  const [showStrip, setShowStrip] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showWindingProbe, setShowWindingProbe] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  const [hoverPoint, setHoverPoint] = useState<{ re: number; im: number } | null>(null);
  const [pinnedPoint, setPinnedPoint] = useState<{ re: number; im: number }>({
    re: 0.5,
    im: 14.134725,
  });
  const [inputRe, setInputRe] = useState('0.5');
  const [inputIm, setInputIm] = useState('14.1347');

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startCenterRe: number;
    startCenterIm: number;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startCenterRe: centerRe,
    startCenterIm: centerIm,
    moved: false,
  });

  // Track container dimensions cleanly
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(320, Math.floor(entry.contentRect.width));
        const h = Math.max(360, Math.floor(entry.contentRect.height));
        setCanvasSize({ width: w, height: h });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Coordinate conversions
  const screenToComplex = useCallback(
    (px: number, py: number) => {
      const re = centerRe + (px - canvasSize.width * 0.5) / zoom;
      const im = centerIm - (py - canvasSize.height * 0.5) / zoom;
      return { re, im };
    },
    [centerRe, centerIm, zoom, canvasSize]
  );

  const complexToScreen = useCallback(
    (re: number, im: number) => {
      const px = canvasSize.width * 0.5 + (re - centerRe) * zoom;
      const py = canvasSize.height * 0.5 - (im - centerIm) * zoom;
      return { px, py };
    },
    [centerRe, centerIm, zoom, canvasSize]
  );

  // Progressive base canvas rendering (coarse instant pass + chunked full-res pass)
  useEffect(() => {
    if (colorMode === '3d') return;
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const { width, height } = canvasSize;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;

    // 1. Immediate coarse pass (block size 5) for instant 60fps feedback
    const coarseStep = 5;
    const imgCoarse = ctx.createImageData(width, height);
    const dataCoarse = imgCoarse.data;

    for (let y = 0; y < height; y += coarseStep) {
      const im = centerIm - (y - height * 0.5) / zoom;
      for (let x = 0; x < width; x += coarseStep) {
        const re = centerRe + (x - width * 0.5) / zoom;
        const val = zeta({ re, im }, 'fast');
        const [r, g, b] = colorForZeta(val.re, val.im, colorMode);

        for (let dy = 0; dy < coarseStep && y + dy < height; dy++) {
          for (let dx = 0; dx < coarseStep && x + dx < width; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            dataCoarse[idx] = r;
            dataCoarse[idx + 1] = g;
            dataCoarse[idx + 2] = b;
            dataCoarse[idx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(imgCoarse, 0, 0);

    // 2. Progressive crisp pixel-by-pixel pass chunked in animation frames
    setIsRefining(true);
    const fullImg = ctx.createImageData(width, height);
    const fullData = fullImg.data;
    let currentY = 0;

    const timer = window.setTimeout(() => {
      function renderSlice() {
        if (cancelled || !ctx) return;
        const startTime = performance.now();
        while (currentY < height && performance.now() - startTime < 14) {
          const im = centerIm - (currentY - height * 0.5) / zoom;
          const rowOffset = currentY * width * 4;
          for (let x = 0; x < width; x++) {
            const re = centerRe + (x - width * 0.5) / zoom;
            const val = zeta({ re, im }, 'fast');
            const [r, g, b] = colorForZeta(val.re, val.im, colorMode);
            const idx = rowOffset + x * 4;
            fullData[idx] = r;
            fullData[idx + 1] = g;
            fullData[idx + 2] = b;
            fullData[idx + 3] = 255;
          }
          currentY++;
        }

        if (cancelled) return;
        ctx.putImageData(fullImg, 0, 0, 0, 0, width, currentY);

        if (currentY < height) {
          requestAnimationFrame(renderSlice);
        } else {
          setIsRefining(false);
        }
      }
      requestAnimationFrame(renderSlice);
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [centerRe, centerIm, zoom, colorMode, canvasSize]);

  const activePoint = hoverPoint ?? pinnedPoint;

  // Cauchy argument principle winding number along a small circle around activePoint
  const windingInfo = useMemo(() => {
    if (!showWindingProbe) return null;
    const radius = Math.min(0.8, Math.max(0.12, 34 / zoom));
    const samples = 72;
    let totalDeltaArg = 0;
    let prevArg = 0;
    for (let i = 0; i <= samples; i++) {
      const theta = (i / samples) * Math.PI * 2;
      const pt = {
        re: activePoint.re + radius * Math.cos(theta),
        im: activePoint.im + radius * Math.sin(theta),
      };
      const val = zeta(pt, 'high');
      const arg = cArg(val);
      if (i > 0) {
        let d = arg - prevArg;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        totalDeltaArg += d;
      }
      prevArg = arg;
    }
    const winding = Math.round(totalDeltaArg / (2 * Math.PI));
    return { radius, winding, rawTurns: totalDeltaArg / (2 * Math.PI) };
  }, [showWindingProbe, activePoint, zoom]);

  // Draw crisp vector overlay (axes, critical strip, zero markers, crosshair, winding circle)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const { width, height } = canvasSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const minRe = centerRe - (width * 0.5) / zoom;
    const maxRe = centerRe + (width * 0.5) / zoom;
    const minIm = centerIm - (height * 0.5) / zoom;
    const maxIm = centerIm + (height * 0.5) / zoom;

    // 1. Critical strip shading & boundary lines (0 <= Re(s) <= 1)
    if (showStrip) {
      const x0 = complexToScreen(0, 0).px;
      const xHalf = complexToScreen(0.5, 0).px;
      const x1 = complexToScreen(1, 0).px;

      if (x1 > 0 && x0 < width) {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.06)';
        ctx.fillRect(Math.max(0, x0), 0, Math.min(width, x1) - Math.max(0, x0), height);
      }

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1;
      for (const xLine of [x0, x1]) {
        if (xLine >= 0 && xLine <= width) {
          ctx.beginPath();
          ctx.moveTo(xLine, 0);
          ctx.lineTo(xLine, height);
          ctx.stroke();
        }
      }

      // Critical line Re(s) = 0.5
      if (xHalf >= 0 && xHalf <= width) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(xHalf, 0);
        ctx.lineTo(xHalf, height);
        ctx.stroke();

        ctx.fillStyle = 'rgba(6, 182, 212, 0.95)';
        ctx.font = '500 11px "IBM Plex Mono", monospace';
        ctx.fillText('σ = ½', xHalf + 6, 18);
      }
      ctx.restore();
    }

    // 2. Coordinate axes & nice grid ticks
    const origin = complexToScreen(0, 0);
    const rawStep = 75 / zoom;
    const pow10 = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / pow10;
    const step =
      norm < 1.5 ? pow10 : norm < 3.5 ? 2 * pow10 : norm < 7.5 ? 5 * pow10 : 10 * pow10;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(203, 213, 225, 0.72)';

    const startReTick = Math.ceil(minRe / step) * step;
    for (let r = startReTick; r <= maxRe; r += step) {
      const px = complexToScreen(r, 0).px;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
      const labelY = Math.min(height - 8, Math.max(14, origin.py + 13));
      const label = Math.abs(r) < 1e-9 ? '0' : Number(r.toFixed(2)).toString();
      ctx.fillText(label, px + 3, labelY);
    }

    const startImTick = Math.ceil(minIm / step) * step;
    for (let im = startImTick; im <= maxIm; im += step) {
      const py = complexToScreen(0, im).py;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
      if (Math.abs(im) > 1e-9) {
        const labelX = Math.min(width - 40, Math.max(6, origin.px + 6));
        const label = `${Number(im.toFixed(2))}i`;
        ctx.fillText(label, labelX, py - 4);
      }
    }

    // Strong Re & Im axes
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 1;
    if (origin.py >= 0 && origin.py <= height) {
      ctx.beginPath();
      ctx.moveTo(0, origin.py);
      ctx.lineTo(width, origin.py);
      ctx.stroke();
    }
    if (origin.px >= 0 && origin.px <= width) {
      ctx.beginPath();
      ctx.moveTo(origin.px, 0);
      ctx.lineTo(origin.px, height);
      ctx.stroke();
    }

    // 3. Pole & Zeros Markers
    if (showMarkers) {
      // Pole at s = 1
      const pole = complexToScreen(1, 0);
      if (pole.px >= -20 && pole.px <= width + 20 && pole.py >= -20 && pole.py <= height + 20) {
        ctx.beginPath();
        ctx.arc(pole.px, pole.py, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#F43F5E';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#07090E';
        ctx.fill();
        ctx.fillStyle = '#FDA4AF';
        ctx.font = '500 11px "IBM Plex Mono", monospace';
        ctx.fillText('Pol s=1', pole.px + 9, pole.py - 6);
      }

      // Trivial zeros at -2, -4, -6, ...
      for (let k = -2; k >= Math.floor(minRe) - 1; k -= 2) {
        if (k > maxRe + 1) continue;
        const pt = complexToScreen(k, 0);
        if (pt.py >= -20 && pt.py <= height + 20) {
          ctx.beginPath();
          ctx.arc(pt.px, pt.py, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#94A3B8';
          ctx.fill();
          ctx.strokeStyle = '#07090E';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = '#CBD5E1';
          ctx.font = '400 10px "IBM Plex Mono", monospace';
          ctx.fillText(`${k}`, pt.px - 6, pt.py - 8);
        }
      }

      // Non-trivial zeros (both +gamma and -gamma)
      const selectedZero = zeros[selectedZeroIndex];
      for (const z of zeros) {
        for (const sign of [1, -1]) {
          const im = sign * z.gamma;
          if (im < minIm - 1 || im > maxIm + 1) continue;
          const pt = complexToScreen(0.5, im);
          if (pt.px < -20 || pt.px > width + 20) continue;

          const isSelected = selectedZero && z.index === selectedZero.index && sign === 1;
          ctx.beginPath();
          ctx.arc(pt.px, pt.py, isSelected ? 6.5 : 4.5, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? '#F59E0B' : 'rgba(245, 158, 11, 0.75)';
          ctx.fill();
          ctx.strokeStyle = '#07090E';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          if (isSelected) {
            ctx.beginPath();
            ctx.arc(pt.px, pt.py, 11, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
            ctx.lineWidth = 1.25;
            ctx.stroke();
          }

          ctx.fillStyle = isSelected ? '#FDE68A' : 'rgba(254, 243, 199, 0.85)';
          ctx.font = `${isSelected ? '600' : '500'} 10px "IBM Plex Mono", monospace`;
          ctx.fillText(`ρ${z.index}${sign < 0 ? '̄' : ''}`, pt.px + 9, pt.py + 3);
        }
      }
    }

    // 4. Crosshair & Winding Probe Circle
    const targetScreen = complexToScreen(activePoint.re, activePoint.im);
    ctx.save();
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.32)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(targetScreen.px, 0);
    ctx.lineTo(targetScreen.px, height);
    ctx.moveTo(0, targetScreen.py);
    ctx.lineTo(width, targetScreen.py);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(targetScreen.px, targetScreen.py, 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#F8FAFC';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (showWindingProbe && windingInfo) {
      const rPx = windingInfo.radius * zoom;
      ctx.beginPath();
      ctx.arc(targetScreen.px, targetScreen.py, rPx, 0, Math.PI * 2);
      ctx.strokeStyle =
        windingInfo.winding > 0
          ? '#F59E0B'
          : windingInfo.winding < 0
            ? '#F43F5E'
            : '#06B6D4';
      ctx.lineWidth = 1.75;
      ctx.stroke();
    }
  }, [
    canvasSize,
    centerRe,
    centerIm,
    zoom,
    showStrip,
    showMarkers,
    showWindingProbe,
    windingInfo,
    activePoint,
    zeros,
    selectedZeroIndex,
    complexToScreen,
  ]);

  const activeZeta = useMemo(() => {
    return zeta({ re: activePoint.re, im: activePoint.im }, 'high');
  }, [activePoint]);

  const activeMag = cAbs(activeZeta);
  const activeArgDeg = ((cArg(activeZeta) * 180) / Math.PI).toFixed(1);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startCenterRe: centerRe,
      startCenterIm: centerIm,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.hypot(dx, dy) > 4) {
        dragRef.current.moved = true;
      }
      if (dragRef.current.moved) {
        onViewportChange(
          dragRef.current.startCenterRe - dx / zoom,
          dragRef.current.startCenterIm + dy / zoom,
          zoom
        );
        return;
      }
    }

    setHoverPoint(screenToComplex(px, py));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.active = false;

    if (!wasMoved) {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const pt = screenToComplex(px, py);

      // Check if user clicked near a non-trivial zero marker
      for (let i = 0; i < zeros.length; i++) {
        const z = zeros[i];
        const scr = complexToScreen(0.5, z.gamma);
        if (Math.hypot(scr.px - px, scr.py - py) < 15) {
          onSelectZero(i);
          setPinnedPoint({ re: 0.5, im: z.gamma });
          return;
        }
      }
      setPinnedPoint(pt);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const before = screenToComplex(px, py);

    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const nextZoom = Math.max(10, Math.min(600, zoom * factor));
    const nextCenterRe = before.re - (px - canvasSize.width * 0.5) / nextZoom;
    const nextCenterIm = before.im + (py - canvasSize.height * 0.5) / nextZoom;
    onViewportChange(nextCenterRe, nextCenterIm, nextZoom);
  };

  const selectedZero = zeros[selectedZeroIndex];

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-[640px] gap-4 p-4">
      {/* Left: Dominant Complex Canvas Stage */}
      <div className="relative flex-1 min-h-[460px] rounded-xl border border-slate-800 bg-[#07090E] overflow-hidden flex flex-col">
        {/* Stage Top HUD */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 bg-[#0B0E17] px-4 py-2.5">
          <div className="flex items-center gap-1 rounded-lg bg-[#07090E] p-1 border border-slate-800">
            {(
              [
                ['phase', 'Phase + Konturen'],
                ['magnitude', 'Betrags-Relief'],
                ['nodal', 'Re / Im Nulllinien'],
                ['3d', '3D Gebirge'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setColorMode(mode)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  colorMode === mode
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onViewportChange(centerRe, centerIm, Math.min(600, zoom * 1.35))}
              title="Hineinzoomen"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 bg-[#07090E] text-slate-300 hover:border-slate-700 hover:text-white transition-colors cursor-pointer"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewportChange(centerRe, centerIm, Math.max(10, zoom / 1.35))}
              title="Herauszoomen"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 bg-[#07090E] text-slate-300 hover:border-slate-700 hover:text-white transition-colors cursor-pointer"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewportChange(0.5, 12.0, 30)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-800 bg-[#07090E] text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Zurücksetzen</span>
            </button>
          </div>
        </div>

        {/* Interactive 2D Dual Canvas or 3D Surface */}
        {colorMode === '3d' ? (
          <ComplexPlane3D
            centerRe={centerRe}
            centerIm={centerIm}
            zoom={zoom}
            onViewportChange={onViewportChange}
            zeros={zeros}
            selectedZeroIndex={selectedZeroIndex}
            showStrip={showStrip}
            showMarkers={showMarkers}
            onHoverPoint={setHoverPoint}
            onPinPoint={(pt) => setPinnedPoint(pt)}
          />
        ) : (
          <div ref={containerRef} className="relative flex-1 w-full overflow-hidden">
            <canvas
              ref={baseCanvasRef}
              className="absolute inset-0 h-full w-full block"
            />
            <canvas
              ref={overlayCanvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => {
                dragRef.current.active = false;
                setHoverPoint(null);
              }}
              onWheel={handleWheel}
              className="absolute inset-0 h-full w-full block cursor-crosshair touch-none"
            />

            {/* Compact Corner Legend */}
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-slate-800/90 bg-[#07090E]/90 px-3 py-2 text-xs text-slate-300">
              {colorMode === 'phase' && (
                <div className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-24 rounded-sm"
                    style={{
                      background:
                        'linear-gradient(90deg, #00e5ff, #3b82f6, #a855f7, #ef4444, #f59e0b, #22c55e, #00e5ff)',
                    }}
                  />
                  <span className="font-mono text-[11px] text-slate-400">
                    Phase arg(ζ) · Dunkel = Nullstelle · Hell = Pol
                  </span>
                </div>
              )}
              {colorMode === 'magnitude' && (
                <div className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-24 rounded-sm"
                    style={{
                      background:
                        'linear-gradient(90deg, #07090e, #1d4ed8, #06b6d4, #f59e0b, #ffffff)',
                    }}
                  />
                  <span className="font-mono text-[11px] text-slate-400">
                    Betrag log₁₀|ζ(s)| · Täler zeigen Nullstellen
                  </span>
                </div>
              )}
              {colorMode === 'nodal' && (
                <div className="flex items-center gap-3 font-mono text-[11px] text-slate-300">
                  <span className="text-cyan-400">Cyan: Re(ζ) = 0</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400">Bernstein: Im(ζ) = 0</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-400">Schnittpunkt = Nullstelle</span>
                </div>
              )}
            </div>

            {isRefining && (
              <div className="pointer-events-none absolute top-3 right-3 rounded-md border border-slate-800 bg-[#07090E]/85 px-2.5 py-1 font-mono text-[11px] text-slate-400">
                Verfeinere Auflösung…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Telemetry, Controls & Contextual Explanation */}
      <aside className="w-full lg:w-[360px] shrink-0 flex flex-col gap-4">
        {/* Live Crosshair Readout */}
        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Fadenkreuz-Messung
            </h2>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums">
              {hoverPoint ? 'Live-Zeiger' : 'Fixierter Punkt'}
            </span>
          </div>

          <div className="mt-3 space-y-2.5 font-mono text-sm tabular-nums">
            <div className="flex items-baseline justify-between border-b border-slate-800/70 pb-2">
              <span className="text-xs text-slate-400">s = σ + it</span>
              <span className="text-slate-100 font-medium">
                {activePoint.re.toFixed(4)} {activePoint.im >= 0 ? '+' : '−'}{' '}
                {Math.abs(activePoint.im).toFixed(4)}i
              </span>
            </div>
            <div className="flex items-baseline justify-between border-b border-slate-800/70 pb-2">
              <span className="text-xs text-slate-400">ζ(s)</span>
              <span className="text-cyan-300 font-medium">
                {formatComplex(activeZeta, 4)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-0.5">
              <div>
                <div className="text-[11px] text-slate-500">Betrag |ζ(s)|</div>
                <div className="text-sm font-semibold text-slate-100">
                  {activeMag > 1e5 ? '∞ (Pol)' : activeMag.toExponential(3)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Phase arg(ζ)</div>
                <div className="text-sm font-semibold text-slate-100">
                  {activeArgDeg}°
                </div>
              </div>
            </div>

            {showWindingProbe && windingInfo && (
              <div className="mt-2 rounded-lg border border-slate-800 bg-[#07090E] p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Windungszahl (Argumentprinzip)</span>
                  <span
                    className={`font-semibold ${
                      windingInfo.winding > 0
                        ? 'text-amber-400'
                        : windingInfo.winding < 0
                          ? 'text-rose-400'
                          : 'text-cyan-400'
                    }`}
                  >
                    {windingInfo.winding > 0
                      ? `+${windingInfo.winding} (Nullstelle)`
                      : windingInfo.winding < 0
                        ? `${windingInfo.winding} (Polstelle)`
                        : '0 (regulär)'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const re = parseFloat(inputRe.replace(',', '.'));
              const im = parseFloat(inputIm.replace(',', '.'));
              if (Number.isFinite(re) && Number.isFinite(im)) {
                const clampedRe = Math.max(-25, Math.min(25, re));
                const clampedIm = Math.max(-250, Math.min(250, im));
                setPinnedPoint({ re: clampedRe, im: clampedIm });
                onViewportChange(clampedRe, clampedIm, Math.max(zoom, 48));
              }
            }}
            className="mt-3 pt-3 border-t border-slate-800/70 space-y-2"
          >
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <label className="flex-1">
                <span className="sr-only">Realteil σ</span>
                <input
                  type="text"
                  value={inputRe}
                  onChange={(e) => setInputRe(e.target.value)}
                  placeholder="σ"
                  className="w-full rounded border border-slate-800 bg-[#07090E] px-2 py-1 text-slate-200 focus:border-cyan-500 focus:outline-none"
                />
              </label>
              <span className="text-slate-500">+</span>
              <label className="flex-1">
                <span className="sr-only">Imaginärteil t</span>
                <input
                  type="text"
                  value={inputIm}
                  onChange={(e) => setInputIm(e.target.value)}
                  placeholder="t"
                  className="w-full rounded border border-slate-800 bg-[#07090E] px-2 py-1 text-slate-200 focus:border-cyan-500 focus:outline-none"
                />
              </label>
              <span className="text-slate-500">i</span>
              <button
                type="submit"
                className="rounded border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 font-sans text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap"
              >
                Prüfen
              </button>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              {[
                { label: 'ζ(2)=π²/6', re: 2, im: 0 },
                { label: 'ζ(0)=−½', re: 0, im: 0 },
                { label: 'ζ(−1)=−¹⁄₁₂', re: -1, im: 0 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setInputRe(String(preset.re));
                    setInputIm(String(preset.im));
                    setPinnedPoint({ re: preset.re, im: preset.im });
                    onViewportChange(preset.re, preset.im, Math.max(zoom, 52));
                  }}
                  className="flex-1 rounded border border-slate-800 bg-[#07090E] py-1 text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </form>
        </section>

        {/* Overlay Toggles & Bookmarks */}
        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] p-4 space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Markierungen & Werkzeuge
            </h2>
            <div className="space-y-2 text-xs">
              <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                <span>Kritischer Streifen (0 ≤ σ ≤ 1)</span>
                <input
                  type="checkbox"
                  checked={showStrip}
                  onChange={(e) => setShowStrip(e.target.checked)}
                  className="accent-cyan-500 h-4 w-4 cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                <span>Polstelle & Nullstellen-Marker</span>
                <input
                  type="checkbox"
                  checked={showMarkers}
                  onChange={(e) => setShowMarkers(e.target.checked)}
                  className="accent-cyan-500 h-4 w-4 cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                <span className="inline-flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-amber-400" />
                  <span>Cauchy-Windungsprobe</span>
                </span>
                <input
                  type="checkbox"
                  checked={showWindingProbe}
                  onChange={(e) => setShowWindingProbe(e.target.checked)}
                  className="accent-amber-500 h-4 w-4 cursor-pointer"
                />
              </label>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Lesezeichen in ℂ
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {BOOKMARKS.map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => {
                    onViewportChange(bm.centerRe, bm.centerIm, bm.zoom);
                    setPinnedPoint({ re: bm.centerRe, im: bm.centerIm });
                    if (bm.id === 'rho1') onSelectZero(0);
                  }}
                  className="rounded-lg border border-slate-800 bg-[#07090E] px-2.5 py-2 text-left text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors cursor-pointer truncate"
                >
                  {bm.label}
                </button>
              ))}
            </div>
          </div>

          {selectedZero && (
            <div className="border-t border-slate-800 pt-3 flex items-center justify-between gap-2">
              <div className="text-xs">
                <div className="text-slate-400">Ausgewählte Nullstelle</div>
                <div className="font-mono text-amber-300 tabular-nums">
                  ρ{selectedZero.index} = ½ + {selectedZero.gamma.toFixed(4)}i
                </div>
              </div>
              <button
                type="button"
                onClick={() => onJumpToCriticalZero(selectedZero.index - 1)}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Zu Z(t)</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </section>

        {/* Contextual Explanation */}
        <section className="rounded-xl border border-slate-800 bg-[#0B0E17] p-4 text-xs leading-relaxed text-slate-300">
          <div className="flex items-center gap-1.5 font-semibold text-slate-100 mb-1.5">
            <Crosshair className="h-3.5 w-3.5 text-cyan-400" />
            <span>Was zeigt die Phasenfärbung?</span>
          </div>
          <p className="text-slate-400">
            Jeder Punkt <MathFormula tex="s = \sigma + it" /> erhält die Farbe seines komplexen Winkels{' '}
            <MathFormula tex="\arg(\zeta(s))" />. An jeder Nullstelle laufen alle Farben gegen den Uhrzeigersinn in einen dunklen Trichter zusammen — an der Polstelle{' '}
            <MathFormula tex="s = 1" /> leuchtet das Bild hell auf und die Farben drehen sich umgekehrt.
          </p>
        </section>
      </aside>
    </div>
  );
}
