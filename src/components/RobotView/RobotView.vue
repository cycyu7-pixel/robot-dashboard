/**
 * ============================================================
 * RobotView.vue —— 宇树 G1 2D 机器人可视化（Canvas）
 * ============================================================
 *
 * 正面视角（机械风格）：
 *
 *          ┌───┐          ← 头（圆角矩形）
 *          └─┬─┘
 *       ┌────┴────┐       ← 肩膀
 *      ╭┥         ┝╮
 *      │ 上臂   上臂 │     ← 胶囊形肢体
 *      ╰┥         ┝╯
 *      ╭┥ 前臂   前臂 │
 *      ╰┥         ┝╯
 *       │  ┌───┐  │       ← 躯干（实心圆角矩形）
 *       │  │   │  │
 *       └──┴───┴──┘       ← 髋部
 *      ╭┥         ┝╮
 *      │ 大腿   大腿 │
 *      ╰┥         ┝╯
 *      ╭┥ 小腿   小腿 │
 *      ╰┥         ┝╯
 *       └──┘     └──┘     ← 脚掌
 *
 * 用法：
 *   <RobotView :joint-angles="angles" />
 */
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { G1_JOINT_MAPPING } from '@/models'

// ============================================================
// 1. Props
// ============================================================

const props = withDefaults(
  defineProps<{
    /** 关节角度 { ROS关节名: 弧度值 } */
    jointAngles?: Record<string, number>
    width?: number
    height?: number
  }>(),
  {
    jointAngles: () => ({}),
    width: 420,
    height: 580,
  },
)

// ============================================================
// 2. 外观参数（改颜色/尺寸在这改）
// ============================================================

// --- 颜色 ---
const BG_COLOR = '#0d1b2a'           // 背景
const TORSO_FILL = '#1b4965'         // 躯干填充
const TORSO_STROKE = '#5fa8d3'       // 躯干边框
const LIMB_FILL = '#1b4965'          // 肢体填充
const LIMB_STROKE = '#5fa8d3'        // 肢体边框
const HEAD_FILL = '#1b4965'          // 头部填充
const HEAD_STROKE = '#5fa8d3'        // 头部边框
const JOINT_FILL = '#0d1b2a'         // 关节内圈填充
const JOINT_STROKE = '#bee9e8'       // 关节外圈
const JOINT_INNER = '#5fa8d3'        // 关节内圈小点
const FOOT_FILL = '#1b4965'          // 脚掌填充
const FOOT_STROKE = '#5fa8d3'        // 脚掌边框
const GROUND_COLOR = '#34495e'       // 地面
const LABEL_COLOR = '#bee9e8'        // 标签

// --- 尺寸 ---
const LINE_W = 1.5                   // 边框线宽
const TORSO_W = 56                   // 躯干宽度
const TORSO_H = 100                  // 躯干高度
const TORSO_R = 10                   // 躯干圆角
const HEAD_W = 32                    // 头部宽度
const HEAD_H = 28                    // 头部高度
const HEAD_R = 8                     // 头部圆角
const LIMB_W = 14                    // 肢体宽度（胶囊形）
const UPPER_ARM = 58                 // 上臂长度
const LOWER_ARM = 50                 // 前臂长度
const UPPER_LEG = 75                 // 大腿长度
const LOWER_LEG = 72                 // 小腿长度
const JOINT_R = 7                    // 关节外圈半径
const JOINT_INNER_R = 3             // 关节内圈半径
const FOOT_W = 22                    // 脚掌宽度
const FOOT_H = 10                    // 脚掌高度
const SHOULDER_GAP = 38              // 肩关节到中线距离
const HIP_GAP = 24                   // 髋关节到中线距离
const HAND_R = 6                     // 手部半径
const NECK_H = 10                    // 脖子长度

// ============================================================
// 3. Canvas
// ============================================================

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null

/**
 * 当前各 Group 的角度（弧度）
 *
 * 角度约定（Canvas 坐标系，Y 轴向下）：
 *   0 = 水平向右
 *   π/2 = 垂直向下
 *   -π/2 = 垂直向上
 */
