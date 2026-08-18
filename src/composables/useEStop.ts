/**
 * useEStop -- 急停状态查询与触发
 *
 * 通过机器人内 FastAPI 接口查询/触发急停（不再走 rosbridge service）：
 *   - 查询状态：GET /api/v1/estop/state
 *   - 触发急停：POST /api/v1/estop/trigger
 *
 * 连接成功后每 3 秒轮询一次急停状态；断开时停止轮询。
 * profile 为 Ref，支持运行时切换型号：仅 enableControl=true 的型号
 * 在连接后才启动轮询。
 */

import { ref, watch, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'
import { createFastApi } from '@/api'
import { useLowstateStatus } from '@/api/lowstate'
import { showToast } from '@/components/Toast/toast'
import type { RobotProfile } from '@/models'

export function useEStop(profile: Ref<RobotProfile>, ip: Ref<string>) {
  const { connected } = useLowstateStatus()

  /** 急停状态 */
  const estopActive = ref(false)
  /** 急停轮询定时器 */
  let estopTimer: ReturnType<typeof setInterval> | null = null

  /** 触发急停 */
  async function handleEStop(): Promise<void> {
    try {
      const api = createFastApi(ip.value)
      await api.triggerEstop()
      showToast('急停已触发，机器人进入阻尼模式', 'error', 8000)
    } catch (e: any) {
      showToast(`急停失败：${e?.message ?? e}`, 'error')
    }
  }

  /** 查询急停状态 */
  async function handleQueryEStop(): Promise<void> {
    if (!ip.value) return
    try {
      const api = createFastApi(ip.value)
      const vo = await api.estopState()
      estopActive.value = vo?.estop === true
    } catch (e: any) {
      console.warn('[急停] 查询失败:', e?.message ?? e)
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
