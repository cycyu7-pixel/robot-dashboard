/**
 * ============================================================
 * RobotView3D —— 3D 机器人视图 + 交互温度标签
 * ============================================================
 *
 * 功能：
 *   - URDF 模型渲染 + 关节角度驱动
 *   - 按身体部位分组标记球（俯仰/侧摆/偏航共用一个）
 *   - 鼠标悬停 → 显示该部位所有轴的温度
 *   - 超过告警阈值 → 标记球变红 + 持续显示温度
 *   - 温度色带图例
 *
 * 快捷键：
 *   C - 采集当前姿态为校准基准
 *   R - 清除校准
 */

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import URDFLoader from 'urdf-loader'
import type { MotorState } from '@/models'
import {
  G1_MOTOR_TO_URDF_JOINT,
  G1_MOTOR_DISPLAY_NAMES,
  calibrateJointValue,
  captureBaseline,
  resetCalibration,
} from '@/models'
import urdfXml from '@/urdf/g1_29dof_rev_1_0_with_inspire_hand_FTP.urdf?raw'
import TempLegend from './TempLegend.vue'

const props = defineProps<{
  motorState?: MotorState[]
  alarmTemp?: number
  width?: number
  height?: number
}>()

const containerRef = ref<HTMLDivElement | null>(null)

// ---- Three.js 核心 ----
let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let robot: THREE.Object3D
let animationId = 0

// ---- Orbit 控制 ----
let isDragging = false
let prevMouse = { x: 0, y: 0 }
let rotY = 0.3
let rotX = -0.2
let zoom = 1.2

// ---- 灯光 / 场景常�? ----
const AMBIENT = 0x404060
const DIRECTIONAL = 0xffffff
const BG = 0x0d1b2a
const GRID = 0x1a3a5c
const JOINT_COLOR_HEX = 0x5fa8d3
const ALERT_COLOR = new THREE.Color(0xd32f2f)

// ============================================================
// 关节分组：俯仰/侧摆/偏航 归为一个身体部位
// ============================================================

function getJointBaseName(urdfName: string): string {
  // "left_shoulder_pitch_joint" → "left_shoulder"
  return urdfName.replace(/_joint$/, '').replace(/_(pitch|roll|yaw)$/, '')
}

function getAxisLabel(urdfName: string): string {
  const m = urdfName.match(/_(pitch|roll|yaw)_joint$/)
  if (!m) return ''
  return { pitch: '俯仰', roll: '侧摆', yaw: '偏航' }[m[1]] || ''
}

function getBaseDisplayName(displayName: string): string {
  return displayName.replace(/(俯仰|侧摆|偏航)$/, '')
}

interface AxisInfo {
  urdfName: string
  displayName: string
  axisLabel: string
  motorIndex: number
}

interface JointGroup {
  marker: THREE.Mesh
  baseDisplayName: string
  axes: AxisInfo[]
}

/** baseName → JointGroup */
const jointGroups = new Map<string, JointGroup>()
/** raycaster 用，所有标记球 mesh 的平�?列表 */
const groupMarkers: THREE.Mesh[] = []
/** URDF 关节名 �? 当前温度 */
const currentTemps = new Map<string, number>()

// ---- 工具提示（单例） ----
let tooltipEl: HTMLDivElement | null = null

// ---- 超温持续标签 ----
interface AlertLabel {
  el: HTMLDivElement
  valueEl: HTMLSpanElement
}
const alertLabels = new Map<string, AlertLabel>()
let alertContainer: HTMLDivElement | null = null
const _projVec = new THREE.Vector3()

// ============================================================
// Raycaster
// ============================================================

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let hoveredBaseName: string | null = null

// ============================================================
// 初始�?
// ============================================================

onMounted(init)

function init(): void {
  const w = props.width || 420
  const h = props.height || 560

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  renderer.setClearColor(BG)
  containerRef.value?.appendChild(renderer.domElement)

  // 悬停工具提示
  tooltipEl = document.createElement('div')
  tooltipEl.className = 'joint-tooltip'
  tooltipEl.style.display = 'none'
  containerRef.value?.appendChild(tooltipEl)

  // 超温标签容器
  alertContainer = document.createElement('div')
  alertContainer.className = 'temp-labels-container'
  containerRef.value?.appendChild(alertContainer)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 20)
  camera.position.set(1.5, 0.8, 2.2)
  camera.lookAt(0, -0.3, 0)

  scene.add(new THREE.AmbientLight(AMBIENT, 1.5))
  const dl = new THREE.DirectionalLight(DIRECTIONAL, 2)
  dl.position.set(2, 3, 3)
  scene.add(dl)

  const grid = new THREE.GridHelper(2, 20, GRID, GRID)
  grid.position.y = -1.2
  scene.add(grid)

  loadRobot()

  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('wheel', onWheel)

  animate()
}

// ============================================================
// URDF 加载 + 关节分组
// ============================================================

