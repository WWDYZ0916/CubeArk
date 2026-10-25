import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Three.js 上下文：渲染器/相机/控制器只创建一次，场景（L1/L2）以 Group 挂载切换
export class ThreeApp {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  raycaster = new THREE.Raycaster()
  private raf = 0
  private ro: ResizeObserver

  constructor(container: HTMLElement) {
    // alpha:true + 不设scene.background = 透明画布，透出页面 stage 的渐变底（together.ai 粉紫蓝）
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03

    const hemi = new THREE.HemisphereLight(0xffffff, 0xc9ccda, 1.05)
    const dir = new THREE.DirectionalLight(0xffffff, 1.3)
    dir.position.set(8, 14, 6)
    this.scene.add(hemi, dir)

    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight
      if (!w || !h) return
      this.renderer.setSize(w, h)
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
    this.ro = new ResizeObserver(resize)
    this.ro.observe(container)
    resize()

    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  setCamera(pos: [number, number, number], target: [number, number, number]) {
    this.camera.position.set(...pos)
    this.controls.target.set(...target)
    this.controls.update()
  }

  pick(clientX: number, clientY: number, objects: THREE.Object3D[]): THREE.Intersection | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const hits = this.raycaster.intersectObjects(objects, false)
    return hits.length ? hits[0] : null
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

// 释放 Group 内所有几何体/材质/贴图
export function disposeGroup(group: THREE.Object3D) {
  group.traverse(o => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = (m as unknown as { material?: THREE.Material | THREE.Material[] }).material
    if (mat) {
      const mats = Array.isArray(mat) ? mat : [mat]
      for (const x of mats) {
        const anyX = x as unknown as { map?: THREE.Texture; dispose(): void }
        anyX.map?.dispose()
        x.dispose()
      }
    }
  })
}

// Canvas 文字标签（机柜编号/U位刻度）
export function makeLabel(text: string, x: number, y: number, z: number, scale = 1): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(10,16,22,0.72)'
  ctx.beginPath()
  ctx.roundRect(4, 8, 248, 48, 10)
  ctx.fill()
  ctx.font = 'bold 28px sans-serif'
  ctx.fillStyle = '#eceff1'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 33)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }))
  sprite.position.set(x, y, z)
  sprite.scale.set(1.1 * scale, 0.28 * scale, 1)
  return sprite
}
