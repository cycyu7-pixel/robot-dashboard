/**
 * ============================================================
 * FSM 模式映射 —— 运动服务（sport）模式 id -> 中文名
 * ============================================================
 *
 * 实时数据（/lowstate）已改由 FastAPI 数据源（src/api/lowstate.ts）提供，
 * 不再有 topic 订阅配置；本文件只保留模式 id 与中文名的映射，
 * 供模式切换下拉列表与状态栏展示使用。
 */

/** FSM ID -> 模式名映射（宇树 G1） */
export const FSM_MODE_MAP: Record<number, string> = {
  0: '零力矩',
  1: '阻尼模式',
  2: '下蹲',
  3: '坐姿',
  4: '预备模式',
  5: '平衡站立',
  501: '常规运控',
  706: '平衡下蹲、蹲起',
  702: '躺起',
  802: '走跑模式',
}

export const FSM_IDS = Object.entries(FSM_MODE_MAP).map(([id, label]) => ({
  id: Number(id),
  label,
}))