function loadRobot(): void {
  const loader = new URDFLoader()
  loader.workingPath = '/'
  robot = loader.parse(urdfXml)
  robot.rotation.set(-Math.PI / 2, 0, -Math.PI / 2)

  // 按身体部位分组
  const tmp = new Map<string, { axes: AxisInfo[]; refJoint: any }>()

  for (let i = 0; i < G1_MOTOR_TO_URDF_JOINT.length; i++) {
    const urdfName = G1_MOTOR_TO_URDF_JOINT[i]
    const baseName = getJointBaseName(urdfName)
    const joint = (robot as any).joints?.[urdfName]
    if (!joint) continue

    if (!tmp.has(baseName)) tmp.set(baseName, { axes: [], refJoint: null })
    const g = tmp.get(baseName)!
    g.axes.push({
      urdfName,
      displayName: G1_MOTOR_DISPLAY_NAMES[i] ?? urdfName,
      axisLabel: getAxisLabel(urdfName),
      motorIndex: i,
    })
    if (!g.refJoint) g.refJoint = joint
  }

  // 每组创建一个标记球，挂在第一�?关节下（同位置，球不受旋转影响）
  for (const [baseName, g] of tmp) {
    if (!g.refJoint) continue
    const geo = new THREE.SphereGeometry(0.04, 12, 12)
    const mat = new THREE.MeshPhongMaterial({ color: JOINT_COLOR_HEX })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.userData.baseName = baseName
    g.refJoint.add(mesh)

    jointGroups.set(baseName, {
      marker: mesh,
      baseDisplayName: getBaseDisplayName(g.axes[0]?.displayName ?? baseName),
      axes: g.axes,
    })
    groupMarkers.push(mesh)
  }

  scene.add(robot)
}

// ============================================================
// 电机数据更新
// ============================================================

let debugOnce = true

watch(() => props.motorState, (motors) => {
  if (!motors || motors.length === 0 || !robot) return

  const threshold = props.alarmTemp ?? 70
  let found = 0
  let missing = 0
  const alertedBases = new Set<string>()

  for (let i = 0; i < Math.min(motors.length, G1_MOTOR_TO_URDF_JOINT.length); i++) {
    if (motors[i]?.mode !== 0 && motors[i]?.mode !== 1) continue
    const urdfName = G1_MOTOR_TO_URDF_JOINT[i]
    const temp = motors[i].temperature?.[0] ?? 0
    currentTemps.set(urdfName, temp)

    // 关节角�?
    const joint = (robot as any).joints?.[urdfName]
    if (joint?.setJointValue) {
      joint.setJointValue(calibrateJointValue(i, motors[i].q))
      found++
    } else {
      missing++
      if (debugOnce) console.warn('[3D] 关节未找到:', urdfName)
    }
  }

  // 按组处理超温
  for (const [baseName, group] of jointGroups) {
    let maxTemp = 0
    let anyAlert = false

    for (const axis of group.axes) {
      const temp = currentTemps.get(axis.urdfName)
      if (temp !== undefined && !isNaN(temp)) {
        maxTemp = Math.max(maxTemp, temp)
        if (temp > threshold) anyAlert = true
      }
    }

    // 标记球颜色
    const mat = group.marker.material as THREE.MeshPhongMaterial
    if (anyAlert) {
      alertedBases.add(baseName)
      mat.color.copy(ALERT_COLOR)
      mat.emissive.copy(ALERT_COLOR)
      mat.emissiveIntensity = 0.3

      // 创建/更新超温标签
      let label = alertLabels.get(baseName)
      if (!label) {
        const el = document.createElement('div')
        el.className = 'joint-temp-label alert'
        const nameEl = document.createElement('span')
        nameEl.className = 'jt-name'
        nameEl.textContent = group.baseDisplayName
        const valueEl = document.createElement('span')
        valueEl.className = 'jt-value'
        el.appendChild(nameEl)
        el.appendChild(valueEl)
        alertContainer?.appendChild(el)
        label = { el, valueEl }
        alertLabels.set(baseName, label)
      }
      label.valueEl.textContent = `${maxTemp.toFixed(1)}°`
    } else {
      mat.color.setHex(JOINT_COLOR_HEX)
      mat.emissive.set(0x000000)
      mat.emissiveIntensity = 0
    }
  }

  // 清理已降�?的超温标签
  for (const [name, label] of alertLabels) {
    if (!alertedBases.has(name)) {
      label.el.remove()
      alertLabels.delete(name)
    }
  }

  if (debugOnce) {
    console.log('[3D] 关节更新: 找到 ' + found + ', 未找到 ' + missing)
    console.log('[3D] 按 C 键采集当前姿态为基准，按 R 键清除校准')
    window.addEventListener('keydown', onKeyDown)
    debugOnce = false
  }
}, { deep: false })

