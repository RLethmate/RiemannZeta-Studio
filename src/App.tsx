import { useCallback, useMemo, useState } from 'react';
import { getFirstHundredZeros } from './math/zeros';
import { ComplexPlaneView } from './components/ComplexPlaneView';
import { CriticalLineView } from './components/CriticalLineView';
import { PrimeWavesView } from './components/PrimeWavesView';
import { SyncWith3DLabView } from './components/SyncWith3DLabView';
import { TheoryView, type LabTab } from './components/TheoryView';
import { TOUR_STOPS, TourOverlay } from './components/TourOverlay';

const NAV_ITEMS: { id: LabTab; label: string }[] = [
  { id: 'complex', label: 'Komplexe Ebene' },
  { id: 'critical', label: 'Kritische Gerade' },
  { id: 'primes', label: 'Primzahl-Wellen' },
  { id: 'sync', label: 'Synchron-Labor' },
  { id: 'theory', label: 'Grundlagen' },
];

export default function App() {
  const zeros = useMemo(() => getFirstHundredZeros(), []);

  const [activeTab, setActiveTab] = useState<LabTab>('complex');
  const [selectedZeroIndex, setSelectedZeroIndex] = useState(0);

  // Complex plane viewport state
  const [centerRe, setCenterRe] = useState(-0.5);
  const [centerIm, setCenterIm] = useState(25.0);
  const [zoom, setZoom] = useState(16);

  // Prime waves harmonic count state
  const [primeNumZeros, setPrimeNumZeros] = useState(18);

  // Guided tour state
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const handleViewportChange = useCallback((re: number, im: number, nextZoom: number) => {
    setCenterRe(re);
    setCenterIm(im);
    setZoom(nextZoom);
  }, []);

  const applyTourStop = useCallback((idx: number) => {
    const stop = TOUR_STOPS[idx];
    if (!stop) return;
    setTourStep(idx);
    setActiveTab(stop.tab);
    if (stop.centerRe !== undefined && stop.centerIm !== undefined && stop.zoom !== undefined) {
      setCenterRe(stop.centerRe);
      setCenterIm(stop.centerIm);
      setZoom(stop.zoom);
    }
    if (stop.zeroIndex !== undefined) {
      setSelectedZeroIndex(stop.zeroIndex);
    }
    if (stop.primeN !== undefined) {
      setPrimeNumZeros(stop.primeN);
    }
  }, []);

  const handleNavigateLandmark = useCallback(
    (
      tab: LabTab,
      options?: {
        centerRe?: number;
        centerIm?: number;
        zoom?: number;
        zeroIndex?: number;
        primeN?: number;
      }
    ) => {
      setActiveTab(tab);
      if (
        options?.centerRe !== undefined &&
        options?.centerIm !== undefined &&
        options?.zoom !== undefined
      ) {
        setCenterRe(options.centerRe);
        setCenterIm(options.centerIm);
        setZoom(options.zoom);
      }
      if (options?.zeroIndex !== undefined) {
        setSelectedZeroIndex(options.zeroIndex);
      }
      if (options?.primeN !== undefined) {
        setPrimeNumZeros(options.primeN);
      }
    },
    []
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#07090E] text-slate-100">
      {/* 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 border-b border-slate-800 bg-[#0B0E17] px-6 py-3.5">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('complex')}
          className="text-base font-bold tracking-tight text-slate-100 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Zeta-Observatorium
        </button>

        {/* Zone 2: 4 clean single-line navigation links */}
        <nav
          aria-label="Labor-Module"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'border-cyan-400 text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              if (tourOpen) {
                setTourOpen(false);
              } else {
                setTourOpen(true);
                applyTourStop(0);
              }
            }}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {tourOpen ? 'Tour beenden' : 'Geführte Tour'}
          </button>
        </div>
      </header>

      {/* Mobile Nav Strip */}
      <nav
        aria-label="Mobile Navigation"
        className="flex md:hidden items-center gap-4 overflow-x-auto border-b border-slate-800 bg-[#0B0E17] px-4 py-2 text-xs font-medium"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`py-1 border-b-2 whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'border-cyan-400 text-slate-100'
                  : 'border-transparent text-slate-400'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Active Workspace */}
      <main className="flex-1 flex flex-col">
        {activeTab === 'complex' && (
          <ComplexPlaneView
            centerRe={centerRe}
            centerIm={centerIm}
            zoom={zoom}
            onViewportChange={handleViewportChange}
            zeros={zeros}
            selectedZeroIndex={selectedZeroIndex}
            onSelectZero={setSelectedZeroIndex}
            onJumpToCriticalZero={(idx) => {
              setSelectedZeroIndex(idx);
              setActiveTab('critical');
            }}
          />
        )}

        {activeTab === 'critical' && (
          <CriticalLineView
            zeros={zeros}
            selectedZeroIndex={selectedZeroIndex}
            onSelectZero={setSelectedZeroIndex}
            onJumpToComplex={(gamma) => {
              setCenterRe(0.5);
              setCenterIm(gamma);
              setZoom(92);
              setActiveTab('complex');
            }}
            onJumpToPrimes={(idx) => {
              setSelectedZeroIndex(idx);
              setActiveTab('primes');
            }}
          />
        )}

        {activeTab === 'primes' && (
          <PrimeWavesView
            zeros={zeros}
            selectedZeroIndex={selectedZeroIndex}
            onSelectZero={setSelectedZeroIndex}
            numZeros={primeNumZeros}
            onNumZerosChange={setPrimeNumZeros}
          />
        )}

        {activeTab === 'sync' && (
          <SyncWith3DLabView
            zeros={zeros}
            selectedZeroIndex={selectedZeroIndex}
            onSelectZero={setSelectedZeroIndex}
            centerRe={centerRe}
            centerIm={centerIm}
            zoom={zoom}
            onViewportChange={handleViewportChange}
          />
        )}

        {activeTab === 'theory' && (
          <TheoryView onNavigateLandmark={handleNavigateLandmark} />
        )}
      </main>

      {tourOpen && (
        <TourOverlay
          stepIndex={tourStep}
          onStepChange={applyTourStop}
          onClose={() => setTourOpen(false)}
        />
      )}
    </div>
  );
}
