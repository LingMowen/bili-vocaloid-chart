/**
 * 集成测试设置 — 加载 .env 环境变量
 *
 * Vitest 在运行集成测试前自动执行此文件
 * 用于从 .env 文件加载凭据到 process.env
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../../.env')

if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (key && value && !process.env[key]) {
      process.env[key] = value
    }
  }
  console.log('[集成测试] 已加载 .env 环境变量')
} else {
  console.warn('[集成测试] 未找到 .env 文件，仅运行无需凭据的测试')
}
