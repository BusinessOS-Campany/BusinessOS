"use client"

import { Component, Suspense, useMemo, useState, type ReactNode } from "react"
import { Canvas, type ThreeEvent } from "@react-three/fiber"
import { Html, OrbitControls, useGLTF } from "@react-three/drei"
import * as THREE from "three"
import { TEETH_BY_DENTITION, type ToothMeta } from "@/lib/dental-tooth"
import { CONDITION_VISUALS } from "@/lib/constants/clinical"
import type { ToothRecordDTO } from "./condition-editor-dialog"

const MODEL_URL = "/model/human_teeth.glb"

const HEALTHY_COLOR = CONDITION_VISUALS.HEALTHY.color

/** Flip patient left/right if the model is mirrored (x>0 becomes patient's right). */
const FLIP = false

/** Height captured above the mandibular occlusal plane for the maxillary tooth band. */
const UPPER_BAND_H = 0.95
/** Crown-band fraction (top part) of the compact lower-arch mesh. */
const LOWER_BAND_FR = 0.45
/** Restrict sampling to vertices within this arch angle (±deg). */
const MAX_ANGLE = 88

if (typeof window !== "undefined") {
  useGLTF.preload(MODEL_URL)
}

interface ToothCenter {
  x: number
  y: number
  z: number
  angle: number
}

interface ArchModel {
  lower: ToothCenter[]
  upper: ToothCenter[]
  ySplit: number
}

function deg(x: number, z: number): number {
  return (Math.atan2(x, z) * 180) / Math.PI
}

function kMeans1D(values: number[], k: number, iters = 28): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return []
  if (sorted.length <= k) return [...sorted]
  const lo = sorted[0]
  const hi = sorted[sorted.length - 1]
  const centers = Array.from({ length: k }, (_, c) => lo + ((c + 0.5) * (hi - lo)) / k)
  const assign = new Array(sorted.length).fill(0)
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < sorted.length; v++) {
      let best = 0
      let bd = Infinity
      for (let c = 0; c < k; c++) {
        const d = Math.abs(sorted[v] - centers[c])
        if (d < bd) {
          bd = d
          best = c
        }
      }
      assign[v] = best
    }
    let moved = 0
    for (let c = 0; c < k; c++) {
      let sum = 0
      let cnt = 0
      for (let v = 0; v < sorted.length; v++) {
        if (assign[v] === c) {
          sum += sorted[v]
          cnt++
        }
      }
      if (cnt > 0) {
        const m = sum / cnt
        if (Math.abs(m - centers[c]) > 1e-6) {
          centers[c] = m
          moved++
        }
      }
    }
    if (moved === 0) break
  }
  return centers
}

function meanR(axes: number[][]): number {
  if (axes.length === 0) return 1
  let s = 0
  for (const [x, , z] of axes) s += Math.sqrt(x * x + z * z)
  return s / axes.length
}

function meanY(axes: number[][]): number {
  if (axes.length === 0) return 0
  let s = 0
  for (const [, y] of axes) s += y
  return s / axes.length
}

/** 8 tooth centers for one arch side (angles <0 or >=0). */
function clusterSide(angles: number[], axes: number[][], ori: "neg" | "pos"): ToothCenter[] {
  if (angles.length < 64) {
    const R = meanR(axes)
    const y = meanY(axes)
    const base = ori === "neg" ? -85 : 5
    return Array.from({ length: 8 }, (_, k) => {
      const a = base + k * 10
      const rad = (a * Math.PI) / 180
      const s = Math.sin(rad)
      return {
        x: (ori === "neg" ? -1 : 1) * R * Math.abs(s),
        y,
        z: -Math.abs(R * Math.cos(rad)),
        angle: a,
      }
    })
  }
  const sorted = angles.map((a, i) => ({ a, i })).sort((p, q) => p.a - q.a)
  const centers = kMeans1D(
    sorted.map((s) => s.a),
    8,
  )
  const acc = centers.map(() => ({ count: 0, a: 0, x: 0, y: 0, z: 0 }))
  for (const s of sorted) {
    let best = 0
    let bd = Infinity
    for (let c = 0; c < centers.length; c++) {
      const d = Math.abs(s.a - centers[c])
      if (d < bd) {
        bd = d
        best = c
      }
    }
    const ax = axes[s.i]
    acc[best].count++
    acc[best].a += s.a
    acc[best].x += ax[0]
    acc[best].y += ax[1]
    acc[best].z += ax[2]
  }
  return acc.map((c) => ({
    x: c.count ? c.x / c.count : 0,
    y: c.count ? c.y / c.count : 0,
    z: c.count ? c.z / c.count : 0,
    angle: c.count ? c.a / c.count : 0,
  }))
}

