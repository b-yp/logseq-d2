import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin'

// Theme IDs match d2themescatalog (d2themes/d2themescatalog/catalog.go)
export const THEME_MAP: Record<string, number> = {
  'Default': 0,
  'Neutral Grey': 1,
  'Flagship Terrastruct': 3,
  'Cool Classics': 4,
  'Mixed Berry Blue': 5,
  'Grape Soda': 6,
  'Aubergine': 7,
  'Colorblind Clear': 8,
  'Vanilla Nitro Cola': 100,
  'Orange Creamsicle': 101,
  'Shirley Temple': 102,
  'Earth Tones': 103,
  'Everglade Green': 104,
  'Buttered Toast': 105,
  'Terminal': 300,
  'Terminal Grayscale': 301,
  'Origami': 302,
  'C4': 303,
  'Dark Mauve': 200,
  'Dark Flagship Terrastruct': 201,
}

export interface D2PluginSettings {
  theme?: string
  sketch?: boolean
}

export const settingsSchema: Array<SettingSchemaDesc> = [
  {
    key: 'theme',
    type: 'enum',
    title: 'Theme',
    description: 'Color theme for rendered diagrams.',
    default: 'Default',
    enumChoices: Object.keys(THEME_MAP),
  },
  {
    key: 'sketch',
    type: 'boolean',
    title: 'Sketch mode',
    description: 'Render diagrams in hand-drawn sketch style.',
    default: false,
  },
  {
    key: 'debug',
    type: 'boolean',
    title: 'Debug overlay',
    description: 'Show a small status panel in the corner (helps diagnose why diagrams do not render).',
    default: true,
  },
]

function currentSettings(): D2PluginSettings {
  return (logseq.settings ?? {}) as D2PluginSettings
}

export function getThemeID(): number {
  const name = String(currentSettings().theme ?? 'Default')
  return THEME_MAP[name] ?? 0
}

export function getSketch(): boolean {
  const s = currentSettings().sketch
  return s === true || (s as unknown) === 'true'
}

// Fingerprint of the settings that affect rendering; used to invalidate caches.
export function getSettingsKey(): string {
  return `${getThemeID()}:${getSketch()}`
}
