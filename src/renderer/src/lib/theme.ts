import type { CSSProperties } from 'react'
import type { ReaderSettings } from '@shared/types'

export function createAppThemeStyle(settings: ReaderSettings): CSSProperties {
  const background = normalizeHex(settings.backgroundColor)
  const text = normalizeHex(settings.textColor)
  const accent = normalizeHex(settings.accentColor)
  const light = relativeLuminance(background) > 0.55

  return {
    '--bg': background,
    '--surface': mix(background, text, 0.035),
    '--surface-2': mix(background, text, 0.068),
    '--surface-3': mix(background, text, 0.1),
    '--surface-hover': mix(background, text, light ? 0.055 : 0.13),
    '--surface-selected': mix(background, text, light ? 0.085 : 0.105),
    '--surface-raised': light ? mix(background, '#ffffff', 0.55) : mix(background, text, 0.09),
    '--border': mix(background, text, light ? 0.11 : 0.14),
    '--border-soft': mix(background, text, light ? 0.065 : 0.08),
    '--text': text,
    '--text-strong': light ? mix(text, '#000000', 0.12) : mix(text, '#ffffff', 0.08),
    '--text-soft': mix(text, background, 0.2),
    '--text-muted': mix(text, background, 0.45),
    '--text-faint': mix(text, background, 0.62),
    '--accent': accent,
    '--accent-strong': mix(accent, text, light ? 0.18 : 0.2),
    '--accent-soft': rgba(accent, light ? 0.12 : 0.16),
    '--accent-contrast': light ? '#fffaf6' : mix(accent, '#ffffff', 0.86),
    '--danger': light ? '#c44747' : '#e16b6b',
    '--danger-soft': rgba(light ? '#c44747' : '#e16b6b', 0.12),
    '--warning': light ? '#a26921' : '#d9a85e',
    '--radius-sm': '7px',
    '--radius': '10px',
    '--radius-lg': '14px',
    '--shadow':
      light
        ? '0 6px 16px rgba(58, 48, 38, 0.08), 0 24px 60px rgba(58, 48, 38, 0.14)'
        : '0 18px 52px rgba(0, 0, 0, 0.36)',
    '--shadow-soft':
      light
        ? '0 1px 2px rgba(58, 48, 38, 0.05), 0 6px 20px rgba(58, 48, 38, 0.09)'
        : '0 8px 26px rgba(0, 0, 0, 0.32)',
    '--overlay': rgba(background, light ? 0.78 : 0.82),
    '--scrollbar': mix(background, text, light ? 0.2 : 0.16),
    '--scrollbar-hover': mix(background, text, light ? 0.32 : 0.28),
    '--cover-bg': mix(background, accent, light ? 0.18 : 0.22),
    '--cover-border': mix(background, accent, light ? 0.32 : 0.38),
    '--cover-text': light ? mix(text, accent, 0.22) : mix(text, accent, 0.16),
    colorScheme: light ? 'light' : 'dark'
  } as CSSProperties
}

export function createTitleBarTheme(
  settings: ReaderSettings,
  dimAmount = 0
): {
  color: string
  symbolColor: string
} {
  const background = normalizeHex(settings.backgroundColor)
  const text = normalizeHex(settings.textColor)
  const surface = mix(background, text, 0.035)
  const dim = Math.max(0, Math.min(1, dimAmount))
  return {
    color: mix(surface, '#000000', dim),
    symbolColor: mix(text, '#000000', dim)
  }
}

function normalizeHex(value: string): string {
  const match = value.match(/^#?([\da-f]{3}|[\da-f]{6})$/i)
  if (!match) return '#171717'
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
  const channels = hexChannels(value).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return luminance > 0.5
}

function mix(from: string, to: string, amount: number): string {
  const ratio = Math.max(0, Math.min(1, amount))
  const a = hexChannels(from)
  const b = hexChannels(to)
  return `#${a
    .map((channel, index) => Math.round(channel + (b[index] - channel) * ratio))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function rgba(value: string, alpha: number): string {
  const [red, green, blue] = hexChannels(value)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function hexChannels(value: string): [number, number, number] {
  const hex = normalizeHex(value).slice(1)
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ]
}

function relativeLuminance(value: string): number {
  const channels = hexChannels(value).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
