<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import URDFLoader from 'urdf-loader'
import type { MotorState } from '@/models'
import { G1_MOTOR_TO_URDF_JOINT, calibrateJointValue, captureBaseline, resetCalibration } from '@/models'
import urdfXml from '@/urdf/g1_29dof_rev_1_0_with_inspire_hand_FTP.urdf?raw'

const props = defineProps<{
  motorState?: MotorState[]
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
let rotY = 0.3   // 水平旋转
let rotX = -0.2  // 垂直旋转
let zoom = 1.2

// ---- 灯光 / 场景 ----
const AMBIENT = 0x404060
const DIRECTIONAL = 0xffffff
const BG = 0x0d1b2a
const GRID = 0x1a3a5c
const JOINT_COLOR = 0x5fa8d3

onMounted(init)

function init(): void {
  const w = props.width || 420
  const h = props.height || 560

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  renderer.setClearColor(BG)
  containerRef.value?.appendChild(renderer.domElement)

  // Scene
  scene = new THREE.Scene()

  // Camera
  camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 20)
  camera.position.set(1.5, 0.8, 2.2)
  camera.lookAt(0, -0.3, 0)

  // Lights
  scene.add(new THREE.AmbientLight(AMBIENT, 1.5))
  const dl = new THREE.DirectionalLight(DIRECTIONAL, 2)
  dl.position.set(2, 3, 3)
  scene.add(dl)

  // Ground grid
  const grid = new THREE.GridHelper(2, 20, GRID, GRID)
  grid.position.y = -1.2
  scene.add(grid)

  // Load URDF
  loadRobot()

  // Events
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('wheel', onWheel)

  // Loop
  animate()
}

// ============================================================
// URDF 加载 + 骨架可视化
// ============================================================

function loadRobot(): void {
  const loader = new URDFLoader()
  // mesh 路径 meshes/xxx.STL → /meshes/xxx.STL → public/meshes/xxx.STL
  loader.workingPath = '/'
  robot = loader.parse(urdfXml)

  // ROS Z-up → Three.js Y-up，再绕 Z 轴顺时针转 90°
  robot.rotation.set(-Math.PI / 2, 0, -Math.PI / 2)

  // 活动关节加标记球
  robot.traverse((node: any) => {
    if (node.isURDFJoint && node.jointType !== 'fixed') {
      addJointMarker(node)
    }
  })

  scene.add(robot)
}

/** 给活动关节加一个明显的小球 */
function addJointMarker(joint: any): void {
  const geo = new THREE.SphereGeometry(0.025, 12, 12)
  const mat = new THREE.MeshPhongMaterial({ color: JOINT_COLOR, emissive: 0x102030 })
  const sphere = new THREE.Mesh(geo, mat)
  joint.add(sphere)
}

// ============================================================
// 关节更新
// ============================================================

let debugOnce = true

watch(() => props.motorState, (motors) => {
  if (!motors || motors.length === 0 || !robot) return
  let found = 0
  let missing = 0
  for (let i = 0; i < Math.min(motors.length, G1_MOTOR_TO_URDF_JOINT.length); i++) {
    if (motors[i]?.mode !== 0 && motors[i]?.mode !== 1) continue
    const jointName = G1_MOTOR_TO_URDF_JOINT[i]
    const joint = (robot as any).joints?.[jointName]
    if (joint && joint.setJointValue) {
      joint.setJointValue(calibrateJointValue(i, motors[i].q))
      found++
    } else {
      missing++
      if (debugOnce) console.warn('[3D] 关节未找到:', jointName)
    }
  }
  if (debugOnce) {
    console.log('[3D] 关节更新: 找到 ' + found + ', 未找到 ' + missing)
    console.log('[3D] 按 C 键采集当前姿态为基准，按 R 键清除校准')
    window.addEventListener('keydown', onKeyDown)
    debugOnce = false
  }
}, { deep: false })

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'c' || e.key === 'C') {
    if (props.motorState) captureBaseline(props.motorState)
  }
  if (e.key === 'r' || e.key === 'R') {
    resetCalibration()
  }
}

// ============================================================
// 鼠标交互
// ============================================================

function onPointerDown(e: PointerEvent): void {
  isDragging = true
  prevMouse = { x: e.clientX, y: e.clientY }
}

function onPointerMove(e: PointerEvent): void {
  if (!isDragging) return
  const dx = e.clientX - prevMouse.x
  const dy = e.clientY - prevMouse.y
  rotY += dx * 0.005
  rotX += dy * 0.005
  rotX = Math.max(-1.2, Math.min(1.2, rotX))
  prevMouse = { x: e.clientX, y: e.clientY }
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
// 动画循环
// ============================================================

function animate(): void {
  animationId = requestAnimationFrame(animate)

  // 相机轨道
  const dist = 2.8 * zoom
  camera.position.x = Math.sin(rotY) * Math.cos(rotX) * dist
  camera.position.y = Math.sin(rotX) * dist
  camera.position.z = Math.cos(rotY) * Math.cos(rotX) * dist
  camera.lookAt(0, -0.3, 0)

  renderer.render(scene, camera)
}

// ============================================================
// 清理
// ============================================================

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  renderer?.dispose()
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div ref="containerRef" class="robot-3d-container" />
</template>

<style scoped>
.robot-3d-container {
  border-radius: 8px;
  overflow: hidden;
  background: #0d1b2a;
  display: inline-block;
  line-height: 0;
}
</style>
