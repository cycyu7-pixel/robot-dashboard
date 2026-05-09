import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
// import { writeFileSync } from 'node:fs'
// import { join } from 'node:path'
// import type { Plugin } from 'vite'

// 临时：接收前端发来的 ROS 数据并写入项目目录 JSON 文件（已关闭）
// function saveRosData(): Plugin {
//   const projectRoot = fileURLToPath(new URL('.', import.meta.url))
//
//   return {
//     name: 'save-ros-data',
//     configureServer(server) {
//       server.middlewares.use('/api/save-data', (req, res) => {
//         if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
//
//         let body = ''
//         req.on('data', (chunk: Buffer) => { body += chunk.toString() })
//         req.on('end', () => {
//           try {
//             const payload = JSON.parse(body)
//             const filename = payload.filename || 'ros-data.json'
//             const outPath = join(projectRoot, filename)
//             writeFileSync(outPath, JSON.stringify(payload.data, null, 2), 'utf-8')
//             console.log(`[save-ros-data] 已写入 ${outPath}`)
//             res.statusCode = 200
//             res.end(JSON.stringify({ ok: true, path: outPath }))
//           } catch (e: any) {
//             res.statusCode = 400
//             res.end(JSON.stringify({ ok: false, error: e.message }))
//           }
//         })
//       })
//     },
//   }
// }

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
