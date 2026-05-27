import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync, existsSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, extname } from 'node:path'
import type { Plugin, Connect } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MESHES_SRC = resolve(__dirname, 'src/urdf/meshes')

/**
 * 提供 URDF 网格（STL）文件的 Vite 插件
 * - 开发模式：通过中间件提供 /meshes/xxx.STL
 * - 生产构建：复制到 dist/meshes/
 */
function serveMeshes(): Plugin {
  return {
    name: 'serve-meshes',
    configureServer(server) {
      // 开发模式中间件
      server.middlewares.use('/meshes', ((req, res, next) => {
        const filename = req.url?.split('?')[0] ?? ''
        if (!filename) { next(); return }
        const filePath = join(MESHES_SRC, filename)
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
      // 生产构建：复制 meshes 到 dist
      const outDir = resolve(__dirname, 'dist/meshes')
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
      copyDirSync(MESHES_SRC, outDir)
      console.log(`[serve-meshes] 已复制网格文件到 ${outDir}`)
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
