import { ArrowRight } from 'lucide-react';
import { MathFormula } from './MathFormula';

export type LabTab = 'complex' | 'critical' | 'primes' | 'sync' | 'theory';

interface TheoryViewProps {
  onNavigateLandmark: (
    tab: LabTab,
    options?: {
      centerRe?: number;
      centerIm?: number;
      zoom?: number;
      zeroIndex?: number;
      primeN?: number;
    }
  ) => void;
}

const CHAPTERS = [
  {
    index: '01',
    title: 'Vom Euler-Produkt zur Zeta-Funktion',
    subtitle: 'Warum eine Summe über alle Zahlen plötzlich alle Primzahlen kennt',
    formula:
      '\\zeta(s) = \\sum_{n=1}^{\\infty} \\frac{1}{n^s} = \\prod_{p \\in \\mathbb{P}} \\frac{1}{1 - p^{-s}} \\qquad (\\operatorname{Re}(s) > 1)',
    body: 'Leonhard Euler entdeckte 1737, dass sich die unendliche Summe über alle natürlichen Zahlen als Produkt über alle Primzahlen schreiben lässt. Für komplexe Zahlen s = σ + it konvergiert diese Reihe jedoch nur rechts der Geraden σ = 1. An der Stelle s = 1 divergiert die harmonische Reihe zu einem einfachen Pol.',
    actionLabel: 'Polstelle & Halbebene in ℂ erkunden',
    action: { tab: 'complex' as LabTab, centerRe: 1.0, centerIm: 0.0, zoom: 78 },
  },
  {
    index: '02',
    title: 'Analytische Fortsetzung & Funktionalgleichung',
    subtitle: 'Wie die Funktion die Grenze σ = 1 überwindet und symmetrisch wird',
    formula:
      '\\zeta(s) = 2^s \\pi^{s-1} \\sin\\!\\left(\\frac{\\pi s}{2}\\right) \\Gamma(1-s)\\,\\zeta(1-s)',
    body: 'Bernhard Riemann erweiterte ζ(s) 1859 auf die gesamte komplexe Ebene (mit Ausnahme des Pols bei s = 1). Die Funktionalgleichung verknüpft jeden Punkt s mit seinem Spiegelpunkt 1 − s an der Symmetrieachse σ = ½. Durch den Faktor sin(πs/2) entstehen sofort die sogenannten trivialen Nullstellen bei allen negativen geraden Zahlen s = −2, −4, −6, …',
    actionLabel: 'Triviale Nullstellen im Westen ansehen',
    action: { tab: 'complex' as LabTab, centerRe: -4.0, centerIm: 0.0, zoom: 62 },
  },
  {
    index: '03',
    title: 'Kritischer Streifen & Riemannsche Vermutung',
    subtitle: 'Alle nicht-trivialen Nullstellen und die Hardy-Z-Funktion',
    formula:
      'Z(t) = e^{i\\vartheta(t)}\\,\\zeta\\!\\left(\\tfrac{1}{2} + it\\right) \\in \\mathbb{R}, \\qquad \\rho_n = \\tfrac{1}{2} + i\\gamma_n',
    body: 'Innerhalb des kritischen Streifens 0 < Re(s) < 1 liegen unendlich viele nicht-triviale Nullstellen. Die berühmte Riemannsche Vermutung besagt, dass alle diese Nullstellen exakt auf der kritischen Geraden Re(s) = ½ liegen. Mithilfe der reellwertigen Hardy-Z-Funktion werden Nullstellen als saubere Vorzeichenwechsel entlang der t-Achse sichtbar.',
    actionLabel: 'Kritische Gerade & Nullstellen öffnen',
    action: { tab: 'critical' as LabTab, zeroIndex: 0 },
  },
  {
    index: '04',
    title: 'Die Explizite Formel: Musik der Primzahlen',
    subtitle: 'Wie jede Nullstelle als gedämpfte Schwingung die Primzahl-Treppe formt',
    formula:
      '\\Pi(x) = \\operatorname{li}(x) - \\sum_{\\rho} \\operatorname{li}(x^{\\rho}) - \\ln 2 + \\int_x^{\\infty} \\frac{dt}{t(t^2-1)\\ln t}',
    body: 'Riemanns krönendes Resultat verbindet die Primzahl-Zählfunktion π(x) direkt mit den Nullstellen ρ = ½ + iγ. Während der Hauptterm Li(x) das glatte Wachstum beschreibt, liefert jedes komplexe Nullstellenpaar eine gedämpfte Welle der Frequenz γ·ln(x). Überlagert man genügend viele dieser Frequenzen, formen sich exakt die Sprünge bei 2, 3, 5, 7, 11, …',
    actionLabel: 'Primzahl-Wellen live überlagern',
    action: { tab: 'primes' as LabTab, primeN: 25 },
  },
];

export function TheoryView({ onNavigateLandmark }: TheoryViewProps) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 border-b border-slate-800 pb-6">
        <p className="text-xs font-mono tracking-wider text-cyan-400 uppercase">
          Mathematisches Fundament · 1859
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl text-balance">
          Von den natürlichen Zahlen zur Verteilung der Primzahlen
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Die vier zentralen Bausteine von Bernhard Riemanns Arbeit über die Anzahl der Primzahlen unter einer gegebenen Größe — jeweils direkt mit dem passenden Werkzeug im Observatorium verknüpft.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {CHAPTERS.map((chapter) => (
          <article
            key={chapter.index}
            className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0B0E17] p-6"
          >
            <div>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-semibold text-cyan-400 tabular-nums">
                  {chapter.index}.
                </span>
                <h2 className="text-lg font-semibold text-slate-100 text-balance">
                  {chapter.title}
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">{chapter.subtitle}</p>

              <div className="my-4 overflow-x-auto rounded-lg border border-slate-800/80 bg-[#07090E] px-4 py-3 text-sm">
                <MathFormula tex={chapter.formula} displayMode />
              </div>

              <p className="text-sm leading-relaxed text-slate-300">
                {chapter.body}
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800/70">
              <button
                type="button"
                onClick={() => onNavigateLandmark(chapter.action.tab, chapter.action)}
                className="inline-flex items-center gap-2 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>{chapter.actionLabel}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
