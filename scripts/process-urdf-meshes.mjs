/**
 * process-urdf-meshes.mjs
 *
 * 读取 URDF 和所有 STL 网格文件，将 3D 网格投影到 2D 正视图，
 * 计算每个 visual mesh 的 2D 轮廓（凸包），输出为 JSON 供
 * RobotDiagram2D 组件使用。
 *
 * 投影方式：SVG_x = -y_urdf, SVG_y = -z_urdf（正视图，x 轴朝里）
 */

import fs from 'node:fs'
import { resolve, join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ============================================================
// 1. URDF 解析
// ============================================================

function parseURDF(xmlText) {
  const joints = []
  const visuals = [] // { link: string, xyz: number[], rpy: number[], meshFile: string }

  // 关节
  const jointRegex = /<joint\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/joint>/g
  let m
  while ((m = jointRegex.exec(xmlText)) !== null) {
    const name = m[1]
    const body = m[2]
    const parent = body.match(/<parent\s+link="([^"]+)"/)?.[1] || ''
    const child = body.match(/<child\s+link="([^"]+)"/)?.[1] || ''
    const originMatch = body.match(/<origin\s+xyz="([^"]*)"\s+rpy="([^"]*)"/)
    const xyz = originMatch ? originMatch[1].split(/\s+/).map(Number) : [0, 0, 0]
    const rpy = originMatch ? originMatch[2].split(/\s+/).map(Number) : [0, 0, 0]
    const typeMatch = body.match(/type="([^"]+)"/)
    const type = typeMatch ? typeMatch[1] : 'fixed'
    joints.push({ name, parent, child, xyz, rpy, type })
  }

  // visual 元素：每个 link 下有多个 visual
  const linkRegex = /<link\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/link>/g
  while ((m = linkRegex.exec(xmlText)) !== null) {
    const linkName = m[1]
    const linkBody = m[2]
    // 这个 link 内所有 visual
    const visualRegex = /<visual>([\s\S]*?)<\/visual>/g
    let vm
    while ((vm = visualRegex.exec(linkBody)) !== null) {
      const vBody = vm[1]
      const originMatch = vBody.match(/<origin\s+xyz="([^"]*)"\s+rpy="([^"]*)"/)
      const xyz = originMatch ? originMatch[1].split(/\s+/).map(Number) : [0, 0, 0]
      const rpy = originMatch ? originMatch[2].split(/\s+/).map(Number) : [0, 0, 0]
      const meshMatch = vBody.match(/<mesh\s+filename="([^"]+)"/)
      if (meshMatch) {
        visuals.push({
          link: linkName,
          xyz,
          rpy,
          meshFile: meshMatch[1],
        })
      }
    }
  }

  return { joints, visuals }
}

// ============================================================
// 2. 运动树：joint → 世界坐标（零位姿）
// ============================================================

function computeJointPositions(joints) {
  // link → (parentJointName or null)
  const linkToParentJoint = new Map()
  for (const j of joints) {
    linkToParentJoint.set(j.child, j.name)
  }

  // joint → position (accumulated xyz)
  const positions = new Map()

  function getJointPos(jointName) {
    if (positions.has(jointName)) return positions.get(jointName)
    const j = joints.find(jj => jj.name === jointName)
    if (!j) {
      positions.set(jointName, [0, 0, 0])
      return [0, 0, 0]
    }
    // 找 parent link 的 parent joint
    const parentJointName = linkToParentJoint.get(j.parent)
    let px = 0, py = 0, pz = 0
    if (parentJointName) {
      const pp = getJointPos(parentJointName)
      px = pp[0]; py = pp[1]; pz = pp[2]
    }
    const pos = [px + j.xyz[0], py + j.xyz[1], pz + j.xyz[2]]
    positions.set(jointName, pos)
    return pos
  }

  for (const j of joints) {
    getJointPos(j.name)
  }
  return positions
}

// ============================================================
// 3. STL 二进制解析
// ============================================================

function parseBinarySTL(stlPath) {
  const buf = fs.readFileSync(stlPath)
  const count = buf.readUInt32LE(80)
  const vertices = []
  let offset = 84
  for (let i = 0; i < count; i++) {
    offset += 12 // skip normal
    const v1 = [
      buf.readFloatLE(offset),
      buf.readFloatLE(offset + 4),
      buf.readFloatLE(offset + 8),
    ]
    offset += 12
    const v2 = [
      buf.readFloatLE(offset),
      buf.readFloatLE(offset + 4),
      buf.readFloatLE(offset + 8),
    ]
    offset += 12
    const v3 = [
      buf.readFloatLE(offset),
      buf.readFloatLE(offset + 4),
      buf.readFloatLE(offset + 8),
    ]
    offset += 12
    offset += 2 // attribute
    vertices.push(v1, v2, v3)
  }
  return vertices
}

// ============================================================
// 4. RPY 旋转矩阵 (Rz * Ry * Rx)
// ============================================================

