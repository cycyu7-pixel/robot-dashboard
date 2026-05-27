/**
 * ============================================================
 * 温度 → 颜色映射
 * ============================================================
 *
 * 色阶：蓝(#1565C0) → 紫(#7B1FA2) → 橙(#FF8F00) → 红(#D32F2F) → 深红(#B71C1C)
 * 避开绿色调，正常温度显示冷→暖渐变，超过告警阈值变红 + 自发光
 */

import * as THREE from 'three'

/** 温度色阶范围参考 */
export const TEMP_COLOR_RANGE = {
  min: 0,    // 最低温度
  max: 80,   // 最高显示温度
} as const

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * 温度 → Three.js 颜色 + 自发光强度
 *
 * 色阶（基于 alarmTemp 动态）：
 *   0°C → alarmTemp×0.45 → alarmTemp×0.75 → alarmTemp → alarmTemp+15
 *   蓝  → 紫           → 橙           → 红       → 深红+发光
 *
 * @param temp      温度值（℃）
 * @param alarmTemp 告警阈值（℃），默认 70
 */
export function tempToColor(temp: number, alarmTemp = 70): {
  color: THREE.Color
  emissiveIntensity: number
} {
  const max = alarmTemp + 15
  const clamped = Math.max(0, Math.min(max, temp))

  const p45 = alarmTemp * 0.45   // 紫节点
  const p75 = alarmTemp * 0.75   // 橙节点

  let r: number, g: number, b: number

  if (clamped <= p45) {
    // 蓝 → 紫
    const t = clamped / Math.max(p45, 1)
    r = lerp(0.08, 0.48, t)  // #1565C0 → #7B1FA2
    g = lerp(0.17, 0.12, t)
    b = lerp(0.75, 0.64, t)
  } else if (clamped <= p75) {
    // 紫 → 橙
    const t = (clamped - p45) / Math.max(p75 - p45, 1)
    r = lerp(0.48, 1.00, t)  // #7B1FA2 → #FF8F00
    g = lerp(0.12, 0.56, t)
    b = lerp(0.64, 0.00, t)
  } else if (clamped <= alarmTemp) {
    // 橙 → 红（接近阈值开始转红）
    const t = (clamped - p75) / Math.max(alarmTemp - p75, 1)
    r = lerp(1.00, 0.82, t)  // #FF8F00 → #D32F2F
    g = lerp(0.56, 0.18, t)
    b = lerp(0.00, 0.18, t)
  } else {
    // 红 → 深红（过热区间，自发光增强）
    const t = (clamped - alarmTemp) / Math.max(max - alarmTemp, 1)
    r = lerp(0.82, 0.72, t)  // #D32F2F → #B71C1C
    g = lerp(0.18, 0.07, t)
    b = lerp(0.18, 0.11, t)
  }

  // 超过告警阈值后 emissive 渐增
  const emissiveIntensity = clamped >= alarmTemp
    ? ((clamped - alarmTemp) / Math.max(max - alarmTemp, 1)) * 0.6
    : 0

  return { color: new THREE.Color(r, g, b), emissiveIntensity }
}

/**
 * 生成 CSS linear-gradient 字符串（给温度图例色带用）
 * 从上到下（高温→低温）：深红 → 红 → 橙 → 紫 → 蓝（匹配 tempToColor 色阶）
 *
 * @param alarmTemp 告警阈值（℃），默认 70
 */
export function tempGradientCSS(alarmTemp = 70): string {
  const maxTemp = alarmTemp + 15
  const p45 = alarmTemp * 0.45
  const p75 = alarmTemp * 0.75
  // 温度 → 在渐变中的百分比位置（上 0% = 高温，下 100% = 低温）
  const pos = (t: number) => ((1 - t / maxTemp) * 100).toFixed(0)
  return `linear-gradient(to bottom, #B71C1C 0%, #D32F2F ${pos(alarmTemp)}%, #FF8F00 ${pos(p75)}%, #7B1FA2 ${pos(p45)}%, #1565C0 100%)`
}
