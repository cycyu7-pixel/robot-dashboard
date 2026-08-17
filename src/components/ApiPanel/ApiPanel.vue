/**
 * ============================================================
 * ApiPanel -- 机器人内部 FastAPI 服务悬浮面板（隐藏式菜单）
 * ============================================================
 *
 * 右下角悬浮按钮（可拖动），点击展开/收起面板。面板里是几个「流程功能」
 * 占位卡片，每个卡片调用 FastAPI 对应接口，结果直接显示在卡片内，失败用
 * Toast 提示。
 *
 * ★ 占位实现：接口路径在 src/api/index.ts 里，等拿到真实接口清单
 *   只改那里即可，这里不用动。
 *
 * 用法（在 App.vue）：传入 ip 复用顶栏输入的机器人 IP，
 *   FastAPI 地址 = http://IP:18800（端口见 src/api/client.ts）
 */

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { createFastApi, type FastApi } from '@/api'
import { showToast } from '@/components/Toast/toast'

const props = defineProps<{ ip: string }>()

/** 面板展开状态 */
const open = ref(false)

/** 各操作是否请求中（key: 操作名） */
const busy = ref<Record<string, boolean>>({})

/** 各卡片查询结果（JSON 字符串展示） */
const results = ref<Record<string, string>>({})

/** 启动任务输入的任务 id */
const taskId = ref('')

/** 每张卡片一个操作名 -> 接口调用，便于统一管理 loading/结果 */
const actions: Record<string, (api: FastApi) => Promise<unknown>> = {
  device: (api) => api.getDeviceInfo(),
  task: (api) => api.getTaskStatus(),
  start: (api) => api.startTask(taskId.value || 'default'),
  stop: (api) => api.stopTask(),
  logs: (api) => api.getLogs(),
}

async function run(key: string): Promise<void> {
  if (busy.value[key]) return
  busy.value = { ...busy.value, [key]: true }
  try {
    // 每次请求用当前 IP 创建客户端，用户改 IP 后自动跟随
    const api = createFastApi(props.ip)
    const data = await actions[key](api)
    results.value = { ...results.value, [key]: JSON.stringify(data, null, 2) }
  } catch (e: any) {
    showToast(`请求失败：${e?.message ?? e}`, 'error')
    results.value = { ...results.value, [key]: '' }
  } finally {
    busy.value = { ...busy.value, [key]: false }
  }
}

// ============================================================
// 悬浮按钮拖动定位
// ============================================================

const fabRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

/** 按钮位置（相对视口左上角） */
const pos = ref({
  x: Math.max(0, window.innerWidth - 120),
  y: Math.max(0, window.innerHeight - 70),
})

/** 是否正在拖动（用于光标样式） */
const dragging = ref(false)

/** 面板是否向下展开（按钮被拖到接近顶部时，向上展开会溢出） */
const panelBelow = ref(false)

/** 按钮实际尺寸（拖动边界限制用） */
let fabW = 0
let fabH = 0

/** 面板展开后若溢出视口顶部，改为向下展开 */
async function updatePanelBelow(): Promise<void> {
  await nextTick()
  const el = panelRef.value
  if (!el) return
  panelBelow.value = el.getBoundingClientRect().top < 0
}

function clampPos(p: { x: number; y: number }) {
  const maxX = Math.max(0, window.innerWidth - fabW)
  const maxY = Math.max(0, window.innerHeight - fabH)
  return {
    x: Math.min(Math.max(0, p.x), maxX),
    y: Math.min(Math.max(0, p.y), maxY),
  }
}

function measureAndClamp(): void {
  if (fabRef.value) {
    fabW = fabRef.value.offsetWidth
    fabH = fabRef.value.offsetHeight
  }
  pos.value = clampPos(pos.value)
}

// ---- 拖动状态 ----
let dragStart: { x: number; y: number; ox: number; oy: number } | null = null
let moved = false
/** 拖动结束后抑制一次 click，避免误切换面板开合 */
let suppressClick = false

function onPointerDown(e: PointerEvent): void {
  moved = false
  dragStart = { x: e.clientX, y: e.clientY, ox: pos.value.x, oy: pos.value.y }
  dragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!dragStart) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true
  pos.value = clampPos({ x: dragStart.ox + dx, y: dragStart.oy + dy })
}

function onPointerUp(): void {
  dragStart = null
  dragging.value = false
  if (moved) {
    suppressClick = true
    setTimeout(() => { suppressClick = false }, 0)
    // 拖动后重新判断面板展开方向
    if (open.value) updatePanelBelow()
  }
}

function onClick(): void {
  if (suppressClick) return
  open.value = !open.value
}

function onResize(): void {
  measureAndClamp()
}

/** 按钮位置 -> 平移样式（面板跟随按钮移动） */
const wrapStyle = computed(() => ({
  transform: `translate3d(${pos.value.x}px, ${pos.value.y}px, 0)`,
}))

onMounted(() => {
  measureAndClamp()
  // 默认停靠在右下角（留 24px 边距）
  pos.value = {
    x: Math.max(0, window.innerWidth - fabW - 24),
    y: Math.max(0, window.innerHeight - fabH - 24),
  }
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})

// 面板展开时判断是否需要向下展开
watch(open, (val) => {
  if (val) updatePanelBelow()
})
</script>

