/**
 * RobotDiagram2D -- Three.js 渲染 + 温度着色 + CSS 标签
 *
 * URDF 模型以固定展示姿态渲染（不跟随实时关节角度），
 * 关节温度通过 mesh 自发光 + CSS 标签双通道实时展示。
 * 固定正面 Orthographic 视角，悬停查看温度详情。
 */

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import URDFLoader from 'urdf-loader'
import type { MotorState, RobotProfile } from '@/models'
import { tempToColor } from '@/utils/tempColor'

const props = defineProps<{
  profile: RobotProfile
  motorState?: MotorState[]
  alarmTemp?: number
  width?: number
  height?: number
}>()

const alarmThreshold = computed(() => props.alarmTemp ?? 70)
const W = computed(() => props.width ?? 500)
const H = computed(() => props.height ?? 680)

// ============================================================
// URDF XML 解析
// ============================================================

interface URDFJoint {
  name: string; parent: string; child: string
  x: number; y: number; z: number
}

const urdfJoints = new Map<string, URDFJoint>()

function parseURDF(xml: string): void {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  doc.querySelectorAll('joint').forEach(el => {
    const name = el.getAttribute('name')!
    const parent = el.querySelector('parent')?.getAttribute('link') || ''
    const child = el.querySelector('child')?.getAttribute('link') || ''
    const xyz = (el.querySelector('origin')?.getAttribute('xyz') || '0 0 0').split(' ').map(Number)
    urdfJoints.set(name, { name, parent, child, x: xyz[0], y: xyz[1], z: xyz[2] })
  })
}

/** 沿 kinematic chain 计算所有 link 的绝对坐标（世界 = pelvis） */
function computeAbsolutePositions(): Map<string, { x: number; y: number; z: number }> {
  const positions = new Map<string, { x: number; y: number; z: number }>()

  function walk(jointName: string, px: number, py: number, pz: number, visited: Set<string>) {
    if (visited.has(jointName)) return
    visited.add(jointName)
    const jd = urdfJoints.get(jointName)
    if (!jd) return
    const ax = px + jd.x; const ay = py + jd.y; const az = pz + jd.z
    positions.set(jd.child, { x: ax, y: ay, z: az })
    for (const [, childJd] of urdfJoints) {
      if (childJd.parent === jd.child) walk(childJd.name, ax, ay, az, visited)
    }
  }

  const visited = new Set<string>()
  // pelvis 或 base_link 作为根
  for (const [, jd] of urdfJoints) {
    const p = jd.parent.toLowerCase()
    if (p === 'pelvis' || p === 'base_link' || p === 'world') {
      walk(jd.name, 0, 0, 0, visited)
    }
  }
  return positions
}

// ============================================================
// 关节分组
// ============================================================

function getBaseName(urdfName: string): string {
  return urdfName.replace(/_joint$/, '').replace(/_(pitch|roll|yaw)$/, '')
}
function getAxisLabel(urdfName: string): string {
  const m = urdfName.match(/_(pitch|roll|yaw)_joint$/)
  return m ? ({ pitch: '俯仰', roll: '侧摆', yaw: '偏航' })[m[1]] || '' : ''
}
function getSide(name: string): 'left' | 'right' | 'center' {
  if (name.startsWith('left')) return 'left'
  if (name.startsWith('right')) return 'right'
  return 'center'
}

interface JointGroup {
  baseName: string
  displayName: string
  side: 'left' | 'right' | 'center'
  motorIndices: number[]
  axes: string[]
  childLinks: string[]
  urdfY: number
  /** 预计算的标签基准位置（URDF 坐标系 → 视口像素） */
  labelSX: number
  labelSY: number
  temp: number
  alert: boolean
}

const jointGroups = ref<JointGroup[]>([])

