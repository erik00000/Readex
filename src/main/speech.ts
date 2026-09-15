import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { EdgeTTS } from 'node-edge-tts'
import {
  TTS_MAX_RATE,
  TTS_MAX_TEXT_LENGTH,
  TTS_MAX_VOLUME,
  TTS_MIN_RATE,
  TTS_MIN_VOLUME,
  type TtsCue,
  type TtsSynthesisRequest,
  type TtsSynthesisResult
} from '../shared/speech'
import type { ReadexStorage } from './storage'

const SYNTHESIS_TIMEOUT_MS = 30_000
const CACHE_LIMIT_BYTES = 300 * 1024 * 1024
const CACHE_TRIM_INTERVAL = 20

export function normalizeSpeechText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function speechRatePercent(rate: number): string {
  const normalized = clamp(rate, TTS_MIN_RATE, TTS_MAX_RATE)
  return formatPercent(Math.round((normalized - 1) * 100))
}

export function speechVolumePercent(volume: number): string {
  const normalized = clamp(volume, TTS_MIN_VOLUME, TTS_MAX_VOLUME)
  return formatPercent(Math.round((normalized - 1) * 100))
}

export function parseSpeechCues(value: string): TtsCue[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const part = typeof record.part === 'string' ? record.part : ''
      const start = Number(record.start)
      const end = Number(record.end)
      if (!part || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return []
      }
      return [{ part, start, end }]
    })
  } catch {
    return []
  }
}

export class SpeechSynthesisService {
  private readonly inflight = new Map<string, Promise<TtsSynthesisResult>>()
  private queue: Promise<void> = Promise.resolve()
  private writesSinceTrim = 0

  constructor(private readonly storage: ReadexStorage) {}

  async synthesize(input: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const request = normalizeRequest(input)
    const key = cacheKey(request)
    const cached = await this.readCache(key)
    if (cached) return cached

    const existing = this.inflight.get(key)
    if (existing) return existing

    const task = this.enqueue(async () => {
      const secondCheck = await this.readCache(key)
      if (secondCheck) return secondCheck
      const generated = await this.generate(key, request)
      this.writesSinceTrim += 1
      if (this.writesSinceTrim >= CACHE_TRIM_INTERVAL) {
        this.writesSinceTrim = 0
        void this.trimCache()
      }
      return generated
    })

    this.inflight.set(key, task)
    try {
      return await task
    } finally {
      this.inflight.delete(key)
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async readCache(key: string): Promise<TtsSynthesisResult | null> {
    const paths = this.cachePaths(key)
    try {
      const audio = await fs.readFile(paths.audio)
      const cues = parseSpeechCues(await fs.readFile(paths.cues, 'utf8'))
      const now = new Date()
      await fs.utimes(paths.audio, now, now).catch(() => undefined)
      return {
        audio: new Uint8Array(audio),
        cues,
        cached: true
      }
    } catch {
      return null
    }
  }

  private async generate(
    key: string,
    request: TtsSynthesisRequest
  ): Promise<TtsSynthesisResult> {
    const paths = this.cachePaths(key)
    await fs.mkdir(path.dirname(paths.audio), { recursive: true })
    const temporaryDirectory = path.join(path.dirname(paths.audio), '.tmp')
    await fs.mkdir(temporaryDirectory, { recursive: true })
    const temporaryBase = path.join(temporaryDirectory, `${key}-${randomUUID()}`)
    const temporaryAudio = `${temporaryBase}.mp3`
    const temporaryCues = `${temporaryAudio}.json`

    try {
      await this.generateWithRetry(request, temporaryAudio)
      const audio = await fs.readFile(temporaryAudio)
      const cues = parseSpeechCues(
        await fs.readFile(temporaryCues, 'utf8').catch(() => '[]')
      )

      await fs.rm(paths.audio, { force: true })
      await fs.rm(paths.cues, { force: true })
      await fs.rename(temporaryAudio, paths.audio)
      await fs.writeFile(paths.cues, JSON.stringify(cues, null, 2), 'utf8')

      return {
        audio: new Uint8Array(audio),
        cues,
        cached: false
      }
    } finally {
      await fs.rm(temporaryAudio, { force: true }).catch(() => undefined)
      await fs.rm(temporaryCues, { force: true }).catch(() => undefined)
    }
  }

  private async generateWithRetry(
    request: TtsSynthesisRequest,
    audioPath: string
  ): Promise<void> {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const tts = new EdgeTTS({
          voice: request.voice,
          lang: 'zh-CN',
          rate: speechRatePercent(request.rate),
          volume: speechVolumePercent(request.volume),
          saveSubtitles: true,
          timeout: SYNTHESIS_TIMEOUT_MS
        })
        await tts.ttsPromise(request.text, audioPath)
        return
      } catch (error) {
        lastError = error
        await fs.rm(audioPath, { force: true }).catch(() => undefined)
        await fs.rm(`${audioPath}.json`, { force: true }).catch(() => undefined)
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 350))
        }
      }
    }
    throw new Error(normalizeSynthesisError(lastError))
  }

  private cachePaths(key: string): { audio: string; cues: string } {
    const directory = this.storage.getPaths().ttsCache
    return {
      audio: path.join(directory, `${key}.mp3`),
      cues: path.join(directory, `${key}.json`)
    }
  }

  private async trimCache(): Promise<void> {
    const directory = this.storage.getPaths().ttsCache
    const files = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
    const audioFiles = files
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mp3'))
      .map((entry) => path.join(directory, entry.name))
    const entries = await Promise.all(
      audioFiles.map(async (audio) => ({
        audio,
        cues: `${audio.slice(0, -4)}.json`,
        stat: await fs.stat(audio).catch(() => null)
      }))
    )
    let total = entries.reduce((sum, entry) => sum + (entry.stat?.size ?? 0), 0)
    if (total <= CACHE_LIMIT_BYTES) return

    entries.sort((left, right) => {
      return (left.stat?.mtimeMs ?? 0) - (right.stat?.mtimeMs ?? 0)
    })
    for (const entry of entries) {
      if (total <= CACHE_LIMIT_BYTES) break
      const size = entry.stat?.size ?? 0
      await fs.rm(entry.audio, { force: true }).catch(() => undefined)
      await fs.rm(entry.cues, { force: true }).catch(() => undefined)
      total -= size
    }
  }
}