// ============================================================
// 键盘
// ============================================================

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'c' || e.key === 'C') {
    if (props.motorState) captureBaseline(props.motorState)
  }
  if (e.key === 'r' || e.key === 'R') resetCalibration()
}

// ============================================================
// 鼠标 + Raycaster
// ============================================================

function onPointerDown(e: PointerEvent): void {
  isDragging = true
  prevMouse = { x: e.clientX, y: e.clientY }
}

function onPointerMove(e: PointerEvent): void {
  if (isDragging) {
    const dx = e.clientX - prevMouse.x
    const dy = e.clientY - prevMouse.y
    rotY += dx * 0.005
    rotX += dy * 0.005
    rotX = Math.max(-1.2, Math.min(1.2, rotX))
    prevMouse = { x: e.clientX, y: e.clientY }
    return
  }

  // ---- Raycaster ----
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(pointer, camera)
  const intersects = raycaster.intersectObjects(groupMarkers)

  if (intersects.length > 0) {
    const baseName = intersects[0].object.userData.baseName as string
    const group = jointGroups.get(baseName)
    if (group) {
      hoveredBaseName = baseName
      renderer.domElement.style.cursor = 'pointer'

      // 构建工具提示
      const parts = group.axes.map((a) => {
        const temp = currentTemps.get(a.urdfName)
        const val = temp !== undefined && !isNaN(temp) ? temp.toFixed(1) : '--'
        return a.axisLabel ? `${a.axisLabel} ${val}°` : `${val}°C`
      })
      if (tooltipEl) {
        tooltipEl.innerHTML = `<strong>${group.baseDisplayName}</strong><span class="tt-axes">${parts.join(' ')}</span>`
        tooltipEl.style.display = ''
        const cr = containerRef.value!.getBoundingClientRect()
        // 工具提示显示在鼠标右下方，不遮挡标记球
        tooltipEl.style.left = `${e.clientX - cr.left + 14}px`
        tooltipEl.style.top = `${e.clientY - cr.top - 10}px`
      }
      return
    }
  }

  // 未命中
  hoveredBaseName = null
  renderer.domElement.style.cursor = ''
  if (tooltipEl) tooltipEl.style.display = 'none'
}

function onPointerUp(): void {
  isDragging = false
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  zoom += e.deltaY * 0.001
  zoom = Math.max(0.4, Math.min(3, zoom))
}

// ============================================================
// 动画
// ============================================================

function animate(): void {
  animationId = requestAnimationFrame(animate)

  const dist = 2.8 * zoom
  camera.position.x = Math.sin(rotY) * Math.cos(rotX) * dist
  camera.position.y = Math.sin(rotX) * dist
  camera.position.z = Math.cos(rotY) * Math.cos(rotX) * dist
  camera.lookAt(0, -0.3, 0)

  // 超温标签 3D → 屏幕投影
  const w = renderer.domElement.width
  const h = renderer.domElement.height
  for (const [baseName, label] of alertLabels) {
    const group = jointGroups.get(baseName)
    if (!group || !group.marker.parent) {
      label.el.style.display = 'none'
      continue
    }
    // 从标记球父关节获取世界坐�?
    _projVec.set(0, 0, 0)
    group.marker.localToWorld(_projVec)
    _projVec.project(camera)
    if (_projVec.z > 1) {
      label.el.style.display = 'none'
      continue
    }
    label.el.style.display = ''
    const sx = (_projVec.x * 0.5 + 0.5) * w
    const sy = (-_projVec.y * 0.5 + 0.5) * h
    label.el.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy - 10}px)`
  }

  renderer.render(scene, camera)
}

// ============================================================
// 清理
// ============================================================

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  renderer?.dispose()
  tooltipEl?.remove()
  alertContainer?.remove()
  alertLabels.clear()
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div ref="containerRef" class="robot-3d-container">
    <TempLegend :alarm-temp="props.alarmTemp" />
  </div>
</template>

<style scoped>
.robot-3d-container {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #0d1b2a;
  display: inline-block;
  line-height: 0;
}
</style>

<style>
/* 悬停工具提示 */
.joint-tooltip {
  position: absolute;
  z-index: 10;
  background: rgba(0, 0, 0, 0.85);
  color: #ecf0f1;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  line-height: 1.5;
}
.joint-tooltip strong {
  margin-right: 6px;
  color: #90caf9;
}
.joint-tooltip .tt-axes {
  color: #b0bec5;
  font-size: 11px;
}

/* 超温标签 */
.temp-labels-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
  overflow: hidden;
}

.joint-temp-label {
  position: absolute;
  top: 0;
  left: 0;
  background: rgba(40, 10, 10, 0.85);
  color: #e74c3c;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  border: 1px solid #e74c3c;
  pointer-events: none;
  backdrop-filter: blur(2px);
}
.joint-temp-label .jt-name {
  margin-right: 4px;
}
.joint-temp-label .jt-value {
  font-weight: 700;
}
</style>