function buildJointGroups(): void {
  const tmp = new Map<string, { indices: number[]; axes: string[]; links: string[]; displayName: string }>()

  for (let i = 0; i < props.profile.urdfJoints.length; i++) {
    const urdfName = props.profile.urdfJoints[i]
    const base = getBaseName(urdfName)
    if (!tmp.has(base)) tmp.set(base, { indices: [], axes: [], links: [], displayName: '' })
    const g = tmp.get(base)!
    g.indices.push(i)
    const axis = getAxisLabel(urdfName)
    if (axis) g.axes.push(axis)

    const jd = urdfJoints.get(urdfName)
    if (jd && !g.links.includes(jd.child)) g.links.push(jd.child)

    if (!g.displayName) {
      const dn = props.profile.displayNames[i] ?? urdfName
      g.displayName = dn.replace(/(俯仰|侧摆|偏航)$/, '') || dn
    }
  }

  // 计算绝对坐标，取每组的平均 URDF y（用于 side 判定等）
  const absPos = computeAbsolutePositions()

  jointGroups.value = [...tmp.entries()].map(([baseName, g]) => {
    let sumY = 0; let count = 0
    for (const link of g.links) {
      const pos = absPos.get(link)
      if (pos) { sumY += pos.y; count++ }
    }
    return {
      baseName,
      displayName: g.displayName,
      side: getSide(baseName),
      motorIndices: g.indices,
      axes: g.axes.length ? g.axes : [''],
      childLinks: g.links,
      urdfY: count > 0 ? sumY / count : 0,
      labelSX: 0,
      labelSY: 0,
      temp: NaN,
      alert: false,
    }
  })
}

// ============================================================
// Three.js 状态
// ============================================================

const containerRef = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.OrthographicCamera
let robot: THREE.Object3D
let animationId = 0

// link name → meshes
const linkMeshes = new Map<string, THREE.Mesh[]>()
// link name → joint group (for label positioning)
const linkToGroup = new Map<string, JointGroup>()

// ============================================================
// CSS 标签
// ============================================================

let labelHost: HTMLDivElement
let tooltipEl: HTMLDivElement

interface TempLabel {
  el: HTMLDivElement
  nameEl: HTMLSpanElement
  valueEl: HTMLSpanElement
}

const tempLabels = new Map<string, TempLabel>()

function labelBg(temp: number): string {
  if (isNaN(temp)) return 'rgba(0,0,0,0.6)'
  const t = Math.min(temp / alarmThreshold.value, 1.5)
  // 冷→热: 暗蓝灰 → 暗橙 → 暗红
  const r = Math.round(10 + t * 80)
  const g = Math.round(10 + (1 - t) * 20)
  const b = Math.round(30 + (1 - t) * 30)
  return `rgba(${r},${g},${b},0.82)`
}

function createLabels(): void {
  labelHost = document.createElement('div')
  labelHost.className = 'temp-label-host'
  containerRef.value!.appendChild(labelHost)

  tooltipEl = document.createElement('div')
  tooltipEl.className = 'joint-tooltip-2d'
  tooltipEl.style.display = 'none'
  containerRef.value!.appendChild(tooltipEl)

  for (const group of jointGroups.value) {
    const el = document.createElement('div')
    el.className = 'temp-label'
    if (group.side === 'left') el.classList.add('side-left')
    else if (group.side === 'right') el.classList.add('side-right')
    else el.classList.add('side-center')

    const nameEl = document.createElement('span')
    nameEl.className = 'tl-name'
    nameEl.textContent = group.displayName

    const valueEl = document.createElement('span')
    valueEl.className = 'tl-value'

    el.appendChild(nameEl)
    el.appendChild(valueEl)
    labelHost.appendChild(el)

    tempLabels.set(group.baseName, { el, nameEl, valueEl })
  }
}

function updateLabels(): void {
  for (const group of jointGroups.value) {
    const label = tempLabels.get(group.baseName)
    if (!label) continue

    const t = group.temp
    label.el.classList.toggle('alert', group.alert)
    label.el.style.background = labelBg(t)
    label.valueEl.textContent = isNaN(t) ? '--°' : `${t.toFixed(1)}°`
  }
}

