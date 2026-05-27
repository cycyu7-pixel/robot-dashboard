<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { MotorState } from '@/models'
import { G1_MOTOR_JOINTS, G1_MOTOR_DISPLAY_NAMES } from '@/models'
import ChartCard from '@/components/Widgets/ChartCard.vue'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{
  motorState?: MotorState[]
}>()

const MAX_POINTS = 60

function motorIdx(jointName: string): number {
  return G1_MOTOR_JOINTS.indexOf(jointName)
}

// ============================================================
// 历史数据
// ============================================================

interface AnglePoint { time: number; left_hip: number; right_hip: number; left_knee: number; right_knee: number }
interface TorquePoint { time: number; left_hip: number; right_hip: number; left_knee: number; right_knee: number }
interface VoltPoint { time: number; min: number; max: number; avg: number }

const angleHistory = ref<AnglePoint[]>([])
const torqueHistory = ref<TorquePoint[]>([])
const voltHistory = ref<VoltPoint[]>([])

function now(): number { return Date.now() / 1000 }

function push<T>(arr: { value: T[] }, item: T): void {
  arr.value.push(item)
  if (arr.value.length > MAX_POINTS) arr.value.shift()
}

// ============================================================
// 1 秒节流采样
// ============================================================

let lastSampleTime = 0

watch(() => props.motorState, (motors) => {
  if (!motors || motors.length === 0) return
  const t = now()
  if (t - lastSampleTime < 1) return
  lastSampleTime = t

  // 关节角度
  push(angleHistory, {
    time: t,
    left_hip: motors[motorIdx('left_hip_pitch')]?.q ?? 0,
    right_hip: motors[motorIdx('right_hip_pitch')]?.q ?? 0,
    left_knee: motors[motorIdx('left_knee')]?.q ?? 0,
    right_knee: motors[motorIdx('right_knee')]?.q ?? 0,
  })

  // 力矩
  push(torqueHistory, {
    time: t,
    left_hip: motors[motorIdx('left_hip_pitch')]?.tau_est ?? 0,
    right_hip: motors[motorIdx('right_hip_pitch')]?.tau_est ?? 0,
    left_knee: motors[motorIdx('left_knee')]?.tau_est ?? 0,
    right_knee: motors[motorIdx('right_knee')]?.tau_est ?? 0,
  })

  // 电压
  const vols = motors.filter(m => m.mode === 0 || m.mode === 1).map(m => m.vol ?? 0)
  push(voltHistory, {
    time: t,
    min: vols.length ? Math.min(...vols) : 0,
    max: vols.length ? Math.max(...vols) : 0,
    avg: vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0,
  })
})

// ============================================================
// 调试面板：显示每个电机的 index + 名称 + 实时 q 值 + 变化量
// ============================================================

/** 上一次 q 值，用于检测变化 */
const prevQ = ref<number[]>([])
/** 高亮保持计时器 */
const highlightUntil = ref<number[]>([])

const rawMotorDebug = computed(() => {
  const motors = props.motorState
  if (!motors || motors.length === 0) return []
  const now = Date.now()
  const items: { name: string; q: number; delta: number; changed: boolean }[] = []
  for (let i = 0; i < Math.min(motors.length, G1_MOTOR_JOINTS.length); i++) {
    const q = motors[i]?.q ?? 0
    const prev = prevQ.value[i]
    // q 值变化超过 0.001 rad 算有变化
    const delta = prevQ.value.length > 0 ? q - (prev ?? 0) : 0
    const moving = Math.abs(delta) > 0.001
    // 高亮保持 1.5 秒，方便看清
    const highlightActive = (highlightUntil.value[i] ?? 0) > now
    items.push({
      name: G1_MOTOR_DISPLAY_NAMES[i] ?? G1_MOTOR_JOINTS[i],
      q,
      delta,
      changed: moving || highlightActive,
    })
    // 更新高亮到期时间
    if (moving && !highlightActive) {
      highlightUntil.value[i] = now + 1500
    }
  }
  // 更新上一次 q 值快照
  prevQ.value = items.map(it => it.q)
  return items
})

// ============================================================
// X 轴时间格式化
// ============================================================

function fmtTime(t: number): string {
  const d = new Date(t * 1000)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

// ============================================================
// ECharts 配置
// ============================================================

const darkGrid = { left: '10%', right: '6%', bottom: '12%', top: '10%' }

const angleOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['左髋', '右髋', '左膝', '右膝'], textStyle: { color: '#ccc' }, top: 0 },
  grid: darkGrid,
  xAxis: { type: 'category' as const, data: angleHistory.value.map(p => fmtTime(p.time)), axisLabel: { color: '#aaa', fontSize: 10 } },
  yAxis: { type: 'value' as const, name: 'rad', axisLabel: { color: '#aaa' } },
  series: [
    { name: '左髋', type: 'line', data: angleHistory.value.map(p => +p.left_hip.toFixed(4)), smooth: true, lineStyle: { color: '#3498db', width: 1.5 }, itemStyle: { color: '#3498db' }, symbol: 'none' },
    { name: '右髋', type: 'line', data: angleHistory.value.map(p => +p.right_hip.toFixed(4)), smooth: true, lineStyle: { color: '#e74c3c', width: 1.5 }, itemStyle: { color: '#e74c3c' }, symbol: 'none' },
    { name: '左膝', type: 'line', data: angleHistory.value.map(p => +p.left_knee.toFixed(4)), smooth: true, lineStyle: { color: '#2ecc71', width: 1.5 }, itemStyle: { color: '#2ecc71' }, symbol: 'none' },
    { name: '右膝', type: 'line', data: angleHistory.value.map(p => +p.right_knee.toFixed(4)), smooth: true, lineStyle: { color: '#f39c12', width: 1.5 }, itemStyle: { color: '#f39c12' }, symbol: 'none' },
  ],
}))

const torqueOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['左髋力矩', '右髋力矩', '左膝力矩', '右膝力矩'], textStyle: { color: '#ccc' }, top: 0 },
  grid: darkGrid,
  xAxis: { type: 'category' as const, data: torqueHistory.value.map(p => fmtTime(p.time)), axisLabel: { color: '#aaa', fontSize: 10 } },
  yAxis: { type: 'value' as const, name: 'Nm', axisLabel: { color: '#aaa' } },
  series: [
    { name: '左髋力矩', type: 'line', data: torqueHistory.value.map(p => +p.left_hip.toFixed(4)), smooth: true, lineStyle: { color: '#3498db', width: 1.5 }, symbol: 'none' },
    { name: '右髋力矩', type: 'line', data: torqueHistory.value.map(p => +p.right_hip.toFixed(4)), smooth: true, lineStyle: { color: '#e74c3c', width: 1.5 }, symbol: 'none' },
    { name: '左膝力矩', type: 'line', data: torqueHistory.value.map(p => +p.left_knee.toFixed(4)), smooth: true, lineStyle: { color: '#2ecc71', width: 1.5 }, symbol: 'none' },
    { name: '右膝力矩', type: 'line', data: torqueHistory.value.map(p => +p.right_knee.toFixed(4)), smooth: true, lineStyle: { color: '#f39c12', width: 1.5 }, symbol: 'none' },
  ],
}))

const voltOption = computed(() => ({
  tooltip: { trigger: 'axis' as const, formatter: (p: any[]) => p.map(i => `${i.seriesName}: ${i.value}V`).join('<br/>') },
  legend: { data: ['最低', '最高', '平均'], textStyle: { color: '#ccc' }, top: 0 },
  grid: darkGrid,
  xAxis: { type: 'category' as const, data: voltHistory.value.map(p => fmtTime(p.time)), axisLabel: { color: '#aaa', fontSize: 10 } },
  yAxis: { type: 'value' as const, name: 'V', axisLabel: { color: '#aaa' } },
  series: [
    { name: '最低', type: 'line', data: voltHistory.value.map(p => +p.min.toFixed(2)), smooth: true, lineStyle: { color: '#e74c3c', width: 1.5 }, symbol: 'none' },
    { name: '最高', type: 'line', data: voltHistory.value.map(p => +p.max.toFixed(2)), smooth: true, lineStyle: { color: '#2ecc71', width: 1.5 }, symbol: 'none' },
    { name: '平均', type: 'line', data: voltHistory.value.map(p => +p.avg.toFixed(2)), smooth: true, lineStyle: { color: '#3498db', width: 1.5 }, symbol: 'none' },
  ],
}))
</script>

<template>
  <div class="telemetry-grid">
    <!-- 1. 下肢关节角度 -->
    <ChartCard title="下肢关节角度" icon="🦿">
      <VChart class="chart" :option="angleOption" autoresize />
    </ChartCard>

    <!-- 2. 关节力矩 -->
    <ChartCard title="关节力矩" icon="💪">
      <VChart class="chart" :option="torqueOption" autoresize />
    </ChartCard>

    <!-- 3. 电机电压 -->
    <ChartCard title="电机电压" icon="⚡">
      <VChart class="chart" :option="voltOption" autoresize />
    </ChartCard>

    <!-- 4. 调试面板：原始电机 q 值（用于验证关节映射） -->
    <ChartCard title="调试面板 - 电机原始 q 值" icon="🔧">
      <p class="debug-hint">手推机器人一个关节，观察哪个 index 的 q 值变化。绿色高亮 = 正在变化，括号内为变化量</p>
      <div class="debug-grid">
        <div
          v-for="(m, i) in rawMotorDebug"
          :key="i"
          class="debug-item"
          :class="{ changed: m.changed }"
        >
          <span class="debug-idx">[{{ i }}] {{ m.name }}</span>
          <span class="debug-q">
            {{ m.q.toFixed(4) }}
            <span v-if="m.changed" class="debug-delta">({{ m.delta >= 0 ? '+' : '' }}{{ m.delta.toFixed(4) }})</span>
          </span>
        </div>
        <div v-if="rawMotorDebug.length === 0" class="temp-empty">
          等待数据...
        </div>
      </div>
    </ChartCard>
  </div>
</template>

<style scoped>
.telemetry-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chart {
  width: 100%;
  height: 100%;
  min-height: 260px;
}

/* ---- 调试面板 ---- */
.debug-hint {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #7f8c8d;
  line-height: 1.5;
}

.debug-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 360px;
  overflow-y: auto;
}

.debug-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #111a28;
  border: 1px solid #1e3048;
  border-radius: 4px;
  padding: 3px 6px;
  min-width: 90px;
  transition: background 0.15s, border-color 0.15s;
}

.debug-item.changed {
  background: #1a2a1a;
  border-color: #2ecc71;
  box-shadow: 0 0 6px rgba(46, 204, 113, 0.4);
}

.debug-idx {
  font-size: 10px;
  color: #555;
}

.debug-name {
  font-size: 10px;
  color: #7f8c8d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 85px;
}

.debug-q {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.debug-item.changed .debug-q {
  color: #2ecc71;
}

.debug-delta {
  font-size: 11px;
  color: #2ecc71;
  margin-left: 2px;
}
</style>
