import type { ReaderSettings } from './types'

/**
 * Height of the Windows native title bar overlay strip. The Electron overlay and
 * the CSS `.titlebar` must always use the same value, otherwise the window
 * buttons and the title bar drift apart.
 */
export const TITLE_BAR_HEIGHT = 54

export interface TitleBarTheme {
  color: string
  symbolColor: string
}

/**
 * The native window controls live outside the renderer, so the overlay color and
 * the CSS title bar have to be derived from the exact same surface rule.
 */
export function createTitleBarTheme(
  settings: ReaderSettings,
  dimAmount = 0
): TitleBarTheme {
  const background = normalizeHex(settings.backgroundColor)
  const text = normalizeHex(settings.textColor)
  const surface = mix(background, text, 0.035)
  const dim = Math.max(0, Math.min(1, dimAmount))
  return {
    color: mix(surface, '#000000', dim),
    symbolColor: mix(text, '#000000', dim)
  }
}

export function normalizeHex(value: string): string {
  const match = value.match(/^#?([\da-f]{3}|[\da-f]{6})$/i)
  if (!match) return '#212121'
  const hex = match[1]
  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((part) => `${part}${part}`)
      .join('')}`
  }
  return `#${hex}`
}

/** Rough WCAG-style luminance test used to pick readable overlay blends. */
export function isLightColor(value: string): boolean {
  return relativeLuminance(value) > 0.5
}

/**
 * Picks a label color that stays readable on top of `value`. Accent colors can be
 * as dark as the Codex-style near-black or as light as the dark-theme near-white,
 * so the contrast color follows the accent instead of the shell theme.
 */
export function readableOn(value: string): string {
  return isLightColor(value) ? '#0d0d0d' : '#ffffff'
}

export function mix(from: string, to: string, amount: number): string {
  const ratio = Math.max(0, Math.min(1, amount))
  const a = hexChannels(from)
  const b = hexChannels(to)
  return `#${a
    .map((channel, index) => Math.round(channel + (b[index] - channel) * ratio))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

export function rgba(value: string, alpha: number): string {
  const [red, green, blue] = hexChannels(value)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function hexChannels(value: string): [number, number, number] {
  const hex = normalizeHex(value).slice(1)
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ]
}

export function relativeLuminance(value: string): number {
  const channels = hexChannels(value).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