/** 每帧：3D 投影关节到屏幕 + side 偏移 */
function projectLabels(): void {
  const cr = containerRef.value!.getBoundingClientRect()
  const cw = cr.width
  const ch = cr.height

  for (const group of jointGroups.value) {
    const label = tempLabels.get(group.baseName)
    if (!label) continue

    const linkName = group.childLinks[0]
    if (!linkName) { label.el.style.opacity = '0'; continue }

    const linkObj = robot?.getObjectByName(linkName)
    if (!linkObj) { label.el.style.opacity = '0'; continue }

    const wp = new THREE.Vector3()
    linkObj.getWorldPosition(wp)
    const ndc = wp.clone().project(camera)

    if (ndc.z > 1) { label.el.style.opacity = '0'; continue }

    label.el.style.opacity = '1'
    const sx = (ndc.x * 0.5 + 0.5) * cw
    const sy = (-ndc.y * 0.5 + 0.5) * ch

    // 每个标签独立偏移量，在 labelOffsets 里逐个调
    const off = props.profile.labelOffsets[group.baseName] ?? { x: 0, y: 0 }

    label.el.style.transform = `translate(${sx + off.x}px, ${sy - 10 + off.y}px)`
  }
}

// ============================================================
// 初始化
// ============================================================

const loading = ref(true)

onMounted(async () => {
  parseURDF(props.profile.urdfXml)
  buildJointGroups()

  const w = W.value
  const h = H.value

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  renderer.setClearColor(0x0d1b2a)
  containerRef.value?.appendChild(renderer.domElement)

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0d1b2a)

  // Lights
  scene.add(new THREE.AmbientLight(0x404060, 1.5))
  const dl1 = new THREE.DirectionalLight(0xffffff, 2.0)
  dl1.position.set(0.5, 1, 1.5)
  scene.add(dl1)
  const dl2 = new THREE.DirectionalLight(0x8888ff, 0.6)
  dl2.position.set(-0.5, 0.3, 0.8)
  scene.add(dl2)

  // Ground grid
  const grid = new THREE.GridHelper(2, 20, 0x1a3a5c, 0x1a3a5c)
  grid.position.y = -1.2
  scene.add(grid)

  // Camera (Orthographic, 正面视角)
  // 用 kinematic chain 算绝对坐标，再经 robot.rotation 变换到 Three.js 世界空间
  const absPos = computeAbsolutePositions()
  const rotEuler = new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2, 'XYZ')
  const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(rotEuler)
  const tv = new THREE.Vector3()

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [, pos] of absPos) {
    tv.set(pos.x, pos.y, pos.z).applyMatrix4(rotMatrix)
    minX = Math.min(minX, tv.x); maxX = Math.max(maxX, tv.x)
    minY = Math.min(minY, tv.y); maxY = Math.max(maxY, tv.y)
  }

  const margin = 0.06
  const halfH = (maxY - minY) / 2 + margin
  const halfW = halfH * (w / h)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2 + 0.08  // 正值 = 机器人往下移，利用底部空白

  camera = new THREE.OrthographicCamera(
    cx - halfW, cx + halfW,
    cy + halfH, cy - halfH,
    0.1, 10,
  )
  camera.position.set(0, cy, 3)
  camera.lookAt(0, cy, 0)

  // Load URDF
  const loadingMgr = new THREE.LoadingManager()
  const urdfLoader = new URDFLoader(loadingMgr)
  urdfLoader.workingPath = props.profile.urdfMeshBase

  try {
    robot = urdfLoader.parse(props.profile.urdfXml)
    robot.rotation.set(-Math.PI / 2, 0, -Math.PI / 2)
    robot.scale.setScalar(0.78)
    scene.add(robot)

    // 设置展示用静态姿态（肘部微弯，不随真实关节数据变化）
    for (const [name, value] of Object.entries(props.profile.restPose)) {
      const j = (robot as any).joints?.[name]
      if (j?.setJointValue) j.setJointValue(value)
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[RobotDiagram2D] 部分网格加载超时')
        resolve()
      }, 15000)

      loadingMgr.onLoad = () => { clearTimeout(timeout); resolve() }
      loadingMgr.onError = (url) => console.warn('[RobotDiagram2D] 网格加载失败:', url)

      // 兜底：万一 onLoad 已提前触发
      setTimeout(() => {
        let hasMesh = false
        robot?.traverse(c => { if (c instanceof THREE.Mesh) hasMesh = true })
        if (hasMesh) { clearTimeout(timeout); resolve() }
      }, 200)
    })

    // 构建 link→meshes 映射 + 克隆材质
    buildLinkMeshMap()
    // link → group 映射
    for (const group of jointGroups.value) {
      for (const link of group.childLinks) {
        linkToGroup.set(link, group)
      }
    }

    // 创建 CSS 标签
    createLabels()

    // 渲染器事件
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)

    // 启动渲染循环
    animate()
    loading.value = false
  } catch (e) {
    console.error('[RobotDiagram2D] URDF 加载失败:', e)
    loading.value = false
  }
})

