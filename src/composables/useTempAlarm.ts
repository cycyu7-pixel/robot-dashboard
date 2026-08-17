/**
 * useTempAlarm -- 电机过温告警
 *
 * 监听 motorState，某关节温度超过阈值时弹一次 toast；
 * 温度回落自动清除记录，下次超温会再次告警。
 *
 * @param profile   机器人型号 Ref（提供关节表 / 显示名）
 * @param alarmTemp 报警温度阈值（℃），响应式
 */

import type { Ref } from 'vue'
import { watch } from 'vue'
import { topicData } from '@/ros/useTopics'
import type { RobotProfile } from '@/models'
import { showToast } from '@/components/Toast/toast'

export function useTempAlarm(profile: Ref<RobotProfile>, alarmTemp: Ref<number>) {
  /** 已触发过告警的关节（去重，温度回落自动清除） */
  const alertedJoints = new Set<string>()

  watch(() => topicData.motorState?.motors, (motors) => {
    if (!motors || motors.length === 0) return
    const threshold = alarmTemp.value
    const joints = profile.value.motorJoints
    const names = profile.value.displayNames
    for (let i = 0; i < Math.min(motors.length, joints.length); i++) {
      const m = motors[i]
      if (m.mode !== 0 && m.mode !== 1) continue
      const temp = m.temperature?.[0] ?? 0
      const name = joints[i]
      const display = names[i] ?? name
      if (temp > threshold && !alertedJoints.has(name)) {
        alertedJoints.add(name)
        showToast(`${display} 电机过热: ${temp.toFixed(1)}°C`, 'error', 6000)
      }
      if (temp <= threshold) {
        alertedJoints.delete(name)
      }
    }
  }, { deep: false })
}
