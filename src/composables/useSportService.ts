/**
 * useSportService -- 运动服务 FSM 模式查询与切换
 *
 * 通过机器人内 FastAPI 接口查询/切换 FSM 模式（不再走 rosbridge topic）：
 *   - 查询当前 FSM ID：GET /api/v1/sport/fsm
 *   - 切换 FSM 模式：POST /api/v1/sport/fsm { data }
 *
 * 模式菜单打开时会自动查询一次当前模式。
 * profile 为 Ref，仅 enableControl=true 的型号才在连接后初始化。
 */

import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { createFastApi } from '@/api'
import { useLowstateStatus } from '@/api/lowstate'
import { FSM_MODE_MAP, FSM_IDS } from '@/ros/topics'
import { showToast } from '@/components/Toast/toast'
import type { RobotProfile } from '@/models'

export function useSportService(profile: Ref<RobotProfile>, ip: Ref<string>) {
  const { connected } = useLowstateStatus()

  /** 运动服务 FSM ID（来自 FastAPI 响应） */
  const sportFsmId = ref(0)

  /** FSM ID -> 中文名 */
  const currentModeLabel = computed(() => {
    return FSM_MODE_MAP[sportFsmId.value] ?? `模式${sportFsmId.value}`
  })

  /** 可选模式列表 */
  const robotModes = FSM_IDS

  /** 模式菜单是否打开 */
  const modeMenuOpen = ref(false)

  /** 查询当前 FSM 模式 */
  async function queryFsmId(): Promise<void> {
    if (!ip.value) return
    try {
      const api = createFastApi(ip.value)
      const vo = await api.getFsm()
      if (vo && vo.fsmId !== undefined) sportFsmId.value = vo.fsmId
    } catch (e: any) {
      console.warn('[sport] 查询 FSM 模式失败:', e?.message ?? e)
    }
  }

  /** 切换 FSM 模式 */
  async function handleModeSelect(mode: typeof robotModes[0]): Promise<void> {
    modeMenuOpen.value = false
    showToast(`切换至「${mode.label}」模式`, 'info')
    try {
      const api = createFastApi(ip.value)
      const vo = await api.setFsm(mode.id)
      if (vo && vo.fsmId !== undefined) sportFsmId.value = vo.fsmId
    } catch (e: any) {
      showToast(`模式切换失败：${e?.message ?? e}`, 'error')
    }
  }

  /** 点击菜单外部时关闭菜单 */
  function handleDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement
    if (!target.closest('.mode-switch')) {
      modeMenuOpen.value = false
    }
  }

  watch(modeMenuOpen, (val) => {
    if (val) {
      document.addEventListener('click', handleDocClick)
      queryFsmId()
    } else {
      document.removeEventListener('click', handleDocClick)
    }
  })

  // 连接后查询当前模式（仅支持控制的型号）
  watch(connected, (val) => {
    if (!profile.value.enableControl) return
    if (val) queryFsmId()
  })

  return {
    sportFsmId,
    currentModeLabel,
    robotModes,
    modeMenuOpen,
    handleModeSelect,
  }
}
