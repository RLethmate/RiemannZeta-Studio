import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { LabTab } from './TheoryView';

export interface TourStop {
  id: number;
  title: string;
  description: string;
  tab: LabTab;
  centerRe?: number;
  centerIm?: number;
  zoom?: number;
  zeroIndex?: number;
  primeN?: number;
}

export const TOUR_STOPS: TourStop[] = [
  {
    id: 1,
    title: '01. Die Polstelle bei s = 1',
    description:
      'Rechts von σ = 1 konvergiert Eulers Summe Σ n⁻ˢ. Genau bei s = 1 divergiert die harmonische Reihe zu einem einfachen Pol: Alle Phasenfarben laufen im Uhrzeigersinn um einen hellen Kern.',
    tab: 'complex',
    centerRe: 1.0,
    centerIm: 0.0,
    zoom: 76,
  },
  {
    id: 2,
    title: '02. Triviale Nullstellen im Westen',
    description:
      'Über Riemanns Funktionalgleichung setzt sich ζ(s) nach links fort. Der Faktor sin(πs/2) erzwingt exakte Nullstellen bei s = −2, −4, −6, … — sichtbar als dunkle Wirbel auf der reellen Achse.',
    tab: 'complex',
    centerRe: -4.0,
    centerIm: 0.0,
    zoom: 56,
  },
  {
    id: 3,
    title: '03. Erste nicht-triviale Nullstelle ρ₁',
    description:
      'Bei s = ½ + 14,1347i liegt die erste nicht-triviale Nullstelle auf der kritischen Geraden. Aktiviere optional die Cauchy-Windungsprobe, um die Windungszahl +1 abzulesen.',
    tab: 'complex',
    centerRe: 0.5,
    centerIm: 14.1347,
    zoom: 95,
    zeroIndex: 0,
  },
  {
    id: 4,
    title: '04. Vorzeichenwechsel der Hardy-Z-Funktion',
    description:
      'Auf der kritischen Geraden verwandelt Z(t) die komplexen Werte in eine reelle Kurve. Jeder Nulldurchgang entspricht einem Durchstoß der Wertebenen-Spirale durch den Ursprung (0, 0).',
    tab: 'critical',
    zeroIndex: 0,
  },
  {
    id: 5,
    title: '05. Nullstellen bauen die Primzahl-Treppe',
    description:
      'Riemanns explizite Formel überlagert 40 Nullstellen-Frequenzen auf das glatte R(x): Aus weichen Wellen formen sich die exakten Stufen bei 2, 3, 5, 7, 11, 13, …',
    tab: 'primes',
    zeroIndex: 0,
    primeN: 40,
  },
];

interface TourOverlayProps {
  stepIndex: number;
  onStepChange: (nextIndex: number) => void;
  onClose: () => void;
}

export function TourOverlay({ stepIndex, onStepChange, onClose }: TourOverlayProps) {
  const stop = TOUR_STOPS[stepIndex];
  if (!stop) return null;

  return (
    <div
      role="region"
      aria-label="Geführte Tour"
      className="fixed bottom-4 left-4 z-40 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-cyan-500/40 bg-[#0B0E17]/95 p-4 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] text-cyan-400 tabular-nums">
            Station {stepIndex + 1} von {TOUR_STOPS.length}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-100">
            {stop.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tour schließen"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-300">
        {stop.description}
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
        <button
          type="button"
          disabled={stepIndex === 0}
          onClick={() => onStepChange(stepIndex - 1)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-[#07090E] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Zurück</span>
        </button>

        <div className="flex items-center gap-1.5">
          {TOUR_STOPS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Zu Station ${idx + 1}`}
              onClick={() => onStepChange(idx)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                idx === stepIndex ? 'w-5 bg-cyan-400' : 'w-1.5 bg-slate-700 hover:bg-slate-500'
              }`}
            />
          ))}
        </div>

        {stepIndex < TOUR_STOPS.length - 1 ? (
          <button
            type="button"
            onClick={() => onStepChange(stepIndex + 1)}
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 cursor-pointer"
          >
            <span>Weiter</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 cursor-pointer"
          >
            <span>Abschließen</span>
          </button>
        )}
      </div>
    </div>
  );
}
