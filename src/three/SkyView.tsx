/**
 * SkyView — Three.js surface-observer viewport.
 *
 * Fixed camera at 1.7 m; drag-to-look drives compass yaw / pitch. The skydome
 * shader (see skyShader.ts) renders sky + terrain in one pass so the horizon
 * stays a crisp anti-aliased edge. Rings and moons are companion meshes.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { WorldSpec } from '../science/worlds';
import { airMass, type SkyState } from '../science/atmosphere';
import { createSkyMaterial, hexToLinear } from './skyShader';
import { buildRingGeometry, dirFromAzElev, makeMoonTexture, makeRingTexture } from './bodies';

const DEG = Math.PI / 180;
const CAM_HEIGHT = 1.7;
const DOME_RADIUS = 8000;

export interface ViewState {
  /** Compass heading: 0=N, 90=E, 180=S, 270=W. */
  yawDeg: number;
  pitchDeg: number;
  fisheye: boolean;
  /** Perspective fov (ignored in fisheye). */
  fov: number;
}

export interface SkyViewProps {
  world: WorldSpec;
  sky: SkyState;
  view: ViewState;
  onViewChange: (v: ViewState) => void;
}

export default function SkyView({ world, sky, view, onViewChange }: SkyViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // Mirror latest props for the RAF loop / event handlers without re-subscribing.
  const live = useRef({ world, sky, view, onViewChange });
  live.current = { world, sky, view, onViewChange };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 20000);
    camera.position.set(0, CAM_HEIGHT, 0);

    const { material: skyMat, uniforms } = createSkyMaterial();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 48, 32), skyMat);
    dome.position.set(0, CAM_HEIGHT, 0);
    dome.frustumCulled = false;
    scene.add(dome);

    // Companion group rebuilt per world (rings + moons).
    let companions: THREE.Group | null = null;
    let lastWorldId = '';
    const rebuildCompanions = (w: WorldSpec) => {
      if (companions) {
        scene.remove(companions);
        companions.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material as THREE.Material | undefined;
          if (mat) {
            const m = mat as THREE.MeshBasicMaterial;
            if (m.map) m.map.dispose();
            mat.dispose();
          }
        });
      }
      companions = new THREE.Group();
      if (w.rings) {
        const ringMat = new THREE.MeshBasicMaterial({
          map: makeRingTexture(),
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const rings = new THREE.Mesh(buildRingGeometry(DOME_RADIUS - 500), ringMat);
        rings.position.set(0, CAM_HEIGHT, 0);
        rings.renderOrder = 1;
        companions.add(rings);
      }
      for (const m of w.moons ?? []) {
        const sm = new THREE.SpriteMaterial({ map: makeMoonTexture(m.color), transparent: true, depthWrite: false });
        const sp = new THREE.Sprite(sm);
        const apparentDeg = m.size * 0.5;
        const s = (DOME_RADIUS - 1000) * Math.tan(apparentDeg * DEG);
        sp.scale.set(s, s, 1);
        sp.position.copy(dirFromAzElev(m.azDeg, m.elevDeg).multiplyScalar(DOME_RADIUS - 1000));
        sp.position.y += CAM_HEIGHT;
        sp.renderOrder = 2;
        companions.add(sp);
      }
      scene.add(companions);
      lastWorldId = w.id;
    };

    // ---- drag-to-look + wheel zoom ----
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      const v = live.current.view;
      const yaw = (v.yawDeg - dx * 0.12 + 360) % 360;
      const pitch = Math.max(-89, Math.min(89, v.pitchDeg + dy * 0.12));
      live.current.onViewChange({ ...v, yawDeg: yaw, pitchDeg: pitch, fisheye: false });
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = live.current.view;
      if (v.fisheye) return;
      const fov = Math.max(20, Math.min(110, v.fov + Math.sign(e.deltaY) * 5));
      live.current.onViewChange({ ...v, fov });
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    let raf = 0;
    let lastFov = -1;
    const clock = new THREE.Clock();
    const look = new THREE.Vector3();

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { world: w, sky: s, view: v } = live.current;
      if (w.id !== lastWorldId) rebuildCompanions(w);

      const t = clock.getElapsedTime();
      const yaw = v.yawDeg * DEG;
      const pitch = (v.fisheye ? 89 : v.pitchDeg) * DEG;
      const fov = v.fisheye ? 150 : v.fov;
      if (fov !== lastFov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
        lastFov = fov;
      }
      look.set(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      );
      camera.lookAt(look.x, look.y + CAM_HEIGHT, look.z);

      // Sun direction (compass convention: 0=N, 90=E).
      const saz = s.sunAzDeg * DEG;
      const sel = s.sunElevDeg * DEG;
      uniforms.uSunDir.value.set(
        Math.sin(saz) * Math.cos(sel),
        Math.sin(sel),
        -Math.cos(saz) * Math.cos(sel),
      );
      uniforms.uCamPos.value.copy(camera.position);
      uniforms.uTauR.value.set(s.tauR.r, s.tauR.g, s.tauR.b);
      uniforms.uTauM.value.set(s.tauM.r, s.tauM.g, s.tauM.b);
      uniforms.uTauA.value.set(s.tauA.r, s.tauA.g, s.tauA.b);
      const mSun = airMass(Math.max(s.sunElevDeg, 1));
      uniforms.uTauSun.value.set(s.tauT.r * mSun, s.tauT.g * mSun, s.tauT.b * mSun);
      uniforms.uFlux.value = s.fluxRel;
      uniforms.uDownwell.value = s.downwell;
      uniforms.uExposure.value = s.exposureFinal;
      uniforms.uMieG.value = w.aerosol.g;
      uniforms.uMieAlbedo.value = w.aerosol.albedo;
      uniforms.uCloudAlbedo.value = w.cloudAlbedo;
      uniforms.uSunAngRad.value = Math.max((s.starAngularDeg / 2) * DEG, 0.002);
      uniforms.uNight.value = s.nightFactor;
      uniforms.uTime.value = t;
      uniforms.uDiffuseHorizon.value = w.horizonDiffuse ? 1 : 0;
      uniforms.uStarColor.value.setRGB(s.starColor[0], s.starColor[1], s.starColor[2]);
      uniforms.uSunTint.value.setRGB(s.sunTint[0], s.sunTint[1], s.sunTint[2]);
      uniforms.uMieTint.value.setRGB(w.aerosol.tint[0], w.aerosol.tint[1], w.aerosol.tint[2]);
      uniforms.uGroundColor.value.copy(hexToLinear(w.surfaceColor));
      uniforms.uGroundSkyTint.value.setRGB(s.groundSkyTint[0], s.groundSkyTint[1], s.groundSkyTint[2]);

      // Companion brightness tracks adapted surface light (faint at night).
      const glow = Math.max(0.03, Math.min(1.25, s.exposureFinal * s.downwell * 3.5));
      companions?.children.forEach((o) => {
        const mat = (o as THREE.Mesh | THREE.Sprite).material as THREE.Material & {
          color: THREE.Color;
        };
        mat.color.setScalar(glow);
      });

      renderer.render(scene, camera);
    };
    rebuildCompanions(world);
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      skyMat.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
