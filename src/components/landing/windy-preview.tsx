"use client";

import { Suspense, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

/* ── "A Windy Day" — Loïc Norgeot style recreation ───────────
   Global wind + precipitation point streams hugging the globe,
   colored by the Matplotlib "inferno" colormap, rendered with
   additive blending. Procedural recreation of the Sketchfab model. */

const EARTH_RADIUS = 1.2;
const INFERNO: [number, number, number][] = [
  [0.0, 0.0, 0.0], // black
  [0.12, 0.06, 0.35], // dark purple
  [0.37, 0.07, 0.55],
  [0.7, 0.15, 0.5],
  [0.95, 0.35, 0.23],
  [1.0, 0.65, 0.05], // yellow
  [1.0, 1.0, 0.95], // pale yellow/white
];

function inferno(t: number, out: THREE.Color) {
  const x = Math.max(0, Math.min(1, t));
  const seg = INFERNO.length - 1;
  const f = x * seg;
  const i = Math.floor(f);
  const frac = f - i;
  const a = INFERNO[Math.min(i, seg)];
  const b = INFERNO[Math.min(i + 1, seg)];
  out.setRGB(
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
    a[2] + (b[2] - a[2]) * frac,
  );
  out.multiplyScalar(2.2); // push intensity for additive glow
  return out;
}

/* Streamlines of zonal wind on a sphere (great-circle-ish paths that
   drift west→east at mid latitudes, recirculating around the poles). */
interface Stream {
  lat0: number; // base latitude
  lon0: number;
  speed: number; // relative flow speed (drives color + phase)
  phase: number;
  n: number; // particles per stream
  radius: number;
}

function buildStreams(count: number): Stream[] {
  const streams: Stream[] = [];
  for (let i = 0; i < count; i++) {
    const lat0 = (Math.random() * 2 - 1) * 1.25; // bias flow to mid-latitudes
    streams.push({
      lat0: lat0 * 60, // degrees
      lon0: Math.random() * 360,
      speed: 0.4 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      n: 3 + ((Math.random() * 4) | 0),
      radius: EARTH_RADIUS * (1.02 + Math.random() * 0.03),
    });
  }
  return streams;
}

const STREAM_COUNT = 42;
const STREAMS = buildStreams(STREAM_COUNT);

/* Loop path parameter along each stream: 0..1, arrays reuse */
function streamPoint(
  lat0: number,
  lon0: number,
  phase: number,
  t: number,
  radius: number,
  out: THREE.Vector3,
) {
  // Wobble latitude so streamlines undulate like real isobars
  const lat = lat0 + Math.sin((t * 2 + phase) * Math.PI * 2) * 14;
  const lon = lon0 + t * 360 * 1.4 + (t * Math.PI * 2 * 0.6);
  const phi = (90 - lat) * THREE.MathUtils.DEG2RAD;
  const theta = (lon + 180) * THREE.MathUtils.DEG2RAD;
  out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function buildPoints() {
  const total = STREAMS.reduce((s, st) => s + st.n, 0);
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const speeds = new Float32Array(total);
  const streamIdx = new Uint16Array(total);
  const localT = new Float32Array(total);
  const phaseArr = new Float32Array(total);

  let idx = 0;
  const tmp = new THREE.Color();
  STREAMS.forEach((st, si) => {
    for (let k = 0; k < st.n; k++) {
      const t = k / st.n; // start spread along the loop
      const pos = new THREE.Vector3();
      streamPoint(st.lat0, st.lon0, st.phase, t, st.radius, pos);
      const i3 = idx * 3;
      positions[i3] = pos.x;
      positions[i3 + 1] = pos.y;
      positions[i3 + 2] = pos.z;
      // Color by speed (inferno)
      inferno(st.speed / 1.3, tmp);
      colors[i3] = tmp.r;
      colors[i3 + 1] = tmp.g;
      colors[i3 + 2] = tmp.b;
      speeds[idx] = st.speed;
      streamIdx[idx] = si;
      localT[idx] = t;
      phaseArr[idx] = st.phase;
      idx++;
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return { geo, total, speeds, streamIdx, localT, phaseArr, posAttr: positions };
}

const POINTS = buildPoints();

/* ── Rain: tiny slow-drifting particles scattered at low latitudes ── */
function buildRain() {
  const n = 350;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const speedArr = new Float32Array(n);
  const v = new THREE.Vector3();
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const lat = (Math.random() * 2 - 1) * 45;
    const lon = Math.random() * 360;
    const phi = (90 - lat) * THREE.MathUtils.DEG2RAD;
    const theta = (lon + 180) * THREE.MathUtils.DEG2RAD;
    const r = EARTH_RADIUS * (1.01 + Math.random() * 0.02);
    v.set(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    // rain = cool blue-cyan, brighter where "raining"
    tmp.setRGB(0.25, 0.55, 1.0);
    tmp.multiplyScalar(0.7 + Math.random() * 0.9);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
    speedArr[i] = (Math.random() * 0.5) * 1 + 0.1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return { geo, n, posAttr: positions, speedArr };
}

const RAIN = buildRain();

function WindStreams() {
  const ref = useRef<THREE.Points>(null!);
  const geoData = POINTS;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const pos = ref.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = ref.current.geometry.getAttribute("color") as THREE.BufferAttribute;
    const out = new THREE.Vector3();
    const tmp = new THREE.Color();
    const phaseArr = geoData.phaseArr;
    const localT = geoData.localT;
    for (let i = 0; i < geoData.total; i++) {
      const si = geoData.streamIdx[i];
      const st = STREAMS[si as number];
      const ft = localT[i] + (t * 0.06 * st.speed) / st.n;
      streamPoint(st.lat0, st.lon0, phaseArr[i], ft % 1, st.radius, out);
      const i3 = i * 3;
      pos.array[i3] = out.x;
      pos.array[i3 + 1] = out.y;
      pos.array[i3 + 2] = out.z;
      // twinkle opacity-ish via brightness
      inferno((st.speed / 1.3) * (0.85 + 0.3 * Math.sin(ft * Math.PI * 2 * 3)), tmp);
      col.array[i3] = tmp.r;
      col.array[i3 + 1] = tmp.g;
      col.array[i3 + 2] = tmp.b;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geoData.geo}>
      <pointsMaterial
        size={0.045}
        vertexColors
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function Rain() {
  const ref = useRef<THREE.Points>(null!);
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const pos = ref.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = ref.current.geometry.getAttribute("color") as THREE.BufferAttribute;
    const out = new THREE.Vector3();
    const tmp = new THREE.Color();
    for (let i = 0; i < RAIN.n; i++) {
      // drift slowly eastward like moisture advection + fade
      const i3 = i * 3;
      const p = new THREE.Vector3(pos.array[i3], pos.array[i3 + 1], pos.array[i3 + 2]);
      p.applyAxisAngle(new THREE.Vector3(0, 1, 0), t * 0.05 * RAIN.speedArr[i]);
      out.copy(p).normalize().multiplyScalar(EARTH_RADIUS * 1.012);
      pos.array[i3] = out.x;
      pos.array[i3 + 1] = out.y;
      pos.array[i3 + 2] = out.z;
      // pulse
      const pul = 0.6 + 0.4 * Math.sin(t * 2 + i);
      tmp.setRGB(0.3 * pul, 0.6 * pul, 1.0 * pul);
      col.array[i3] = tmp.r;
      col.array[i3 + 1] = tmp.g;
      col.array[i3 + 2] = tmp.b;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={RAIN.geo}>
      <pointsMaterial
        size={0.035}
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function Earth() {
  const day = useLoader(THREE.TextureLoader, "/earth/earth_atmos_2048.webp");
  return (
    <group>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshStandardMaterial
          map={day}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.38, 64, 64]} />
        <meshBasicMaterial
          color="#0b2a4a"
          transparent
          opacity={0.16}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

export default function WindyPreview() {
  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 0.4, 5.4], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 3, 4]} intensity={1.4} />
        <Suspense fallback={null}>
          <WindStreams />
          <Rain />
          <Earth />
        </Suspense>
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  );
}
