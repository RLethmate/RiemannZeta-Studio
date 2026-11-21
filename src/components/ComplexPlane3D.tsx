import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Rotate3d, Move, RotateCcw } from 'lucide-react';
import { cAbs, zeta } from '../math/complex';
import type { ZetaZero } from '../math/zeros';

interface ComplexPlane3DProps {
  centerRe: number;
  centerIm: number;
  zoom: number;
  onViewportChange: (centerRe: number, centerIm: number, zoom: number) => void;
  zeros: ZetaZero[];
  selectedZeroIndex: number;
  showStrip: boolean;
  showMarkers: boolean;
  activeTravelerIm?: number;
  onHoverPoint: (pt: { re: number; im: number } | null) => void;
  onPinPoint: (pt: { re: number; im: number }) => void;
}

const _mouse = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

function phaseRgbFloat(re: number, im: number): [number, number, number] {
  if (!Number.isFinite(re) || !Number.isFinite(im)) return [0.97, 0.98, 0.99];
  const mag = Math.hypot(re, im);
  const arg = Math.atan2(im, re);
  const hue = ((arg + Math.PI) / (2 * Math.PI) + 1) % 1;

  let lightness: number;
  if (mag < 1) {
    lightness = 0.14 + 0.42 * Math.pow(mag, 0.45);
  } else {
    lightness = 0.56 + 0.38 * (1 - 1 / (1 + 0.35 * Math.log(mag + 1)));
  }
  lightness = Math.max(0.08, Math.min(0.95, lightness));

  const sat = 0.84;
  const c = (1 - Math.abs(2 * lightness - 1)) * sat;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = lightness - c * 0.5;
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
  return [r + m, g + m, b + m];
}