function buildLinkMeshMap(): void {
  // 收集所有 URDF link 名称
  const allLinks = new Set<string>()
  for (const [, jd] of urdfJoints) {
    allLinks.add(jd.parent)
    allLinks.add(jd.child)
  }

  robot.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      let parent = child.parent
      while (parent && parent !== robot) {
        if (parent.name && allLinks.has(parent.name)) {
          if (!linkMeshes.has(parent.name)) linkMeshes.set(parent.name, [])
          // 克隆材质以便独立控制 emissive
          const mat = child.material
          if (Array.isArray(mat)) {
            child.material = mat.map(m => m.clone())
          } else {
            child.material = mat.clone()
          }
          linkMeshes.get(parent.name)!.push(child)
          break
        }
        parent = parent.parent
      }
    }
  })

  console.log('[RobotDiagram2D] link→meshes 映射:', linkMeshes.size, '个 link')
}

// ============================================================
// 温度更新
// ============================================================

watch(() => props.motorState, (motors) => {
  if (!motors || motors.length === 0 || !robot) return

  const threshold = alarmThreshold.value

  // 1) 收集 link 温度（不更新关节角度，保持静态姿态）
  const linkTemps = new Map<string, number>()

  for (let i = 0; i < Math.min(motors.length, props.profile.urdfJoints.length); i++) {
    const m = motors[i]
    const urdfName = props.profile.urdfJoints[i]

    // 温度
    if (m.mode === 0 || m.mode === 1) {
      const temp = m.temperature?.[0] ?? 0
      const jd = urdfJoints.get(urdfName)
      if (jd) {
        const cur = linkTemps.get(jd.child) ?? -Infinity
        linkTemps.set(jd.child, Math.max(cur, temp))
      }
    }
  }

  // 2) 应用 emissive 到 link meshes
  for (const [linkName, temp] of linkTemps) {
    const meshes = linkMeshes.get(linkName)
    if (!meshes) continue
    const { color, emissiveIntensity } = tempToColor(temp, threshold)
    for (const mesh of meshes) {
      const mat = mesh.material as THREE.MeshPhongMaterial
      if (mat.emissive) mat.emissive.copy(color)
      mat.emissiveIntensity = emissiveIntensity
    }
  }

  // 3) 更新 jointGroup 温度
  for (const group of jointGroups.value) {
    let maxTemp = -Infinity
    for (const idx of group.motorIndices) {
      const m = motors[idx]
      if (m && (m.mode === 0 || m.mode === 1)) {
        const t = m.temperature?.[0] ?? 0
        maxTemp = Math.max(maxTemp, t)
      }
    }
    group.temp = maxTemp === -Infinity ? NaN : maxTemp
    group.alert = !isNaN(group.temp) && group.temp > threshold
  }

  // 4) 刷新 CSS 标签文字
  updateLabels()
}, { deep: false })

// ============================================================
// 鼠标悬停 (Raycaster)
// ============================================================

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