function adultNumberFromIndex(i: number, arc: "upper" | "lower", flip: boolean): number {
  if (i < 8) return arc === "upper" ? (flip ? 28 - i : 18 - i) : flip ? 38 - i : 48 - i
  const k = i - 8
  return arc === "upper" ? (flip ? 11 + k : 21 + k) : flip ? 41 + k : 31 + k
}

function primaryNumberFromIndex(i: number, arc: "upper" | "lower", flip: boolean): number {
  const neg = i < 8
  const j = Math.min(4, Math.floor(((i % 8) + 0.5) * 0.625))
  if (neg) return arc === "upper" ? (flip ? 65 - j : 55 - j) : flip ? 75 - j : 85 - j
  return arc === "upper" ? (flip ? 55 - j : 65 - j) : flip ? 85 - j : 75 - j
}

function numberFromIndex(i: number, arc: "upper" | "lower", dentition: "ADULT" | "PRIMARY"): number {
  return dentition === "ADULT" ? adultNumberFromIndex(i, arc, FLIP) : primaryNumberFromIndex(i, arc, FLIP)
}

function computeArchModel(scene: THREE.Object3D): ArchModel {
  const meshes: THREE.Mesh[] = []
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })

  let lowerMesh: THREE.Mesh | null = null
  const infos: Array<{ mesh: THREE.Mesh; diag: number }> = []
  for (const m of meshes) {
    const bb = m.geometry.boundingBox
    if (!bb) continue
    const diag = bb.getSize(new THREE.Vector3()).length()
    infos.push({ mesh: m, diag })
  }
  // The compact mesh (smallest diagonal) is the clean dental arch → lower teeth band.
  for (const info of infos) {
    if (!lowerMesh || info.diag < lowerMesh.geometry.boundingBox!.getSize(new THREE.Vector3()).length()) {
      lowerMesh = info.mesh
    }
  }
  const ySplit = lowerMesh ? lowerMesh.geometry.boundingBox!.max.y + 0.05 : -0.9

  function sample(mesh: THREE.Mesh, pred: (x: number, y: number, z: number) => boolean, maxSamples: number) {
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute
    if (!pos) return { angles: [] as number[], axes: [] as number[][] }
    const arr = pos.array as Float32Array
    const count = pos.count
    const stride = Math.max(1, Math.floor(count / maxSamples))
    const angles: number[] = []
    const axes: number[][] = []
    for (let i = 0; i < count; i += stride) {
      const x = arr[i * 3]
      const y = arr[i * 3 + 1]
      const z = arr[i * 3 + 2]
      if (!pred(x, y, z)) continue
      const a = deg(x, z)
      if (Math.abs(a) > MAX_ANGLE) continue
      angles.push(a)
      axes.push([x, y, z])
    }
    return { angles, axes }
  }

  let lowerAngles: number[] = []
  let lowerAxes: number[][] = []
  if (lowerMesh) {
    const bb = lowerMesh.geometry.boundingBox!
    const yLo = bb.min.y + (bb.max.y - bb.min.y) * LOWER_BAND_FR
    const s = sample(lowerMesh, (_x, y) => y >= yLo, 6000)
    lowerAngles = s.angles
    lowerAxes = s.axes
  }

  const upperAngles: number[] = []
  const upperAxes: number[][] = []
  for (const info of infos) {
    if (info.mesh === lowerMesh) continue
    const s = sample(info.mesh, (_x, y) => y > ySplit && y <= ySplit + UPPER_BAND_H, 4000)
    upperAngles.push(...s.angles)
    upperAxes.push(...s.axes)
  }

  const pick = (arc: number[], axes: number[][]) => {
    const neg: number[] = []
    const negAxes: number[][] = []
    const pos: number[] = []
    const posAxes: number[][] = []
    for (let i = 0; i < arc.length; i++) {
      if (arc[i] < 0) {
        neg.push(arc[i])
        negAxes.push(axes[i])
      } else {
        pos.push(arc[i])
        posAxes.push(axes[i])
      }
    }
    return [...clusterSide(neg, negAxes, "neg"), ...clusterSide(pos, posAxes, "pos")]
  }

  return {
    lower: pick(lowerAngles, lowerAxes),
    upper: pick(upperAngles, upperAxes),
    ySplit,
  }
}

