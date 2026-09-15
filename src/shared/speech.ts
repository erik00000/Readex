export interface TtsVoiceOption {
  id: string
  label: string
}

export const TTS_VOICES: readonly TtsVoiceOption[] = [
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓 · 女声' },
  { id: 'zh-CN-XiaoyiNeural', label: '晓伊 · 女声' },
  { id: 'zh-CN-YunxiNeural', label: '云希 · 男声' },
  { id: 'zh-CN-YunjianNeural', label: '云健 · 男声' }
] as const

export const DEFAULT_TTS_VOICE = TTS_VOICES[0].id
export const DEFAULT_TTS_RATE = 1
export const DEFAULT_TTS_VOLUME = 1
export const TTS_MIN_RATE = 0.6
export const TTS_MAX_RATE = 2
export const TTS_MIN_VOLUME = 0
export const TTS_MAX_VOLUME = 1
export const TTS_MAX_TEXT_LENGTH = 4000

export interface TtsSynthesisRequest {
  text: string
  voice: string
  rate: number
  volume: number
}

export interface TtsCue {
  part: string
  start: number
  end: number
}

export interface TtsSynthesisResult {
  audio: Uint8Array
  cues: TtsCue[]
  cached: boolean
}
