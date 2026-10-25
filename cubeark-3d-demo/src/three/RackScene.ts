import * as THREE from 'three'
import { disposeGroup, makeLabel } from './three-app'
import type { ThreeApp } from './three-app'
import { devicePanelTexture } from './device-textures'
import type { RackSceneData, DeviceBrief, WarehouseDevice, CheckDropResult } from '../types'

// L2 单机柜 U 位视图：机架 + 空闲U位板 + 真实面板设备盒体(程序化CanvasTexture) + U位标尺
// 交互：点击设备看详情；从右侧"设备库"按住拖入机柜 → 吸附U位 → 冲突红显 → 松手生成上架单
const W = 0.6
const D = 1.0
const H = 2.0
const Y0 = 0.12 // U1 底部
const Y1 = 1.96 // 顶U 上部
const WHITE = new THREE.Color(0xffffff)

// 七分类配色（经用户确认更新：1虚拟化服务器 2交换机 3防火墙 4存储 5HPC登陆 6HPC计算 7其他）
const CAT_COLOR: Record<number, number> = {
  1: 0x42a5f5, // 虚拟化服务器
  2: 0x26a69a, // 交换机
  3: 0xe53935, // 防火墙
  4: 0xffa726, // 存储
  5: 0xab47bc, // HPC登陆节点
  6: 0x7e57c2, // HPC计算节点
  7: 0x90a4ae  // 其他
}

interface DeviceMeshInfo {
  mesh: THREE.Mesh
  device: DeviceBrief
  baseColors: THREE.Color[]
}

export class RackScene {
  group = new THREE.Group()
  private uH = 0
  private uTotal = 42
  private deviceMeshes: DeviceMeshInfo[] = []
  private dragPlane!: THREE.Mesh
  private ghost: THREE.Mesh | null = null
  private ghostInfo: { device: WarehouseDevice; uStart: number; ok: boolean } | null = null
  private dragCleanup: Array<() => void> = []
  private cleanupFns: Array<() => void> = []
  private hover: DeviceMeshInfo | null = null

  constructor(
    private app: ThreeApp,
    private data: RackSceneData,
    private handlers: {
      onDeviceClick: (d: DeviceBrief) => void
      checkDrop: (uStart: number, device: WarehouseDevice) => CheckDropResult
      onDropped: (device: WarehouseDevice, uStart: number, ok: boolean) => void
      // 已上架设备在机柜内拖动换 U 位（可选实现）
      checkDeviceMove?: (uStart: number, device: DeviceBrief) => CheckDropResult
      onDeviceMoved?: (device: DeviceBrief, uStart: number, ok: boolean) => void
    }
  ) {
    this.build()
  }