interface ChartProps {
  records: ToothRecordDTO[]
  dentition: "ADULT" | "PRIMARY"
  onSelect: (meta: ToothMeta) => void
  selectedNumber?: number
  locale: "ar" | "en"
}

function Marker({ position, color, extracted }: { position: [number, number, number]; color: string; extracted?: boolean }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[extracted ? 0.09 : 0.12, 24, 18]} />
      <meshStandardMaterial
        color={extracted ? "#64748b" : color}
        emissive={extracted ? undefined : color}
        emissiveIntensity={0.35}
        roughness={0.4}
        metalness={0}
        transparent={extracted}
        opacity={extracted ? 0.85 : 1}
      />
    </mesh>
  )
}

function Ring({ position, color, y = 0.12, r = 0.32 }: { position: [number, number, number]; color: string; y?: number; r?: number }) {
  return (
    <mesh position={[position[0], position[1] + y, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[r, 0.02, 10, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  )
}

function TeethOverlay({
  model,
  dentition,
  selectedNumber,
  hoveredNumber,
  metaByNumber,
  indicators,
  locale,
}: {
  model: ArchModel
  dentition: "ADULT" | "PRIMARY"
  selectedNumber?: number
  hoveredNumber?: number
  metaByNumber: Map<number, ToothMeta>
  indicators: Map<number, string>
  locale: "ar" | "en"
}) {
  const centers = useMemo(() => [...model.lower, ...model.upper], [model])

  const numberGlue = useMemo(() => {
    const map = new Map<number, { idx: number; arc: "upper" | "lower" }>()
    model.lower.forEach((_c, i) => map.set(numberFromIndex(i, "lower", dentition), { idx: i, arc: "lower" }))
    model.upper.forEach((_c, i) => map.set(numberFromIndex(i, "upper", dentition), { idx: i, arc: "upper" }))
    return map
  }, [model, dentition])

  const centerAt = (num: number) => {
    const glue = numberGlue.get(num)
    if (!glue) return null
    return centers[glue.idx + (glue.arc === "upper" ? 16 : 0)]
  }

  const nodes: ReactNode[] = []
  for (const [num, color] of indicators) {
    const c = centerAt(num)
    if (!c) continue
    const extracted = color === "extracted"
    nodes.push(
      <Marker
        key={`m-${num}`}
        position={[c.x, c.y + 0.06, c.z]}
        color={extracted ? "#64748b" : color}
        extracted={extracted}
      />,
    )
  }

  if (hoveredNumber !== undefined) {
    const c = centerAt(hoveredNumber)
    const meta = metaByNumber.get(hoveredNumber)
    if (c) {
      nodes.push(<Ring key="h" position={[c.x, c.y, c.z]} color="#f8fafc" />)
      if (meta) {
        nodes.push(
          <Html key="tip" position={[c.x, c.y + 0.32, c.z]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div className="whitespace-nowrap rounded-md border bg-background/95 px-2 py-1 text-[11px] font-medium text-foreground shadow-md">
              #{meta.number} · {locale === "ar" ? meta.nameAr : meta.nameEn}
            </div>
          </Html>,
        )
      }
    }
  }

  if (selectedNumber !== undefined) {
    const c = centerAt(selectedNumber)
    if (c) nodes.push(<Ring key="s" position={[c.x, c.y, c.z]} color="#0ea5e9" />)
  }

  return <>{nodes}</>
}

function InteractiveModel({ records, dentition, onSelect, selectedNumber, locale }: ChartProps) {
  const gltf = useGLTF(MODEL_URL)
  const model = useMemo(() => computeArchModel(gltf.scene), [gltf])
  const [hovered, setHovered] = useState<number | undefined>(undefined)

  const byTooth = useMemo(() => {
    const map = new Map<number, ToothRecordDTO>()
    for (const r of records) {
      if (r.dentition === dentition) map.set(r.toothNumber, r)
    }
    return map
  }, [records, dentition])

  const metaByNumber = useMemo(() => {
    const map = new Map<number, ToothMeta>()
    for (const t of TEETH_BY_DENTITION[dentition]) map.set(t.number, t)
    return map
  }, [dentition])

  const indicators = useMemo(() => {
    const map = new Map<number, string>()
    for (const rec of byTooth.values()) {
      const conditions = rec.conditions ?? []
      const cond = conditions.length > 0 ? conditions[conditions.length - 1].condition : undefined
      if (cond === "MISSING" || cond === "EXTRACTED") map.set(rec.toothNumber, "extracted")
      else if (cond) map.set(rec.toothNumber, CONDITION_VISUALS[cond]?.color ?? HEALTHY_COLOR)
    }
    return map
  }, [byTooth])

  const pickTooth = useMemo(
    () => (p: THREE.Vector3): ToothMeta | undefined => {
      const arc: "upper" | "lower" = p.y > model.ySplit ? "upper" : "lower"
      const arcs = arc === "upper" ? model.upper : model.lower
      if (arcs.length !== 16) return undefined
      const a = deg(p.x, p.z)
      let best = 0
      let bd = Infinity
      for (let i = 0; i < arcs.length; i++) {
        const d = Math.abs(a - arcs[i].angle)
        if (d < bd) {
          bd = d
          best = i
        }
      }
      const num = numberFromIndex(best, arc, dentition)
      return metaByNumber.get(num)
    },
    [model, dentition, metaByNumber],
  )

  const scene = gltf.scene
  return (
    <group>
      <primitive
        object={scene}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          const t = pickTooth(e.point)
          setHovered(t ? t.number : undefined)
          document.body.style.cursor = t ? "pointer" : "auto"
        }}
        onPointerOut={() => {
          setHovered(undefined)
          document.body.style.cursor = "auto"
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          const t = pickTooth(e.point)
          if (t) onSelect(t)
        }}
      />
      <TeethOverlay
        model={model}
        dentition={dentition}
        selectedNumber={selectedNumber}
        hoveredNumber={hovered}
        metaByNumber={metaByNumber}
        indicators={indicators}
        locale={locale}
      />
    </group>
  )
}

function Scene3D(props: ChartProps) {
  return (
    <Canvas camera={{ position: [0, -0.3, 3.4], fov: 45 }} dpr={[1, 2]}>
      <ambientLight intensity={0.55} />
      <hemisphereLight intensity={0.55} color="#ffffff" groundColor="#e2e8f0" />
      <directionalLight position={[3, 5, 4]} intensity={1.2} />
      <directionalLight position={[-3, -2.5, -3]} intensity={0.4} color="#bae6fd" />
      <Suspense
        fallback={
          <Html center zIndexRange={[20, 0]}>
            <p className="rounded-md border bg-background/95 px-3 py-1.5 text-sm text-muted-foreground shadow-md">
              Loading 3D model…
            </p>
          </Html>
        }
      >
        <InteractiveModel {...props} />
      </Suspense>
      <OrbitControls enableDamping target={[0, -0.9, 0]} />
    </Canvas>
  )
}

export class ChartErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export function DentalChart3D(props: ChartProps) {
  return (
    <ChartErrorBoundary
      fallback={
        <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
          3D model not available — use the 2D chart.
        </p>
      }
    >
      <div className="h-[460px] w-full overflow-hidden rounded-xl border bg-background">
        <Scene3D {...props} />
      </div>
    </ChartErrorBoundary>
  )
}