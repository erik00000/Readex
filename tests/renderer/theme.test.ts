import { describe, expect, it } from 'vitest'
import { createAppThemeStyle, createTitleBarTheme } from '../../src/renderer/src/lib/theme'
import { DEFAULT_READER_SETTINGS } from '../../src/shared/types'

describe('application theme', () => {
  it('derives the complete light shell from the selected reader theme', () => {
    const style = createAppThemeStyle({
      ...DEFAULT_READER_SETTINGS,
      theme: 'light',
      backgroundColor: '#ffffff',
      textColor: '#242424',
      accentColor: '#4b82bd'
    }) as Record<string, string>

    expect(style['--bg']).toBe('#ffffff')
    expect(style['--text']).toBe('#242424')
    expect(style['--accent']).toBe('#4b82bd')
    expect(style.colorScheme).toBe('light')
    expect(style['--surface']).not.toBe(style['--bg'])
    expect(style['--border']).not.toBe(style['--bg'])
  })

  it('supports custom colors without falling back to the dark shell', () => {
    const style = createAppThemeStyle({
      ...DEFAULT_READER_SETTINGS,
      theme: 'custom',
      backgroundColor: '#f3ead8',
      textColor: '#3e3427',
      accentColor: '#9a5b2d'
    }) as Record<string, string>

    expect(style['--bg']).toBe('#f3ead8')
    expect(style['--text']).toBe('#3e3427')
    expect(style['--accent']).toBe('#9a5b2d')
    expect(style.colorScheme).toBe('light')
  })

  it('uses the same computed surface color for the native title bar controls', () => {
    const settings = {
      ...DEFAULT_READER_SETTINGS,
      theme: 'light' as const,
      backgroundColor: '#ffffff',
      textColor: '#242424'
    }
    const style = createAppThemeStyle(settings) as Record<string, string>
    const titleBar = createTitleBarTheme(settings)

    expect(titleBar.color).toBe(style['--surface'])
    expect(titleBar.symbolColor).toBe(style['--text'])
  })

  it('dims native title bar controls together with a modal backdrop', () => {
    const settings = {
      ...DEFAULT_READER_SETTINGS,
      theme: 'light' as const,
      backgroundColor: '#ffffff',
      textColor: '#242424'
    }

    expect(createTitleBarTheme(settings, 0.18)).toEqual({
      color: '#cbcbcb',
      symbolColor: '#1e1e1e'
    })
  })
})