<template>
  <div class="api-panel-wrap" :style="wrapStyle">
    <!-- 悬浮按钮（可拖动，点击开合） -->
    <button
      ref="fabRef"
      class="api-fab"
      :class="{ open, dragging }"
      :title="open ? '收起 API 面板' : '打开 API 面板'"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @click="onClick"
    >
      <span class="fab-icon">⚙️</span>
      <span class="fab-label">API</span>
    </button>

    <!-- 悬浮面板 -->
    <Transition name="slide">
      <section
        v-if="open"
        ref="panelRef"
        class="api-panel"
        :class="{ below: panelBelow }"
      >
        <header class="panel-header">
          <span>机器人内部服务</span>
          <span class="panel-addr">{{ ip }}:18800</span>
        </header>

        <div class="panel-body">
          <!-- 设备信息 -->
          <div class="card">
            <div class="card-row">
              <span class="card-title">设备信息</span>
              <button class="btn-mini" :disabled="busy.device" @click="run('device')">
                {{ busy.device ? '查询中…' : '查询' }}
              </button>
            </div>
            <pre v-if="results.device" class="result">{{ results.device }}</pre>
          </div>

          <!-- 任务状态 -->
          <div class="card">
            <div class="card-row">
              <span class="card-title">任务状态</span>
              <button class="btn-mini" :disabled="busy.task" @click="run('task')">
                {{ busy.task ? '查询中…' : '查询' }}
              </button>
            </div>
            <pre v-if="results.task" class="result">{{ results.task }}</pre>
          </div>

          <!-- 启动任务 -->
          <div class="card">
            <div class="card-row">
              <span class="card-title">启动任务</span>
              <button class="btn-mini" :disabled="busy.start" @click="run('start')">
                {{ busy.start ? '启动中…' : '启动' }}
              </button>
            </div>
            <input v-model="taskId" class="input-task" placeholder="任务 id（默认 default）" />
            <pre v-if="results.start" class="result">{{ results.start }}</pre>
          </div>

          <!-- 停止任务 -->
          <div class="card">
            <div class="card-row">
              <span class="card-title">停止任务</span>
              <button class="btn-mini danger" :disabled="busy.stop" @click="run('stop')">
                {{ busy.stop ? '停止中…' : '停止' }}
              </button>
            </div>
            <pre v-if="results.stop" class="result">{{ results.stop }}</pre>
          </div>

          <!-- 最近日志 -->
          <div class="card">
            <div class="card-row">
              <span class="card-title">最近日志</span>
              <button class="btn-mini" :disabled="busy.logs" @click="run('logs')">
                {{ busy.logs ? '拉取中…' : '拉取' }}
              </button>
            </div>
            <pre v-if="results.logs" class="result log">{{ results.logs }}</pre>
          </div>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.api-panel-wrap {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 200;
  pointer-events: none;
  will-change: transform;
}

/* ---------- 悬浮按钮 ---------- */
.api-fab {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border: 1px solid #3498db;
  border-radius: 999px;
  background: #16213e;
  color: #3498db;
  font-size: 14px;
  font-weight: 600;
  cursor: grab;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  transition: background 0.2s, color 0.2s;
  user-select: none;
  touch-action: none;
  white-space: nowrap;
}

.api-fab:hover {
  background: #3498db;
  color: #fff;
}

.api-fab.open {
  background: #3498db;
  color: #fff;
}

.api-fab.dragging {
  cursor: grabbing;
}

.fab-icon {
  font-size: 16px;
}

/* ---------- 悬浮面板 ---------- */
.api-panel {
  pointer-events: auto;
  position: absolute;
  right: 0;
  bottom: calc(100% + 12px);
  width: 320px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  background: #16213e;
  border: 1px solid #2c3e50;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

/* 按钮靠近屏幕顶部时，面板向下展开 */
.api-panel.below {
  bottom: auto;
  top: calc(100% + 12px);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #ecf0f1;
  border-bottom: 1px solid #2c3e50;
  position: sticky;
  top: 0;
  background: #16213e;
}

.panel-addr {
  font-size: 11px;
  color: #7f8c8d;
  font-weight: 400;
}

.panel-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ---------- 功能卡片 ---------- */
.card {
  background: #0f1a2a;
  border: 1px solid #2c3e50;
  border-radius: 8px;
  padding: 10px 12px;
}

.card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-title {
  font-size: 13px;
  color: #bdc3c7;
  font-weight: 600;
}

.btn-mini {
  padding: 4px 14px;
  border: 1px solid #3498db;
  border-radius: 4px;
  background: transparent;
  color: #3498db;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-mini:hover:not(:disabled) {
  background: #3498db;
  color: #fff;
}

.btn-mini:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-mini.danger {
  border-color: #e74c3c;
  color: #e74c3c;
}

.btn-mini.danger:hover:not(:disabled) {
  background: #e74c3c;
  color: #fff;
}

.input-task {
  width: 100%;
  padding: 5px 8px;
  margin-bottom: 8px;
  border: 1px solid #3a5070;
  border-radius: 4px;
  background: #0f1a2a;
  color: #ecf0f1;
  font-size: 12px;
}

.input-task:focus {
  border-color: #3498db;
  outline: none;
}

/* ---------- 结果展示 ---------- */
.result {
  margin: 0;
  max-height: 140px;
  overflow: auto;
  padding: 8px;
  background: #0a0f1d;
  border: 1px solid #2c3e50;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: #7ee787;
  white-space: pre-wrap;
  word-break: break-all;
}

.result.log {
  color: #bdc3c7;
}

/* ---------- 展开动画 ---------- */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
