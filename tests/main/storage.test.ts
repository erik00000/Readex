import { describe, expect, it } from 'vitest'
import { migrateReaderSettings } from '../../src/main/storage'
import { DEFAULT_READER_SETTINGS } from '../../src/shared/types'

describe('reader settings migration', () => {
  it('defaults floating reader width to the existing content width', () => {
    const settings = migrateReaderSettings({
      ...DEFAULT_READER_SETTINGS,
      contentWidth: 940,
      floatingReaderWidth: undefined,
      floatingReaderHeight: undefined
    })

    expect(settings.floatingReaderWidth).toBe(940)
    expect(settings.floatingReaderHeight).toBe(200)
  })

  it('keeps an explicitly configured floating reader size', () => {
    const settings = migrateReaderSettings({
      ...DEFAULT_READER_SETTINGS,
      contentWidth: 940,
      floatingReaderWidth: 620,
      floatingReaderHeight: 280
    })

    expect(settings.floatingReaderWidth).toBe(620)
    expect(settings.floatingReaderHeight).toBe(280)
  })

  it('migrates legacy 1-10 speed levels to quieter 1-100 levels', () => {
    expect(
      migrateReaderSettings({ ...DEFAULT_READER_SETTINGS, autoScrollSpeed: 4 }).autoScrollSpeed
    ).toBe(25)
    expect(
      migrateReaderSettings({ ...DEFAULT_READER_SETTINGS, autoScrollSpeed: 2.1 })
        .autoScrollSpeed
    ).toBe(14)
    expect(
      migrateReaderSettings({ ...DEFAULT_READER_SETTINGS, autoScrollSpeed: 48 })
        .autoScrollSpeed
    ).toBe(48)
  })
})