function onPointerMove(e: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(pointer, camera)
  const meshes: THREE.Object3D[] = []
  linkMeshes.forEach(ms => meshes.push(...ms))
  const hits = raycaster.intersectObjects(meshes, false)

  if (hits.length > 0) {
    const mesh = hits[0].object
    let parent = mesh.parent
    let linkName = ''
    while (parent && parent !== robot) {
      if (linkMeshes.has(parent.name || '')) { linkName = parent.name!; break }
      parent = parent.parent
    }

    const group = linkToGroup.get(linkName)
    if (group && !isNaN(group.temp)) {
      renderer.domElement.style.cursor = 'pointer'
      const parts = group.axes.map((axis, i) => {
        const idx = group.motorIndices[i]
        if (idx === undefined) return ''
        const m = props.motorState?.[idx]
        const t = (m && (m.mode === 0 || m.mode === 1)) ? (m.temperature?.[0] ?? NaN) : NaN
        return axis ? `${axis}: ${isNaN(t) ? '--' : t.toFixed(1) + '°'}` : `${isNaN(t) ? '--' : t.toFixed(1) + '°'}`
      }).filter(Boolean).join('  ')

      tooltipEl.innerHTML = `<strong>${group.displayName}</strong><span class="tt-detail">${parts}</span>`
      tooltipEl.style.display = ''
      const cr = containerRef.value!.getBoundingClientRect()
      const tw = tooltipEl.offsetWidth
      const gap = 10
      // 左边关节（屏幕右侧）→ tooltip 以光标为右边界向左展开
      // 右边关节（屏幕左侧）→ tooltip 以光标为左边界向右展开
      const tipX = group.side === 'left'
        ? e.clientX - cr.left - tw - gap   // 右对齐光标
        : e.clientX - cr.left + gap         // 左对齐光标
      tooltipEl.style.left = `${tipX}px`
      tooltipEl.style.top = `${e.clientY - cr.top - 8}px`
      return
    }
  }

  renderer.domElement.style.cursor = ''
  tooltipEl.style.display = 'none'
}

function onPointerLeave(): void {
  renderer.domElement.style.cursor = ''
  tooltipEl.style.display = 'none'
}

// ============================================================
// 渲染循环
// ============================================================

function animate(): void {
  animationId = requestAnimationFrame(animate)
  projectLabels()
  renderer.render(scene, camera)
}

// ============================================================
// 清理
// ============================================================

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  renderer?.dispose()
  renderer?.domElement.removeEventListener('pointermove', onPointerMove)
  renderer?.domElement.removeEventListener('pointerleave', onPointerLeave)
})
</script>

<template>
  <div
    ref="containerRef"
    class="diagram-wrap"
    :style="{ width: W + 'px', height: H + 'px' }"
  >
    <div v-if="loading" class="loading-overlay">加载机器人模型…</div>
  </div>
</template>

<style scoped>
.diagram-wrap {
  position: relative;
  background: #0d1b2a;
  border-radius: 8px;
  overflow: hidden;
  display: inline-block;
  line-height: 0;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  z-index: 5;
  pointer-events: none;
}
</style>

<style>
/* ---- CSS 温度标签 ---- */
.temp-label-host {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  overflow: hidden;
}

.temp-label {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(4px);
  transition: background 0.4s, border-color 0.4s;
}

.temp-label.side-left {
  transform-origin: right center;
}
.temp-label.side-center {
  transform-origin: left center;
}

.temp-label.alert {
  border-color: rgba(231, 76, 60, 0.6);
  animation: alert-pulse 1s ease-in-out infinite alternate;
}

@keyframes alert-pulse {
  from { box-shadow: 0 0 4px rgba(231, 76, 60, 0.3); }
  to   { box-shadow: 0 0 12px rgba(231, 76, 60, 0.6); }
}

.tl-name {
  color: rgba(255, 255, 255, 0.55);
  font-size: 10px;
}

.tl-value {
  color: rgba(255, 255, 255, 0.95);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

/* ---- 悬停工具提示 ---- */
.joint-tooltip-2d {
  position: absolute;
  z-index: 15;
  background: rgba(0, 0, 0, 0.88);
  color: #ecf0f1;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(6px);
  line-height: 1.6;
}

.joint-tooltip-2d strong {
  margin-right: 8px;
  color: #90caf9;
}

.joint-tooltip-2d .tt-detail {
  color: #b0bec5;
  font-size: 11px;
}
</style>
