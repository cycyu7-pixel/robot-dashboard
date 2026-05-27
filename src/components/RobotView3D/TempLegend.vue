/**
 * ============================================================
 * TempLegend —— 温度色带图例
 * ============================================================
 *
 * 叠加在 3D 视图右侧，显示温度→颜色的对应关系
 * 包含色带、温度刻度、告警阈值虚线
 */

<script setup lang="ts">
import { computed } from 'vue'
import { tempGradientCSS } from '@/utils/tempColor'

const props = withDefaults(defineProps<{
  alarmTemp?: number
}>(), {
  alarmTemp: 70,
})

interface TempStop {
  temp: number
  label: string
  isAlarm: boolean
}

/** 色阶节点，与 tempToColor 的分段一致 */
const stops = computed<TempStop[]>(() => {
  const a = props.alarmTemp
  return [
    { temp: 0,        label: '0°C',         isAlarm: false },
    { temp: a * 0.45, label: `${Math.round(a * 0.45)}°C`, isAlarm: false },
    { temp: a * 0.75, label: `${Math.round(a * 0.75)}°C`, isAlarm: false },
    { temp: a,        label: `${a}°C 警报`,  isAlarm: true },
    { temp: a + 15,   label: `${a + 15}°C`,  isAlarm: false },
  ]
})

const maxTemp = computed(() => props.alarmTemp + 15)

/** 从色带底部起算的百分比位置 */
function bottomPct(temp: number): string {
  return `${(temp / maxTemp.value * 100).toFixed(0)}%`
}
</script>

<template>
  <div class="temp-legend">
    <div class="legend-bar" />

    <div class="legend-labels">
      <div
        v-for="s in stops"
        :key="s.temp"
        class="legend-label"
        :class="{ alarm: s.isAlarm }"
        :style="{ bottom: bottomPct(s.temp) }"
      >
        <span class="legend-dot" />
        <span>{{ s.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.temp-legend {
  position: absolute;
  right: 10px;
  top: 16px;
  bottom: 16px;
  width: 50px;
  display: flex;
  gap: 4px;
  pointer-events: none;
  z-index: 10;
}

.legend-bar {
  width: 10px;
  border-radius: 5px;
  background: v-bind("tempGradientCSS(props.alarmTemp)");
  border: 1px solid rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
}

.legend-labels {
  position: relative;
  flex: 1;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1;
}

.legend-label {
  position: absolute;
  left: 0;
  transform: translateY(50%);
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.legend-label.alarm {
  color: #e74c3c;
  font-weight: 700;
}

.legend-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
</style>
