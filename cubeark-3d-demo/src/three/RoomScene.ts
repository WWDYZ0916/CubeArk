import * as THREE from 'three'
import { disposeGroup, makeLabel } from './three-app'
import type { ThreeApp } from './three-app'
import type { RoomSceneData, RackInfo } from '../types'

// L1 机房总览：深色金属机柜（前面板格栅贴图）+ 头顶使用率指示灯 + 编号标签
// 使用率/告警不再全身着色，改为机柜顶部发光指示条（与图例阈值一致），机身保持中性深色
const RACK_W = 0.6
const RACK_H = 2.0
const RACK_D = 1.0
const BODY_BASE = 0x33384a // 机柜着色（材质为白，实际颜色=该tint；hover时向白提亮）
const ALARM_COLOR = 0xe53935

function usageColor(pct: number, health: number): THREE.Color {
  if (health === 2) return new THREE.Color(ALARM_COLOR)
  if (pct >= 85) return new THREE.Color(0xf57c00)
  if (pct >= 60) return new THREE.Color(0xc0ca33)
  return new THREE.Color(0x43a047)
}

// 机柜前面板：网孔格栅 + 边框（画成亮灰阶，实际颜色由 instanceColor tint 相乘得到深色金属）
function rackFrontTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 384
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 384)
  g.addColorStop(0, '#e2e9f1')
  g.addColorStop(1, '#c6d0da')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 384)
  // 网孔阵列（深色孔）
  ctx.fillStyle = '#5d6a78'
  for (let y = 10; y < 374; y += 14) {
    for (let x = 14; x < 114; x += 12) {
      ctx.beginPath()
      ctx.arc(x + ((y / 14) % 2) * 6, y, 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // 左右边框立柱（高光）
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 9, 384)
  ctx.fillRect(119, 0, 9, 384)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class RoomScene {
  group = new THREE.Group()
  private im: THREE.InstancedMesh
  private baseColors: THREE.Color[] = []
  private byIndex: RackInfo[] = []
  private hoverIdx = -1
  private cleanupFns: Array<() => void> = []
  private pulseMats: Array<{ mat: THREE.MeshBasicMaterial; base: THREE.Color }> = []
  private raf = 0

  constructor(
    private app: ThreeApp,
    private data: RoomSceneData,
    private handlers: { onRackClick: (r: RackInfo) => void }
  ) {
    this.build()
    this.animate()
  }

  private build() {
    // 地面范围随机柜分布自适应：排数/列数扩大时同步放大，避免机柜漂浮在地面之外
    let spanX = 11
    let spanZ = 8
    for (const r of this.data.racks) {
      spanX = Math.max(spanX, Math.abs(r.pos.x) + RACK_W + 1.5)
      spanZ = Math.max(spanZ, Math.abs(r.pos.z) + RACK_D + 1.5)
    }
    const floorW = Math.max(26, Math.ceil(spanX * 2))
    const floorD = Math.max(18, Math.ceil(spanZ * 2))
    const gridSize = Math.max(floorW, floorD)
    // 深色地面（微反光）+ 弱化网格
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorW, floorD),
      new THREE.MeshStandardMaterial({ color: 0xe9ebf1, roughness: 0.9, metalness: 0.05 })
    )
    floor.rotation.x = -Math.PI / 2
    const grid = new THREE.GridHelper(gridSize, Math.round(gridSize), 0xc3c8d4, 0xdde1e8)
    const gridMat = grid.material as THREE.Material
    gridMat.transparent = true
    gridMat.opacity = 0.6
    this.group.add(floor, grid)

    const n = this.data.racks.length
    const geo = new THREE.BoxGeometry(RACK_W, RACK_H, RACK_D)
    const frontTex = rackFrontTexture()
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.6 })
    const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, color: 0xffffff, roughness: 0.55, metalness: 0.5 })
    // BoxGeometry 材质序: +x -x +y -y +z -z，+z 为前面板格栅
    this.im = new THREE.InstancedMesh(geo, [metalMat, metalMat, metalMat, metalMat, frontMat, metalMat], n)

    const dummy = new THREE.Object3D()
    const bodyBase = new THREE.Color(BODY_BASE)
    this.data.racks.forEach((r, idx) => {
      dummy.position.set(r.pos.x, RACK_H / 2, r.pos.z)
      dummy.rotation.y = (r.rotation_y * Math.PI) / 180
      dummy.updateMatrix()
      this.im.setMatrixAt(idx, dummy.matrix)
      this.baseColors.push(bodyBase.clone())
      this.im.setColorAt(idx, bodyBase)
      this.byIndex.push(r)
      // 头顶使用率指示条（发光，告警柜红色并脉冲）
      const c = usageColor(r.usage_pct, r.health)
      const barMat = new THREE.MeshBasicMaterial({ color: c })
      const bar = new THREE.Mesh(new THREE.BoxGeometry(RACK_W * 0.86, 0.045, RACK_D * 0.86), barMat)
      bar.position.set(r.pos.x, RACK_H + 0.05, r.pos.z)
      this.group.add(bar)
      if (r.health === 2) this.pulseMats.push({ mat: barMat, base: c.clone() })
      this.group.add(makeLabel(`${r.code} ${r.usage_pct}%`, r.pos.x, RACK_H + 0.42, r.pos.z))
    })
    this.group.add(this.im)
    this.app.scene.add(this.group)

    const canvas = this.app.renderer.domElement
    const onMove = (e: PointerEvent) => {
      const hit = this.app.pick(e.clientX, e.clientY, [this.im])
      const idx = hit && hit.instanceId != null ? hit.instanceId : -1
      if (idx === this.hoverIdx) return
      if (this.hoverIdx >= 0) this.im.setColorAt(this.hoverIdx, this.baseColors[this.hoverIdx])
      if (idx >= 0) this.im.setColorAt(idx, this.baseColors[idx].clone().lerp(new THREE.Color(0xffffff), 0.45))
      if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true
      this.hoverIdx = idx
      canvas.style.cursor = idx >= 0 ? 'pointer' : 'default'
    }
    const onClick = (e: MouseEvent) => {
      const hit = this.app.pick(e.clientX, e.clientY, [this.im])
      if (hit && hit.instanceId != null) this.handlers.onRackClick(this.byIndex[hit.instanceId])
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('click', onClick)
    this.cleanupFns.push(() => {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('click', onClick)
    })
  }

  // 告警柜头顶指示条呼吸脉冲
  private animate() {
    if (!this.pulseMats.length) return
    const tick = () => {
      const t = (Math.sin(performance.now() / 380) + 1) / 2
      for (const p of this.pulseMats) p.mat.color.copy(p.base).multiplyScalar(0.45 + 0.75 * t)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.cleanupFns.forEach(f => f())
    this.app.scene.remove(this.group)
    disposeGroup(this.group)
    this.im.dispose()
  }
}