export function ComplexPlane3D({
  centerRe,
  centerIm,
  zoom,
  onViewportChange,
  zeros,
  selectedZeroIndex,
  showStrip,
  showMarkers,
  activeTravelerIm,
  onHoverPoint,
  onPinPoint,
}: ComplexPlane3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  const [heightMode, setHeightMode] = useState<'linear' | 'log'>('linear');
  const [showWireframe, setShowWireframe] = useState(true);
  const [mouseAction, setMouseAction] = useState<'rotate' | 'pan'>('rotate');
  const [webglError, setWebglError] = useState(false);

  // Store latest props in refs so Three.js lifecycle remains stable across React updates
  const propsRef = useRef({
    centerRe,
    centerIm,
    zoom,
    onViewportChange,
    zeros,
    selectedZeroIndex,
    showStrip,
    showMarkers,
    activeTravelerIm,
    onHoverPoint,
    onPinPoint,
    heightMode,
    showWireframe,
    mouseAction,
  });
  propsRef.current = {
    centerRe,
    centerIm,
    zoom,
    onViewportChange,
    zeros,
    selectedZeroIndex,
    showStrip,
    showMarkers,
    activeTravelerIm,
    onHoverPoint,
    onPinPoint,
    heightMode,
    showWireframe,
    mouseAction,
  };

  const rebuildSurfaceRef = useRef<(() => void) | null>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);
  const updateControlModeRef = useRef<(() => void) | null>(null);
  const updateTravelerRef = useRef<(() => void) | null>(null);

  // Initialize Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 520);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090e);
    scene.fog = new THREE.FogExp2(0x07090e, 0.018);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 250);
    camera.position.set(-0.5, 9.5, 16.0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.minDistance = 2.0;
    controls.maxDistance = 60.0;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(-0.5, 0.4, 4.0);

    // 3-point lighting rig
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.65);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.5);
    keyLight.position.set(8, 16, 10);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
    rimLight.position.set(-10, 6, -12);
    scene.add(rimLight);

    // Groups & dynamic objects
    const surfaceGroup = new THREE.Group();
    const overlayGroup = new THREE.Group();
    scene.add(surfaceGroup);
    scene.add(overlayGroup);

    const surfaceMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0.1,
      side: THREE.DoubleSide,
      wireframe: propsRef.current.showWireframe,
    });

    let surfaceMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
    const disposableGeometries: THREE.BufferGeometry[] = [];
    const disposableMaterials: THREE.Material[] = [];

    // Probe sphere for live hover inspection
    const probeGeo = new THREE.SphereGeometry(0.11, 20, 20);
    const probeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const probeMesh = new THREE.Mesh(probeGeo, probeMat);
    probeMesh.visible = false;
    scene.add(probeMesh);

    // Traveler sphere along critical line surface when playing
    const travelerGeo = new THREE.SphereGeometry(0.15, 24, 24);
    const travelerMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.2,
      roughness: 0.1,
    });
    const travelerMesh = new THREE.Mesh(travelerGeo, travelerMat);
    scene.add(travelerMesh);

    // Coalesced on-demand renderer
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    // Helper: compute world half-spans from zoom
    function getSpans() {
      const z = propsRef.current.zoom;
      const halfRe = Math.max(1.5, Math.min(11, 180 / z));
      const halfIm = halfRe * 1.1;
      return { halfRe, halfIm };
    }

    function mapHeight(mag: number): number {
      if (!Number.isFinite(mag)) return 4.2;
      if (propsRef.current.heightMode === 'log') {
        return Math.min(4.8, Math.log1p(mag) * 1.25);
      }
      return Math.min(4.2, mag * 0.95);
    }

    // Build / rebuild 3D surface & overlays for current (centerRe, centerIm, zoom)
    function rebuildSceneData() {
      // Clear previous geometries & overlay objects
      while (surfaceGroup.children.length > 0) {
        surfaceGroup.remove(surfaceGroup.children[0]);
      }
      while (overlayGroup.children.length > 0) {
        overlayGroup.remove(overlayGroup.children[0]);
      }
      for (const g of disposableGeometries) g.dispose();
      for (const m of disposableMaterials) m.dispose();
      disposableGeometries.length = 0;
      disposableMaterials.length = 0;

      const {
        centerRe: cRe,
        centerIm: cIm,
        zeros: zeroList,
        selectedZeroIndex: selIdx,
        showStrip: stripVisible,
        showMarkers: markersVisible,
      } = propsRef.current;

      const { halfRe, halfIm } = getSpans();
      const segX = 110;
      const segZ = 110;
      const cols = segX + 1;
      const rows = segZ + 1;

      const positions = new Float32Array(cols * rows * 3);
      const colors = new Float32Array(cols * rows * 3);
      const indices: number[] = [];

      for (let iz = 0; iz < rows; iz++) {
        const v = iz / segZ; // 0 -> south (minIm), 1 -> north (maxIm)
        const im = cIm - halfIm + v * (2 * halfIm);
        const worldZ = -(im - cIm); // Imaginärteil nach oben (-Z)
        for (let ix = 0; ix < cols; ix++) {
          const u = ix / segX;
          const re = cRe - halfRe + u * (2 * halfRe);
          const worldX = re - cRe; // Realteil nach rechts (+X)

          const val = zeta({ re, im }, 'fast');
          const mag = cAbs(val);
          const y = mapHeight(mag);
          const [r, g, b] = phaseRgbFloat(val.re, val.im);

          const idx = iz * cols + ix;
          positions[idx * 3] = worldX;
          positions[idx * 3 + 1] = y;
          positions[idx * 3 + 2] = worldZ;

          colors[idx * 3] = r;
          colors[idx * 3 + 1] = g;
          colors[idx * 3 + 2] = b;
        }
      }

      for (let iz = 0; iz < segZ; iz++) {
        for (let ix = 0; ix < segX; ix++) {
          const a = iz * cols + ix;
          const b = a + 1;
          const c = (iz + 1) * cols + ix;
          const d = c + 1;
          indices.push(a, b, d);
          indices.push(a, d, c);
        }
      }

      const surfGeo = new THREE.BufferGeometry();
      surfGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      surfGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      surfGeo.setIndex(indices);
      surfGeo.computeVertexNormals();
      disposableGeometries.push(surfGeo);

      surfaceMaterial.wireframe = propsRef.current.showWireframe;
      surfaceMesh = new THREE.Mesh(surfGeo, surfaceMaterial);
      surfaceGroup.add(surfaceMesh);

      // Floor reference grid at Y = 0
      const floorGeo = new THREE.PlaneGeometry(halfRe * 2, halfIm * 2, 12, 12);
      floorGeo.rotateX(-Math.PI / 2);
      const floorMat = new THREE.MeshBasicMaterial({
        color: 0x1e293b,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      disposableGeometries.push(floorGeo);
      disposableMaterials.push(floorMat);
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.position.y = -0.01;
      overlayGroup.add(floorMesh);

      // Critical strip lines & surface trace along Re(s) = 1/2
      if (stripVisible) {
        const lineMatCyan = new THREE.LineBasicMaterial({ color: 0x06b6d4 });
        const lineMatSlate = new THREE.LineBasicMaterial({
          color: 0x64748b,
          transparent: true,
          opacity: 0.65,
        });
        disposableMaterials.push(lineMatCyan, lineMatSlate);

        for (const rLine of [0, 0.5, 1]) {
          if (rLine < cRe - halfRe || rLine > cRe + halfRe) continue;
          const wx = rLine - cRe;
          const basePts = [
            new THREE.Vector3(wx, 0.01, halfIm),
            new THREE.Vector3(wx, 0.01, -halfIm),
          ];
          const baseGeo = new THREE.BufferGeometry().setFromPoints(basePts);
          disposableGeometries.push(baseGeo);
          overlayGroup.add(
            new THREE.Line(baseGeo, rLine === 0.5 ? lineMatCyan : lineMatSlate)
          );

          // Trace critical line directly across the 3D surface!
          if (rLine === 0.5) {
            const tracePts: THREE.Vector3[] = [];
            const traceSteps = 140;
            for (let k = 0; k <= traceSteps; k++) {
              const im = cIm - halfIm + (k / traceSteps) * (2 * halfIm);
              const val = zeta({ re: 0.5, im }, 'high');
              const y = mapHeight(cAbs(val)) + 0.03;
              tracePts.push(new THREE.Vector3(wx, y, -(im - cIm)));
            }
            const traceGeo = new THREE.BufferGeometry().setFromPoints(tracePts);
            disposableGeometries.push(traceGeo);
            overlayGroup.add(new THREE.Line(traceGeo, lineMatCyan));
          }
        }
      }

      // Pole & Zeros markers on Y = 0 floor
      if (markersVisible) {
        const zeroMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.55,
        });
        const selZeroMat = new THREE.MeshStandardMaterial({
          color: 0xfde68a,
          emissive: 0xf59e0b,
          emissiveIntensity: 1.0,
        });
        const trivialMat = new THREE.MeshStandardMaterial({
          color: 0x94a3b8,
          emissive: 0x475569,
          emissiveIntensity: 0.3,
        });
        const poleMat = new THREE.MeshStandardMaterial({
          color: 0xf43f5e,
          emissive: 0xf43f5e,
          emissiveIntensity: 0.85,
        });
        disposableMaterials.push(zeroMat, selZeroMat, trivialMat, poleMat);

        const sphereGeo = new THREE.SphereGeometry(0.11, 16, 16);
        const selSphereGeo = new THREE.SphereGeometry(0.16, 18, 18);
        disposableGeometries.push(sphereGeo, selSphereGeo);

        // Pole s = 1
        if (1 >= cRe - halfRe && 1 <= cRe + halfRe && 0 >= cIm - halfIm && 0 <= cIm + halfIm) {
          const beaconGeo = new THREE.CylinderGeometry(0.035, 0.035, 4.3, 12);
          disposableGeometries.push(beaconGeo);
          const beacon = new THREE.Mesh(beaconGeo, poleMat);
          beacon.position.set(1 - cRe, 2.15, cIm);
          overlayGroup.add(beacon);
        }

        // Trivial zeros s = -2, -4, ...
        if (0 >= cIm - halfIm && 0 <= cIm + halfIm) {
          for (let k = -2; k >= Math.floor(cRe - halfRe); k -= 2) {
            if (k > cRe + halfRe) continue;
            const m = new THREE.Mesh(sphereGeo, trivialMat);
            m.position.set(k - cRe, 0.02, cIm);
            overlayGroup.add(m);
          }
        }

        // Non-trivial zeros
        const selectedZero = zeroList[selIdx];
        for (const z of zeroList) {
          for (const sign of [1, -1]) {
            const im = sign * z.gamma;
            if (
              0.5 < cRe - halfRe ||
              0.5 > cRe + halfRe ||
              im < cIm - halfIm ||
              im > cIm + halfIm
            ) {
              continue;
            }
            const isSel = selectedZero && z.index === selectedZero.index && sign === 1;
            const m = new THREE.Mesh(
              isSel ? selSphereGeo : sphereGeo,
              isSel ? selZeroMat : zeroMat
            );
            m.position.set(0.5 - cRe, 0.03, -(im - cIm));
            overlayGroup.add(m);
          }
        }
      }

      requestRender();
    }

    rebuildSurfaceRef.current = rebuildSceneData;

    const updateTraveler = () => {
      const im = propsRef.current.activeTravelerIm;
      if (im !== undefined) {
        const cRe = propsRef.current.centerRe;
        const cIm = propsRef.current.centerIm;
        const wx = 0.5 - cRe;
        const wz = -(im - cIm);
        const val = zeta({ re: 0.5, im }, 'high');
        const y = mapHeight(cAbs(val)) + 0.12;
        travelerMesh.position.set(wx, y, wz);
        travelerMesh.visible = true;
      } else {
        travelerMesh.visible = false;
      }
      requestRender();
    };

    updateTravelerRef.current = updateTraveler;

    resetCameraRef.current = () => {
      camera.position.set(0, 7.5, 11.5);
      controls.target.set(0, 0.4, 0);
      controls.update();
      requestRender();
    };

    updateControlModeRef.current = () => {
      if (propsRef.current.mouseAction === 'pan') {
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        };
      } else {
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        };
      }
    };

    updateControlModeRef.current();
    rebuildSceneData();

    // When user finishes panning/zooming, shift complex domain if target moved significantly
    const onControlsChange = () => requestRender();
    const onControlsEnd = () => {
      const { halfRe } = getSpans();
      const tx = controls.target.x;
      const tz = controls.target.z;
      if (Math.hypot(tx, tz) > halfRe * 0.25) {
        const nextRe = propsRef.current.centerRe + tx;
        const nextIm = propsRef.current.centerIm - tz;
        camera.position.x -= tx;
        camera.position.z -= tz;
        controls.target.x = 0;
        controls.target.z = 0;
        propsRef.current.onViewportChange(nextRe, nextIm, propsRef.current.zoom);
      }
    };

    controls.addEventListener('change', onControlsChange);
    controls.addEventListener('end', onControlsEnd);

    // Raycast hover & click on surface
    let lastRaycast = 0;
    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return;
      const now = performance.now();
      if (now - lastRaycast < 32 || !surfaceMesh) return;
      lastRaycast = now;

      const rect = renderer.domElement.getBoundingClientRect();
      _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_mouse, camera);
      const hits = _raycaster.intersectObject(surfaceMesh, false);
      if (hits.length > 0) {
        const p = hits[0].point;
        probeMesh.position.copy(p);
        probeMesh.visible = true;
        propsRef.current.onHoverPoint({
          re: propsRef.current.centerRe + p.x,
          im: propsRef.current.centerIm - p.z,
        });
      } else {
        probeMesh.visible = false;
        propsRef.current.onHoverPoint(null);
      }
      requestRender();
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 4) return;
      if (!surfaceMesh) return;
      const rect = renderer.domElement.getBoundingClientRect();
      _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_mouse, camera);
      const hits = _raycaster.intersectObject(surfaceMesh, false);
      if (hits.length > 0) {
        const p = hits[0].point;
        propsRef.current.onPinPoint({
          re: propsRef.current.centerRe + p.x,
          im: propsRef.current.centerIm - p.z,
        });
      }
    };

    const handlePointerLeave = () => {
      probeMesh.visible = false;
      propsRef.current.onHoverPoint(null);
      requestRender();
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError(true);
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const resizeObs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(300, Math.floor(entry.contentRect.width));
        const h = Math.max(360, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      }
    });
    resizeObs.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      controls.removeEventListener('change', onControlsChange);
      controls.removeEventListener('end', onControlsEnd);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);

      for (const g of disposableGeometries) g.dispose();
      for (const m of disposableMaterials) m.dispose();
      surfaceMaterial.dispose();
      probeGeo.dispose();
      probeMat.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Trigger rebuild when domain, overlays, or scale change
  useEffect(() => {
    rebuildSurfaceRef.current?.();
  }, [centerRe, centerIm, zoom, zeros, selectedZeroIndex, showStrip, showMarkers, heightMode, showWireframe]);

  useEffect(() => {
    updateTravelerRef.current?.();
  }, [activeTravelerIm]);

  if (webglError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#07090E] p-6 text-center text-sm text-slate-300">
        <div>
          <p className="font-semibold text-slate-100">3D-WebGL-Kontext nicht verfügbar</p>
          <p className="mt-1 text-xs text-slate-400">
            Bitte wechsle auf die 2D-Ansicht oder aktiviere Hardwarebeschleunigung im Browser.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 w-full h-full min-h-[460px] overflow-hidden bg-[#07090E]">
      {/* Isolated WebGL mount container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Clean Corner Axis Orientation Guide */}
      <div className="pointer-events-none absolute top-3 left-3 rounded-lg border border-slate-800 bg-[#07090E]/90 px-3 py-2 font-mono text-[11px] text-slate-300">
        <div>Re(s) → rechts · Im(s) ↑ Tiefe · |ζ(s)| ↑ Höhe</div>
      </div>

      {/* Bottom Compact 3D Controls Dock (single line) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-nowrap items-center gap-2 rounded-xl border border-slate-800 bg-[#0B0E17]/95 px-3 py-1.5 text-xs whitespace-nowrap">
        <div className="flex items-center gap-0.5 rounded-md border border-slate-800 bg-[#07090E] p-0.5">
          <button
            type="button"
            onClick={() => setMouseAction('rotate')}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
              mouseAction === 'rotate'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Rotate3d className="h-3.5 w-3.5" />
            <span>Drehen</span>
          </button>
          <button
            type="button"
            onClick={() => setMouseAction('pan')}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
              mouseAction === 'pan'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Move className="h-3.5 w-3.5" />
            <span>Pannen</span>
          </button>
        </div>

        <div className="flex items-center gap-0.5 rounded-md border border-slate-800 bg-[#07090E] p-0.5">
          <button
            type="button"
            onClick={() => setHeightMode('linear')}
            className={`rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
              heightMode === 'linear'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Linear
          </button>
          <button
            type="button"
            onClick={() => setHeightMode('log')}
            className={`rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
              heightMode === 'log'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Log
          </button>
        </div>

        <label className="flex items-center gap-1.5 px-1.5 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showWireframe}
            onChange={(e) => setShowWireframe(e.target.checked)}
            className="accent-cyan-500 h-3.5 w-3.5 cursor-pointer"
          />
          <span>Gitter</span>
        </label>

        <button
          type="button"
          onClick={() => resetCameraRef.current?.()}
          title="Kamera zurücksetzen"
          className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-[#07090E] px-2 py-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Kamera</span>
        </button>
      </div>
    </div>
  );
}
