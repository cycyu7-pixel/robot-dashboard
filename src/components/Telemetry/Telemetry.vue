<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { MotorState, RobotProfile } from '@/models'
import ChartCard from '@/components/Widgets/ChartCard.vue'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{
  profile: RobotProfile
  motorState?: MotorState[]
}>()

const MAX_POINTS = 60

function motorIdx(jointName: string): number {
  return props.profile.motorJoints.indexOf(jointName)
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
  // 阈值 0.9s 略小于读取间隔（1s），防止消息间隔轻微漂移时跳点
  if (t - lastSampleTime < 0.9) return
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
    <ChartCard title="下肢关节角度">
      <VChart class="chart" :option="angleOption" autoresize />
    </ChartCard>

    <!-- 2. 关节力矩 -->
    <ChartCard title="关节力矩">
      <VChart class="chart" :option="torqueOption" autoresize />
    </ChartCard>

    <!-- 3. 电机电压 -->
    <ChartCard title="电机电压">
      <VChart class="chart" :option="voltOption" autoresize />
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
</style>