function normalizeRequest(input: TtsSynthesisRequest): TtsSynthesisRequest {
  const text = normalizeSpeechText(String(input?.text ?? ''))
  if (!text) throw new Error('没有可朗读的文字')
  if (text.length > TTS_MAX_TEXT_LENGTH) {
    throw new Error(`单次朗读不能超过 ${TTS_MAX_TEXT_LENGTH} 个字符`)
  }

  const voice = String(input?.voice ?? '').trim()
  if (!/^[A-Za-z0-9-]{3,80}$/.test(voice)) {
    throw new Error('朗读音色无效')
  }

  return {
    text,
    voice,
    rate: clamp(Number(input?.rate), TTS_MIN_RATE, TTS_MAX_RATE),
    volume: clamp(Number(input?.volume), TTS_MIN_VOLUME, TTS_MAX_VOLUME)
  }
}

function cacheKey(request: TtsSynthesisRequest): string {
  return createHash('sha256')
    .update(
      [
        request.voice,
        request.rate.toFixed(2),
        request.volume.toFixed(2),
        request.text
      ].join('\u0000')
    )
    .digest('hex')
    .slice(0, 32)
}

function normalizeSynthesisError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error)
  if (/timeout|timed out/i.test(message)) return '听书服务响应超时，请稍后重试'
  if (/403|forbidden/i.test(message)) return '听书服务暂时拒绝了请求，请稍后重试'
  if (/429|too many/i.test(message)) return '听书请求过于频繁，请稍后重试'
  if (/503|service unavailable/i.test(message)) return '听书服务暂时不可用，请稍后重试'
  return `听书合成失败：${message || '未知错误'}`
}

function clamp(value: number, minimum: number, maximum: number): number {
  const normalized = Number.isFinite(value) ? value : minimum
  return Math.max(minimum, Math.min(maximum, normalized))
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}%`
}
