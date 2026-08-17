/**
 * useEStop -- 急停状态查询与触发
 *
 * 连接成功后每 3 秒轮询一次急停状态；断开时停止轮询。
 * 触发急停调用 profile.ros.estopService 服务。
 *
 * profile 为 Ref，支持运行时切换型号：仅 enableControl=true 的型号
 * 在连接后才启动轮询。
 */

import { ref, watch, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'
import { callService, useRosStatus } from '@/ros'
import { showToast } from '@/components/Toast/toast'
import type { RobotProfile } from '@/models'

export function useEStop(profile: Ref<RobotProfile>) {
  const { connected } = useRosStatus()

  /** 急停状态 */
  const estopActive = ref(false)
  /** 急停轮询定时器 */
  let estopTimer: ReturnType<typeof setInterval> | null = null

  /** 触发急停 */
  async function handleEStop(): Promise<void> {
    if (!profile.value.ros.estopService) return
    try {
      await callService(profile.value.ros.estopService, 'std_srvs/srv/Trigger', {})
      showToast('急停已触发，机器人进入阻尼模式', 'error', 8000)
    } catch (e: any) {
      showToast(`急停失败：${e.message}`, 'error')
    }
  }

  /** 查询急停状态 */
  async function handleQueryEStop(): Promise<void> {
    if (!profile.value.ros.estopQueryService) return
    try {
      const res = await callService(profile.value.ros.estopQueryService, 'std_srvs/srv/Trigger', {})
      estopActive.value = res.estop_active === true || res.estop_active === 'true'
    } catch (e: any) {
      console.warn('[急停] 查询失败:', e.message)
    }
  }

  // 连接后启动轮询，断开后停止（仅支持控制的型号）
  watch(connected, (val) => {
    if (!profile.value.enableControl) return
    if (val) {
      handleQueryEStop()
      estopTimer = setInterval(handleQueryEStop, 3000)
    } else if (estopTimer) {
      clearInterval(estopTimer)
      estopTimer = null
      estopActive.value = false
    }
  })

  onBeforeUnmount(() => {
    if (estopTimer) clearInterval(estopTimer)
  })

  return { estopActive, handleEStop }
}
