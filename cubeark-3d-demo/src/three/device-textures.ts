import * as THREE from 'three'

// 程序化设备前面板贴图：按七分类用 Canvas 绘制真实机架设备面板细节（离线零外部资源）
// 分类：1虚拟化服务器 2交换机 3防火墙 4存储 5HPC登陆 6HPC计算 7其他(PDU等)
const cache = new Map<string, THREE.CanvasTexture>()

const CAT_ACCENT: Record<number, string> = {
  1: '#42a5f5', 2: '#26a69a', 3: '#e53935', 4: '#ffa726', 5: '#ab47bc', 6: '#7e57c2', 7: '#90a4ae'
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function led(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r = 3.5) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

// 交换机：RJ45端口阵列 + SFP+上联
function drawSwitch(ctx: CanvasRenderingContext2D, x: number, w: number, h: number) {
  const portRows = h >= 200 ? 4 : 2
  const areaY = 46
  const areaH = h - areaY - 14
  const rowH = areaH / portRows
  const ports = 12
  const uplinkW = 74
  const portW = (w - uplinkW - 10) / ports
  for (let r = 0; r < portRows; r++) {
    const y = areaY + r * rowH + 4
    const ph = Math.min(rowH - 8, 18)
    for (let i = 0; i < ports; i++) {
      const px = x + i * portW + 2
      ctx.fillStyle = '#10151c'
      rrect(ctx, px, y, portW - 4, ph, 2)
      ctx.fill()
      ctx.fillStyle = '#8aa8b8' // 金手指
      ctx.fillRect(px + 3, y + ph * 0.55, portW - 10, 2.5)
      if (i % 6 === 5) led(ctx, px + portW / 2 - 2, y + ph / 2 - 3, '#4dd0e1', 1.6)
    }
    // SFP+ 上联笼子
    const sx = x + ports * portW + 8
    ctx.fillStyle = '#141a22'
    rrect(ctx, sx, y, uplinkW - 12, ph, 2)
    ctx.fill()
    ctx.fillStyle = '#243040'
    for (let k = 0; k < 2; k++) rrect(ctx, sx + 8 + k * 26, y + 3, 22, ph - 6, 1.5), ctx.fill()
  }
}

// 服务器/HPC：左侧硬盘托架 + 蜂巢散热孔 + 电源/USB/电源钮
function drawServer(ctx: CanvasRenderingContext2D, x: number, w: number, h: number, hpc: boolean) {
  const bayH = 30
  const bays = Math.max(2, Math.floor((h - 60) / bayH))
  const bayW = 92
  for (let i = 0; i < bays; i++) {
    const y = 44 + i * bayH
    ctx.fillStyle = '#151b23'
    rrect(ctx, x, y, bayW, bayH - 6, 3)
    ctx.fill()
    ctx.fillStyle = '#2b3644'
    ctx.fillRect(x + 10, y + (bayH - 6) / 2 - 1.5, bayW - 34, 3) // 把手槽
    led(ctx, x + bayW - 14, y + (bayH - 6) / 2, i % 4 === 3 ? '#4dd0e1' : '#66bb6a', 2.6)
    ctx.fillStyle = '#39424e'
    ctx.font = '9px sans-serif'
    ctx.fillText(String(i), x + 4, y + bayH / 2 + 3)
  }
  // 蜂巢散热
  const ventX = x + bayW + 16
  const ventW = w - bayW - 96
  const rows = Math.floor((h - 60) / 13)
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < Math.floor(ventW / 13); cIdx++) {
      const cx = ventX + cIdx * 13 + (r % 2) * 6.5
      const cy = 46 + r * 13
      ctx.fillStyle = hpc ? '#10141b' : '#0d1117'
      ctx.beginPath()
      ctx.arc(cx, cy, 4.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // 右侧：电源钮 + USB + 状态屏
  const rx = x + w - 76
  led(ctx, rx + 12, 52, '#66bb6a', 5)
  ctx.strokeStyle = '#3a4653'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(rx + 12, 52, 8.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#141a22'
  rrect(ctx, rx + 28, 46, 34, 12, 2); ctx.fill()
  rrect(ctx, rx + 28, 64, 34, 12, 2); ctx.fill()
  ctx.fillStyle = '#0a2030'
  rrect(ctx, rx, 86, 62, h > 150 ? 40 : 20, 3); ctx.fill()
  led(ctx, rx + 10, 96, '#4dd0e1', 2.4)
  led(ctx, rx + 22, 96, hpc ? '#7e57c2' : '#42a5f5', 2.4)
}

// 存储：密集磁盘托架阵列
function drawStorage(ctx: CanvasRenderingContext2D, x: number, w: number, h: number) {
  const cols = 4
  const rows = Math.max(2, Math.floor((h - 58) / 34))
  const tw = (w - 8) / cols - 6
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const tx = x + cIdx * (tw + 8) + 2
      const ty = 46 + r * 34
      ctx.fillStyle = '#141a22'
      rrect(ctx, tx, ty, tw, 28, 2)
      ctx.fill()
      ctx.fillStyle = '#2b3644'
      ctx.fillRect(tx + 6, ty + 11, tw * 0.42, 4) // 把手
      led(ctx, tx + tw - 9, ty + 13, (r * cols + cIdx) % 7 === 3 ? '#ffa726' : '#66bb6a', 2.2)
    }
  }
}

// 防火墙：警示条 + 端口组
function drawFirewall(ctx: CanvasRenderingContext2D, x: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(229,57,53,0.85)'
  ctx.fillRect(x, 40, w, 4)
  const y = 54
  for (let i = 0; i < 8; i++) {
    const px = x + i * 30 + 4
    ctx.fillStyle = '#10151c'
    rrect(ctx, px, y, 24, 16, 2); ctx.fill()
    ctx.fillStyle = '#8aa8b8'
    ctx.fillRect(px + 4, y + 9, 16, 2.2)
  }
  ctx.fillStyle = '#141a22'
  rrect(ctx, x + w - 76, y - 2, 66, 20, 2); ctx.fill()
  ctx.fillStyle = '#e53935'
  ctx.font = 'bold 10px sans-serif'
  ctx.fillText('FG', x + w - 66, y + 12)
  led(ctx, x + 10, h - 16, '#66bb6a', 3)
  led(ctx, x + 24, h - 16, '#4dd0e1', 3)
}

// PDU：插座列
function drawPDU(ctx: CanvasRenderingContext2D, x: number, w: number, h: number) {
  const n = Math.max(4, Math.floor((h - 50) / 26))
  for (let i = 0; i < n; i++) {
    const y = 44 + i * 26
    ctx.fillStyle = '#e8edf2'
    rrect(ctx, x, y, w - 8, 20, 3)
    ctx.fill()
    ctx.fillStyle = '#222b34'
    ctx.beginPath()
    ctx.arc(x + w / 2 - 10, y + 10, 3.4, 0, Math.PI * 2)
    ctx.arc(x + w / 2 + 10, y + 10, 3.4, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function devicePanelTexture(category: number, uHeight: number, label: string, alarm: boolean): THREE.CanvasTexture {
  const key = `${category}|${uHeight}|${label}|${alarm ? 1 : 0}`
  const hit = cache.get(key)
  if (hit) return hit

  const W = 512
  const H = Math.max(96, Math.min(768, uHeight * 130))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!

  // 金属拉丝底
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#2c343f')
  g.addColorStop(0.06, '#242b34')
  g.addColorStop(1, '#1a212a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 0.045
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, y, W, 1)
  }
  ctx.globalAlpha = 1

  // 顶部分类色条
  const accent = CAT_ACCENT[category] ?? CAT_ACCENT[7]
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, W, 5)

  // 左右安装耳 + 固定孔
  ctx.fillStyle = '#161c24'
  ctx.fillRect(0, 0, 28, H)
  ctx.fillRect(W - 28, 0, 28, H)
  ctx.fillStyle = '#333d49'
  for (let y = 12; y < H - 8; y += Math.max(18, H / 12)) {
    ctx.fillRect(9, y, 9, 5)
    ctx.fillRect(W - 18, y, 9, 5)
  }

  const ix = 40
  const iw = W - 80

  // 厂商+型号标签
  const text = label.length > 24 ? label.slice(0, 24) : label
  ctx.fillStyle = '#dbe9f5'
  ctx.font = 'bold 19px sans-serif'
  ctx.fillText(text, ix, 30)
  // 状态LED排（右上）
  led(ctx, W - 50, 24, '#66bb6a')
  led(ctx, W - 68, 24, alarm ? '#ef5350' : '#66bb6a')
  led(ctx, W - 86, 24, '#4dd0e1')

  if (category === 2) drawSwitch(ctx, ix, iw, H)
  else if (category === 4) drawStorage(ctx, ix, iw, H)
  else if (category === 3) drawFirewall(ctx, ix, iw, H)
  else if (category === 7 && uHeight <= 2) drawPDU(ctx, ix, iw, H)
  else drawServer(ctx, ix, iw, H, category === 5 || category === 6)

  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  cache.set(key, tex)
  return tex
}