function rotatePoint(point, rpy) {
  const [r, p, y] = rpy
  const [x, yz, z] = point // rename y → yz to avoid conflict with yaw 'y'
  const cr = Math.cos(r), sr = Math.sin(r)
  const cp = Math.cos(p), sp = Math.sin(p)
  const cy = Math.cos(y), sy = Math.sin(y)

  // R = Rz(yaw) * Ry(pitch) * Rx(roll)
  const m00 = cp * cy; const m01 = sr * sp * cy - cr * sy; const m02 = cr * sp * cy + sr * sy
  const m10 = cp * sy; const m11 = sr * sp * sy + cr * cy; const m12 = cr * sp * sy - sr * cy
  const m20 = -sp;     const m21 = sr * cp;                const m22 = cr * cp

  return [
    m00 * x + m01 * yz + m02 * z,
    m10 * x + m11 * yz + m12 * z,
    m20 * x + m21 * yz + m22 * z,
  ]
}

// ============================================================
// 5. 2D 凸包 (Monotone Chain)
// ============================================================

function convexHull2D(points) {
  if (points.length <= 3) return points
  // Sort by x, then y
  const sorted = [...points].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1])

  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const lower = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }

  const upper = []
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function hullToSVGPath(hull) {
  if (hull.length < 3) return ''
  let d = `M${hull[0][0].toFixed(5)},${hull[0][1].toFixed(5)}`
  for (let i = 1; i < hull.length; i++) {
    d += `L${hull[i][0].toFixed(5)},${hull[i][1].toFixed(5)}`
  }
  d += 'Z'
  return d
}

// ============================================================
// 6. 主流程
// ============================================================

function main() {
  const urdfPath = resolve(ROOT, 'src/urdf/g1_29dof_rev_1_0_with_inspire_hand_FTP.urdf')
  const meshesDir = resolve(ROOT, 'src/urdf/meshes')
  const outputPath = resolve(ROOT, 'src/urdf/robot2d-meshes.json')

  const xmlText = fs.readFileSync(urdfPath, 'utf-8')
  const { joints, visuals } = parseURDF(xmlText)

  // Link → child joint map
  const linkToChildJoint = new Map()
  for (const j of joints) {
    linkToChildJoint.set(j.child, j.name)
  }

  // Joint world positions
  const jointPositions = computeJointPositions(joints)

  // link → joint position helper
  function getLinkWorldPos(linkName) {
    const jointName = linkToChildJoint.get(linkName)
    if (!jointName) return [0, 0, 0]
    return jointPositions.get(jointName) || [0, 0, 0]
  }

  console.log(`URDF: ${joints.length} joints, ${visuals.length} visual elements`)

  const output = { meshes: [] }
  let processed = 0
  let skipped = 0

  for (const vis of visuals) {
    const stlFile = vis.meshFile.replace(/^meshes\//, '')
    const stlPath = join(meshesDir, stlFile)
    if (!fs.existsSync(stlPath)) {
      console.warn(`  [skip] STL not found: ${stlFile}`)
      skipped++
      continue
    }

    // 读取 STL 三角形顶点
    let stlVerts
    try {
      stlVerts = parseBinarySTL(stlPath)
    } catch (e) {
      console.warn(`  [error] Failed to parse ${stlFile}: ${e.message}`)
      skipped++
      continue
    }

    // 变换并投影到 2D
    const [ox, oy, oz] = vis.xyz
    const projected2D = []

    for (const v of stlVerts) {
      // 1) 应用 visual origin rpy 旋转
      const rotated = rotatePoint(v, vis.rpy)
      // 2) 应用 visual origin xyz 平移（此时在 link 本地帧）
      const lx = rotated[0] + ox
      const ly = rotated[1] + oy
      const lz = rotated[2] + oz
      // 3) 投影到 2D 正视图：SVG_x = -y, SVG_y = -z
      projected2D.push([-ly, -lz])
    }

    // 计算凸包
    const hull = convexHull2D(projected2D)
    const path = hullToSVGPath(hull)

    // 忽略极小 mesh
    if (hull.length < 3) {
      skipped++
      continue
    }

    // 找到 link 对应的 child joint（用于运行时定位）
    const childJoint = linkToChildJoint.get(vis.link) || ''
    const linkPos = getLinkWorldPos(vis.link)

    output.meshes.push({
      joint: childJoint,
      link: vis.link,
      path,
      // 世界坐标（URDF 空间），用于运行时定位
      wx: linkPos[0],
      wy: linkPos[1],
      wz: linkPos[2],
    })
    processed++
  }

  // 写入 JSON
  const json = JSON.stringify(output)
  fs.writeFileSync(outputPath, json, 'utf-8')

  const sizeKB = (json.length / 1024).toFixed(1)
  console.log(`\nDone: ${processed} meshes processed, ${skipped} skipped`)
  console.log(`Output: ${outputPath} (${sizeKB} KB)`)
}

main()
