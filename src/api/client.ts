/**
 * ============================================================
 * FastAPI HTTP 客户端 —— 机器人内部部署的服务
 * ============================================================
 *
 * 机器人在内部跑了一个 FastAPI 服务，前端通过 HTTP 调用它的接口。
 * 因为每台机器人 IP 不同，而顶栏已经输入了 IP，所以 baseUrl 由
 * 前端已输入的 IP + 固定端口拼接而成（见 src/api/index.ts 的 buildApiBase）。
 *
 * 用法：
 *   const api = createApiClient('http://192.168.123.99:18800')
 *   const data = await api.get('/api/device/info')
 *   await api.post('/api/task/start', { id: 1 })
 */

/** FastAPI 服务端口（与机器人上部署的服务保持一致） */
export const API_PORT = 18800

/** 请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 8000

/** 由机器人 IP 拼接 FastAPI 基础地址 */
export function buildApiBase(ip: string): string {
  return `http://${ip}:${API_PORT}`
}

/** 统一把 fetch 响应解析成业务数据；非 2xx 或 JSON 解析失败时抛错 */
async function parseResponse<T>(res: Response): Promise<T> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // 响应体不是 JSON（如 500 页面），body 保持 null
  }
  if (!res.ok) {
    const detail = (body as { detail?: string } | null)?.detail
    throw new Error(detail ? String(detail) : `HTTP ${res.status}`)
  }
  return body as T
}

/** fetch 超时控制 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`请求超时（${REQUEST_TIMEOUT / 1000}s）`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** 基于一个 baseUrl 创建 get / post 请求工具 */
export function createApiClient(baseUrl: string) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${baseUrl}${path}`
    const res = await fetchWithTimeout(url, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
    return parseResponse<T>(res)
  }

  return {
    get<T>(path: string): Promise<T> {
      return request<T>(path)
    },
    post<T>(path: string, body?: unknown): Promise<T> {
      return request<T>(path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