const ga: Record<string, number> = {
  head: 0,
  left_upper_arm: 0.15,
  right_upper_arm: -0.15,
  left_lower_arm: 0,
  right_lower_arm: 0,
  left_upper_leg: 0,
  right_upper_leg: 0,
  left_lower_leg: 0,
  right_lower_leg: 0,
}

// ============================================================
// 5. 坐标计算
// ============================================================

interface Pt { x: number; y: number }

/** 计算线段终点 */
function endPt(from: Pt, angle: number, parentDir: number, len: number): Pt {
  const a = parentDir + angle
  return {
    x: from.x + Math.cos(a) * len,
    y: from.y + Math.sin(a) * len,
  }
}

const DOWN = Math.PI / 2

function compute(): Record<string, Pt> {
  const cx = props.width / 2
  const headCY = 50
  const neckY = headCY + HEAD_H / 2 + NECK_H   // 脖子底端 = 肩膀线
  const hipY = neckY + TORSO_H                   // 髋部线

  // 头部中心
  const headCenter: Pt = { x: cx, y: headCY }
  // 脖子底端（头可倾斜）
  const neck: Pt = endPt(headCenter, ga.head, DOWN, HEAD_H / 2 + NECK_H)

  // 左臂
  const shL: Pt = { x: neck.x - SHOULDER_GAP, y: neckY }
  const elL = endPt(shL, ga.left_upper_arm, DOWN, UPPER_ARM)
  const wrL = endPt(elL, ga.left_lower_arm, DOWN + ga.left_upper_arm, LOWER_ARM)

  // 右臂
  const shR: Pt = { x: neck.x + SHOULDER_GAP, y: neckY }
  const elR = endPt(shR, ga.right_upper_arm, DOWN, UPPER_ARM)
  const wrR = endPt(elR, ga.right_lower_arm, DOWN + ga.right_upper_arm, LOWER_ARM)

  // 左腿
  const hipL: Pt = { x: cx - HIP_GAP, y: hipY }
  const knL = endPt(hipL, ga.left_upper_leg, DOWN, UPPER_LEG)
  const anL = endPt(knL, ga.left_lower_leg, DOWN + ga.left_upper_leg, LOWER_LEG)

  // 右腿
  const hipR: Pt = { x: cx + HIP_GAP, y: hipY }
  const knR = endPt(hipR, ga.right_upper_leg, DOWN, UPPER_LEG)
  const anR = endPt(knR, ga.right_lower_leg, DOWN + ga.right_upper_leg, LOWER_LEG)

  return { neck, headCenter, shL, elL, wrL, shR, elR, wrR, hipL, knL, anL, hipR, knR, anR }
}

// ============================================================
// 6. 绘制
// ============================================================