  private build() {
    this.uTotal = this.data.rack.u_total
    this.uH = (Y1 - Y0) / this.uTotal
    const slotY = (u: number) => Y0 + (u - 0.5) * this.uH

    // 机架框架（深色阳极氧化质感）
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x22243a, roughness: 0.42, metalness: 0.55 })
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, H + 0.1, 0.06), frameMat)
      post.position.set(sx * (W / 2 + 0.03), (H + 0.1) / 2, sz * (D / 2 + 0.03))
      this.group.add(post)
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.14, 0.1, D + 0.14), frameMat)
    base.position.y = 0.05
    const top = base.clone()
    top.position.y = H + 0.05
    this.group.add(base, top)
    // 侧板与背板（半透暗色，模拟网孔板；不参与拾取）
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a1c30, roughness: 0.85, metalness: 0.2, transparent: true, opacity: 0.72 })
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.015, H - 0.06, D - 0.04), panelMat)
    sideL.position.set(-W / 2 - 0.012, H / 2, 0)
    const sideR = sideL.clone()
    sideR.position.x = W / 2 + 0.012
    const back = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, H - 0.06, 0.015), panelMat)
    back.position.set(0, H / 2, -D / 2 - 0.012)
    this.group.add(sideL, sideR, back)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xe8eaf0, roughness: 0.95 })
    )
    floor.rotation.x = -Math.PI / 2
    this.group.add(floor)

    // U位标尺（每2U）
    for (let u = 2; u <= this.uTotal; u += 2) {
      this.group.add(makeLabel(String(u), -W / 2 - 0.28, slotY(u), D / 2, 0.45))
    }

    // 扫描占用段，画设备盒体；空闲/预留画U位板
    const emptyGeo = new THREE.BoxGeometry(W * 0.9, this.uH * 0.88, 0.02)
    const seen = new Set<number>()
    this.data.u_slots.forEach(slot => {
      if (!slot.device) {
        const color = slot.status === 2 ? 0xf9a825 : 0x37474f
        const plate = new THREE.Mesh(
          emptyGeo,
          new THREE.MeshStandardMaterial({ color, roughness: 0.85, transparent: true, opacity: 0.85 })
        )
        plate.position.set(0, slotY(slot.u_no), D / 2 + 0.01)
        this.group.add(plate)
        return
      }
      if (seen.has(slot.device.id)) return
      seen.add(slot.device.id)
      // 连续段 u_start..u_end
      let uStart = slot.u_no
      while (uStart > 1) {
        const prev = this.data.u_slots[uStart - 2]
        if (!prev?.device || prev.device.id !== slot.device.id) break
        uStart--
      }
      let uEnd = slot.u_no
      while (uEnd < this.uTotal) {
        const next = this.data.u_slots[uEnd]
        if (!next?.device || next.device.id !== slot.device.id) break
        uEnd++
      }
      const h = (uEnd - uStart + 1) * this.uH * 0.92
      const uCount = uEnd - uStart + 1
      const alarm = slot.device.health === 2
      const cat = slot.device.category
      // 真实设备面板：前面板程序化贴图（厂商型号/端口阵列/散热孔/LED），其余面用深色机身
      const frontTex = devicePanelTexture(cat, uCount, `${slot.device.model.vendor} ${slot.device.model.model}`, alarm)
      const bodyBase = new THREE.Color(alarm ? 0x7e2b27 : (CAT_COLOR[cat] ?? CAT_COLOR[7])).multiplyScalar(0.4)
      const sideMat = new THREE.MeshStandardMaterial({ color: bodyBase, roughness: 0.55, metalness: 0.22 })
      const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, color: alarm ? 0xffb4ac : 0xffffff, roughness: 0.42, metalness: 0.28 })
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(W * 0.92, h, 0.72),
        [sideMat, sideMat.clone(), sideMat.clone(), sideMat.clone(), frontMat, sideMat.clone()] // 材质序: +x -x +y -y +z -z，+z为前面板
      )
      const centerY = (slotY(uStart) + slotY(uEnd)) / 2
      mesh.position.set(0, centerY, D / 2 - 0.34)
      this.group.add(mesh)
      this.deviceMeshes.push({
        mesh, device: slot.device,
        baseColors: (mesh.material as THREE.Material[]).map(m => (m as THREE.MeshStandardMaterial).color.clone())
      })
    })

    // 拖拽目标面（完全透明但可被射线命中）
    this.dragPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 2.4, H * 1.05),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    )
    this.dragPlane.position.set(0, (Y0 + Y1) / 2, D / 2 + 0.55)
    this.group.add(this.dragPlane)
    this.app.scene.add(this.group)

    const canvas = this.app.renderer.domElement
    const meshes = this.deviceMeshes.map(d => d.mesh)
    const matsOf = (m: THREE.Mesh): THREE.MeshStandardMaterial[] =>
      Array.isArray(m.material) ? (m.material as THREE.MeshStandardMaterial[]) : [m.material as THREE.MeshStandardMaterial]
    const onMove = (e: PointerEvent) => {
      const hit = this.app.pick(e.clientX, e.clientY, meshes)
      const found = hit ? this.deviceMeshes.find(d => d.mesh === hit.object) ?? null : null
      if (found === this.hover) return
      if (this.hover) {
        const hm = matsOf(this.hover.mesh)
        hm.forEach((m, i) => m.color.copy(this.hover!.baseColors[i] ?? this.hover!.baseColors[0]))
      }
      if (found) {
        matsOf(found.mesh).forEach((m, i) => m.color.copy(found.baseColors[i] ?? found.baseColors[0]).lerp(WHITE, 0.32))
      }
      this.hover = found
      canvas.style.cursor = found ? 'pointer' : 'default'
    }
    const onClick = (e: MouseEvent) => {
      const hit = this.app.pick(e.clientX, e.clientY, meshes)
      if (!hit) return
      const found = this.deviceMeshes.find(d => d.mesh === hit.object)
      if (found) this.handlers.onDeviceClick(found.device)
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('click', onClick)

    // 已上架设备：按住拖动超过阈值即进入「换 U 位」拖拽
    let press: { device: DeviceBrief; x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => {
      if (!this.handlers.onDeviceMoved) return
      const hit = this.app.pick(e.clientX, e.clientY, meshes)
      const found = hit ? this.deviceMeshes.find(d => d.mesh === hit.object) : null
      press = found ? { device: found.device, x: e.clientX, y: e.clientY } : null
    }
    const onDragMove = (e: PointerEvent) => {
      if (!press) return
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return
      const dev = press.device
      press = null
      this.startDeviceDrag(dev)
    }
    const onDragUp = () => { press = null }
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp)

    this.cleanupFns.push(() => {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onDragMove)
      window.removeEventListener('pointerup', onDragUp)
    })
  }

  // 机柜内拖动已上架设备：吸附到新的起始 U，松手回调 onDeviceMoved
  private startDeviceDrag(dev: DeviceBrief) {
    const check = this.handlers.checkDeviceMove
    const done = this.handlers.onDeviceMoved
    if (!check || !done) return
    this.endDrag(false)
    // 拖动期间关闭相机控制，避免与 OrbitControls 的旋转/平移冲突
    this.app.controls.enabled = false
    this.dragCleanup.push(() => { this.app.controls.enabled = true })
    const height = dev.model.u_height
    const h = height * this.uH * 0.9
    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.92, h, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x64b5f6, transparent: true, opacity: 0.55, depthTest: false })
    )
    this.ghost.renderOrder = 999
    this.ghost.visible = false
    this.group.add(this.ghost)
    let target: { uStart: number; ok: boolean } | null = null

    const onMove = (e: PointerEvent) => {
      if (!this.ghost) return
      const hit = this.app.pick(e.clientX, e.clientY, [this.dragPlane])
      if (!hit) {
        this.ghost.visible = false
        target = null
        return
      }
      const maxStart = this.uTotal - height + 1
      const u = Math.min(Math.max(Math.floor((hit.point.y - Y0) / this.uH) + 1, 1), Math.max(maxStart, 1))
      const centerY = Y0 + (u + height / 2 - 0.5) * this.uH
      this.ghost.visible = true
      this.ghost.position.set(0, centerY, D / 2 - 0.2)
      const c = check(u, dev)
      ;(this.ghost.material as THREE.MeshStandardMaterial).color.set(c.ok ? 0x66bb6a : 0xe53935)
      target = { uStart: u, ok: c.ok }
    }
    const onUp = () => {
      const t = target
      this.endDrag(true)
      if (t) done(dev, t.uStart, t.ok)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    this.dragCleanup.push(() => window.removeEventListener('pointermove', onMove))
  }

  // 从"设备库"面板开始拖拽（App 在 palette pointerdown 时调用）
  startDrag(dev: WarehouseDevice) {
    this.endDrag(false)
    const h = dev.u_height * this.uH * 0.9
    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.92, h, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x66bb6a, transparent: true, opacity: 0.55, depthTest: false })
    )
    this.ghost.renderOrder = 999
    this.ghost.visible = false
    this.group.add(this.ghost)
    this.ghostInfo = null

    const onMove = (e: PointerEvent) => {
      if (!this.ghost) return
      const hit = this.app.pick(e.clientX, e.clientY, [this.dragPlane])
      if (!hit) {
        this.ghost.visible = false
        this.ghostInfo = null
        return
      }
      const maxStart = this.uTotal - dev.u_height + 1
      const u = Math.min(Math.max(Math.floor((hit.point.y - Y0) / this.uH) + 1, 1), Math.max(maxStart, 1))
      const centerY = Y0 + (u + dev.u_height / 2 - 0.5) * this.uH
      this.ghost.visible = true
      this.ghost.position.set(0, centerY, D / 2 - 0.2)
      const check = this.handlers.checkDrop(u, dev)
      ;(this.ghost.material as THREE.MeshStandardMaterial).color.set(check.ok ? 0x66bb6a : 0xe53935)
      this.ghostInfo = { device: dev, uStart: u, ok: check.ok }
    }
    const onUp = () => {
      const info = this.ghostInfo
      this.endDrag(true)
      if (info) this.handlers.onDropped(info.device, info.uStart, info.ok)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    this.dragCleanup.push(() => window.removeEventListener('pointermove', onMove))
  }

  private endDrag(_fire: boolean) {
    this.dragCleanup.forEach(f => f())
    this.dragCleanup = []
    if (this.ghost) {
      this.group.remove(this.ghost)
      this.ghost.geometry.dispose()
      ;(this.ghost.material as THREE.Material).dispose()
      this.ghost = null
    }
    this.ghostInfo = null
  }

  dispose() {
    this.endDrag(false)
    this.cleanupFns.forEach(f => f())
    this.app.scene.remove(this.group)
    disposeGroup(this.group)
  }
}
