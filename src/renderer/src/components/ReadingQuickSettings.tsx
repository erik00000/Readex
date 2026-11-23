import type { ReaderSettings } from '@shared/types'
import { READING_BACKGROUNDS, READING_FONT_SIZES } from '@shared/readingPresets'

interface Props { settings: ReaderSettings; onChange: (patch: Partial<ReaderSettings>) => void }

export function ReadingQuickSettings({ settings, onChange }: Props): React.JSX.Element {
  return <div className="reading-quick-settings" aria-label="阅读背景与字号" data-floating-no-drag="">
    <div className="reading-backgrounds" role="group" aria-label="阅读背景色">
      {READING_BACKGROUNDS.map(({ name, color }) => <button key={color} type="button"
        className="reading-color" title={name} aria-label={name}
        aria-pressed={settings.backgroundColor.toLowerCase() === color}
        style={{ backgroundColor: color }}
        onClick={() => onChange({ theme: 'custom', backgroundColor: color, textColor: '#292722', accentColor: '#45644d' })}/>) }
    </div>
    <div className="reading-font-sizes" role="group" aria-label="阅读字号">
      {READING_FONT_SIZES.map(({ label, size }) => <button key={size} type="button"
        title={label + ' · ' + size + 'px'} aria-pressed={settings.fontSize === size}
        onClick={() => onChange({ fontSize: size })}>{label}</button>)}
    </div>
  </div>
}