function draw(): void {
  if (!ctx) return
  const { width, height } = props
  const p = compute()
  const cx = p.neck.x

  // 清屏
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, width, height)

  // 地面
  ctx.strokeStyle = GROUND_COLOR
  ctx.lineWidth = 1
  const floorY = p.anL.y + FOOT_H + 10
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(40, floorY)
  ctx.lineTo(width - 40, floorY)
  ctx.stroke()
  ctx.setLineDash([])

  // --- 躯干（实心圆角矩形） ---
  const torsoX = cx - TORSO_W / 2
  const torsoY = p.neck.y
  roundRect(torsoX, torsoY, TORSO_W, TORSO_H, TORSO_R, TORSO_FILL, TORSO_STROKE, LINE_W)

  // 躯干中线装饰
  ctx.strokeStyle = TORSO_STROKE
  ctx.lineWidth = 0.8
  ctx.globalAlpha = 0.4
  ctx.beginPath()
  ctx.moveTo(cx, torsoY + 15)
  ctx.lineTo(cx, torsoY + TORSO_H - 15)
  ctx.stroke()
  ctx.globalAlpha = 1

  // 肩膀横线装饰
  ctx.strokeStyle = TORSO_STROKE
  ctx.lineWidth = LINE_W
  ctx.beginPath()
  ctx.moveTo(p.shL.x, p.neck.y)
  ctx.lineTo(p.shR.x, p.neck.y)
  ctx.stroke()

  // 髋部横线装饰
  ctx.beginPath()
  ctx.moveTo(p.hipL.x, p.hipL.y)
  ctx.lineTo(p.hipR.x, p.hipR.y)
  ctx.stroke()

  // --- 脖子 ---
  const headBottom = { x: p.headCenter.x, y: p.headCenter.y + HEAD_H / 2 }
  limb(headBottom, p.neck, LIMB_W * 0.7, LIMB_FILL, LIMB_STROKE, LINE_W)

  // --- 头部（圆角矩形） ---
  const hx = p.headCenter.x - HEAD_W / 2
  const hy = p.headCenter.y - HEAD_H / 2
  roundRect(hx, hy, HEAD_W, HEAD_H, HEAD_R, HEAD_FILL, HEAD_STROKE, LINE_W)

  // 头部"眼睛"装饰
  ctx.fillStyle = JOINT_INNER
  ctx.beginPath()
  ctx.arc(p.headCenter.x - 6, p.headCenter.y - 2, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(p.headCenter.x + 6, p.headCenter.y - 2, 2.5, 0, Math.PI * 2)
  ctx.fill()

  // --- 四肢（胶囊形） ---
  // 左臂
  limb(p.shL, p.elL, LIMB_W, LIMB_FILL, LIMB_STROKE, LINE_W)
  limb(p.elL, p.wrL, LIMB_W, LIMB_FILL, LIMB_STROKE, LINE_W)
  // 右臂
  limb(p.shR, p.elR, LIMB_W, LIMB_FILL, LIMB_STROKE, LINE_W)
  limb(p.elR, p.wrR, LIMB_W, LIMB_FILL, LIMB_STROKE, LINE_W)
  // 左腿
  limb(p.hipL, p.knL, LIMB_W, LIMB_FILL, LIMB_STROKE, LINE_W)
  limb(p.knL, p.anL, LIMB_W, LIMB_FILL, LIMB_STROKE, LINE_W)
  // 右腿
  limb(p.hipR, p.knR, LIMB_W, LIMB_FILL, LIMB_STROKE, LINE_W)
  limb(p.knR, p.anR, LIMB_W, LIMB_FILL, LIMB_STROKE, LINE_W)

  // --- 手部 ---
  circleShape(p.wrL.x, p.wrL.y, HAND_R, LIMB_FILL, LIMB_STROKE, LINE_W)
  circleShape(p.wrR.x, p.wrR.y, HAND_R, LIMB_FILL, LIMB_STROKE, LINE_W)

  // --- 脚掌 ---
  foot(p.anL, FOOT_W, FOOT_H, FOOT_FILL, FOOT_STROKE, LINE_W)
  foot(p.anR, FOOT_W, FOOT_H, FOOT_FILL, FOOT_STROKE, LINE_W)

  // --- 关节（舵机样式：外圈 + 内圈 + 中心点） ---
  const joints: Pt[] = [
    p.shL, p.elL, p.shR, p.elR,
    p.hipL, p.knL, p.hipR, p.knR,
  ]
  joints.forEach((d) => servoJoint(d))

  // --- 标签 ---
  drawLabels(p)

  // --- 提示 ---
  if (Object.keys(props.jointAngles ?? {}).length === 0) {
    ctx.fillStyle = LABEL_COLOR
    ctx.font = '13px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('等待关节数据...', width / 2, height - 24)
  } else {
    ctx.fillStyle = '#7f8c8d'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('骨骼为默认站姿，标签显示实时角度', width / 2, height - 24)
  }
}

// ============================================================
// 绘图工具函数
// ============================================================

/** 圆角矩形 */
function roundRect(
  x: number, y: number, w: number, h: number, r: number,
  fill: string, stroke: string, lineW: number,
) {
  if (!ctx) return
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineW
  ctx.stroke()
}

