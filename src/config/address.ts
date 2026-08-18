/**
 * ============================================================
 * 机器人 IP 运行时配置 —— 多现场/多机器人免改代码切换
 * ============================================================
 *
 * 界面只保留手动输入 IP；地址解析优先级（高 → 低）：
 *   1. URL 参数      ?ip=192.168.1.50    （深链/书签/快捷方式，最灵活）
 *   2. localStorage   上次使用的 IP       （现场操作员改一次即记住）
 *   3. public/robot-config.json 站点级配置（发布时现场只改这一个文件，免重新构建）
 *   4. 代码默认值                       （兜底，见 CODE_DEFAULT_IP）
 *
 * robot-config.json 示例（放在 public/ 下）：
 *   { "ip": "192.168.123.99" }
 *
 * 用法（App.vue）：
 *   const { ip, remember } = useRobotAddress()
 *   // ip       -> 当前机器人 IP（响应式，顶栏输入框绑定）
 *   // remember -> 连接成功后调用，写入 localStorage（刷新不丢）
 */

import { ref, watch, onMounted } from 'vue'

/** 代码默认 IP（最低优先级兜底） */
export const CODE_DEFAULT_IP = '192.168.123.99'

const STORAGE_IP_KEY = 'robot-dashboard:last-ip'

/** 站点级配置（public/robot-config.json，异步加载） */
const siteConfig = ref<{ ip?: string }>({})

/** 异步加载站点级配置；失败（404/网络）静默，走代码默认 */
async function loadSiteConfig(): Promise<void> {
  try {
    const res = await fetch('/robot-config.json', { cache: 'no-store' })
    if (!res.ok) return
    const cfg = await res.json()
    if (cfg && typeof cfg === 'object') siteConfig.value = cfg
  } catch {
    /* 忽略 */
  }
}

function fromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('ip')
}

function fromStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_IP_KEY)
  } catch {
    return null
  }
}

/** 保存上次使用 IP（刷新页面不丢） */
export function saveLastIp(ip: string): void {
  if (!ip || !ip.trim()) return
  try {
    localStorage.setItem(STORAGE_IP_KEY, ip.trim())
  } catch {
    /* 忽略 */
  }
}

/** 同步解析初始 IP（URL > localStorage > 站点配置 > 代码默认） */
function resolveInitialIp(): string {
  const url = fromUrl()
  if (url) {
    saveLastIp(url)
    return url
  }
  return fromStorage() || siteConfig.value.ip || CODE_DEFAULT_IP
}

/**
 * 机器人 IP composable
 *
 * @returns
 *   ip        - 当前机器人 IP（响应式，顶栏输入框绑定）
 *   remember  - 连接成功后调用，写入 localStorage（刷新不丢）
 */
export function useRobotAddress() {
  const ip = ref(resolveInitialIp())

  // 站点配置异步加载，仅在用户没有 URL / localStorage 显式指定时作为默认生效
  onMounted(async () => {
    await loadSiteConfig()
    if (!fromUrl() && !fromStorage() && siteConfig.value.ip) {
      ip.value = siteConfig.value.ip
      saveLastIp(ip.value)
    }
  })

  // 输入变化自动记忆（防抖），刷新页面不丢
  let timer: ReturnType<typeof setTimeout> | null = null
  watch(ip, (val) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => saveLastIp(val), 800)
  })

  return {
    ip,
    remember: saveLastIp,
  }
}
