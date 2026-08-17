import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync, existsSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, extname } from 'node:path'
import type { Plugin, Connect } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * mesh 目录映射：URL 前缀 -> 本地源目录
 * - dev 模式：中间件按请求路径前缀查找对应源目录并提供文件
 * - 生产构建：把每个源目录复制到 dist 下对应路径
 *
 * 新增型号的 mesh：在此数组加一项 { urlPrefix, srcDir }，
 * 并在对应 profile 里把 urdfMeshBase 设为该 urlPrefix。
 */
const MESH_DIRS: { urlPrefix: string; srcDir: string }[] = [
  { urlPrefix: '/meshes/', srcDir: resolve(__dirname, 'src/urdf/meshes') },       // G1
  { urlPrefix: '/h2/meshes/', srcDir: resolve(__dirname, 'src/urdf/h2/meshes') }, // H2
]

function serveMeshes(): Plugin {
  return {
    name: 'serve-meshes',
    configureServer(server) {
      // dev 模式中间件：按 URL 前缀匹配源目录
      server.middlewares.use(((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        const entry = MESH_DIRS.find(m => url.startsWith(m.urlPrefix))
        if (!entry) { next(); return }
        const filename = url.slice(entry.urlPrefix.length)
        if (!filename) { next(); return }
        const filePath = join(entry.srcDir, filename)
        if (!existsSync(filePath)) { next(); return }
        const ext = extname(filename).toLowerCase()
        const mime: Record<string, string> = {
          '.stl': 'application/sla',
          '.dae': 'model/vnd.collada+xml',
        }
        res.statusCode = 200
        res.setHeader('Content-Type', mime[ext] || 'application/octet-stream')
        res.end(readFileSync(filePath))
      }) as Connect.NextHandleFunction)
    },
    closeBundle() {
      // 生产构建：复制每个 mesh 目录到 dist 对应路径
      for (const { urlPrefix, srcDir } of MESH_DIRS) {
        if (!existsSync(srcDir)) continue
        const outDir = resolve(__dirname, 'dist', urlPrefix.replace(/^\/|\/$/g, ''))
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
        copyDirSync(srcDir, outDir)
        console.log(`[serve-meshes] 已复制 ${srcDir} -> ${outDir}`)
      }
    },
  }
}

function copyDirSync(src: string, dest: string) {
  const entries = readdirSync(src)
  for (const entry of entries) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    if (statSync(srcPath).isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      copyDirSync(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), serveMeshes()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,        // 监听 0.0.0.0，允许局域网其他设备访问
    allowedHosts: true, // 允许任意 Host 访问，防止手机访问时 Host 校验失败
  },
})