/** 胶囊形肢体：从 a 到 b，宽度 w */
function limb(a: Pt, b: Pt, w: number, fill: string, stroke: string, lineW: number) {
  if (!ctx) return
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return
  const r = w / 2
  // 角度
  const angle = Math.atan2(dy, dx)

  ctx.save()
  ctx.translate(a.x, a.y)
  ctx.rotate(angle)

  // 胶囊 = 矩形 + 两端半圆
  ctx.beginPath()
  ctx.arc(r, 0, r, Math.PI / 2, -Math.PI / 2)       // 左端半圆
  ctx.arc(len - r, 0, r, -Math.PI / 2, Math.PI / 2)  // 右端半圆
  ctx.closePath()

  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineW
  ctx.stroke()

  ctx.restore()
}

/** 舵机风格关节：外圈 + 内圈 + 中心点 */
function servoJoint(p: Pt) {
  if (!ctx) return
  // 外圈
  ctx.beginPath()
  ctx.arc(p.x, p.y, JOINT_R, 0, Math.PI * 2)
  ctx.fillStyle = JOINT_FILL
  ctx.fill()
  ctx.strokeStyle = JOINT_STROKE
  ctx.lineWidth = 1.5
  ctx.stroke()

  // 内圈
  ctx.beginPath()
  ctx.arc(p.x, p.y, JOINT_INNER_R, 0, Math.PI * 2)
  ctx.fillStyle = JOINT_INNER
  ctx.fill()
}

/** 圆形（填充+边框） */
function circleShape(cx: number, cy: number, r: number, fill: string, stroke: string, lineW: number) {
  if (!ctx) return
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineW
  ctx.stroke()
}

/** 脚掌（小圆角矩形，居中于踝关节下方） */
function foot(ankle: Pt, w: number, h: number, fill: string, stroke: string, lineW: number) {
  const fx = ankle.x - w / 2
  const fy = ankle.y
  roundRect(fx, fy, w, h, 4, fill, stroke, lineW)
}

/** 标签：在关节旁标注角度 */
function drawLabels(p: Record<string, Pt>) {
  if (!ctx) return
  const angles = props.jointAngles ?? {}
  ctx.fillStyle = LABEL_COLOR
  ctx.font = '11px monospace'
  ctx.textAlign = 'left'

  for (const m of G1_JOINT_MAPPING) {
    const rad = angles[m.jointName]
    if (rad === undefined) continue
    const deg = (rad * (180 / Math.PI)).toFixed(0)
    const pos = groupPt(m.group, p)
    if (pos) ctx.fillText(`${m.displayName}: ${deg}°`, pos.x + 12, pos.y - 4)
  }
}

function groupPt(group: string, p: Record<string, Pt>): Pt | null {
  const map: Record<string, Pt> = {
    head: p.headCenter,
    left_upper_arm: p.shL,
    left_lower_arm: p.elL,
    right_upper_arm: p.shR,
    right_lower_arm: p.elR,
    left_upper_leg: p.hipL,
    left_lower_leg: p.knL,
    right_upper_leg: p.hipR,
    right_lower_leg: p.knR,
  }
  return map[group] ?? null
}

// ============================================================
// 7. 静态骨骼 + 动态标签
// ============================================================

// 骨架保持默认站姿不动，只重绘角度标签
watch(() => props.jointAngles, (a) => {
  if (a && Object.keys(a).length > 0) draw()
}, { deep: true })

// ============================================================
// 8. 生命周期
// ============================================================

onMounted(() => {
  if (canvasRef.value) { ctx = canvasRef.value.getContext('2d'); draw() }
})

onBeforeUnmount(() => { ctx = null })
</script>

<template>
  <div class="robot-view-container">
    <canvas ref="canvasRef" :width="width" :height="height" />
  </div>
</template>

<style scoped>
.robot-view-container {
  display: inline-block;
  border-radius: 8px;
  overflow: hidden;
  background: #0d1b2a;
}
canvas { display: block; }
</style>
