import type { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin'

export const AUTO_THEME = 'Auto (match Logseq)'

/** D2 built-in themes. Keys match https://d2lang.com/tour/themes */
export const THEME_MAP: Record<string, number> = {
  Default: 0,
  'Neutral Grey': 1,
  'Flagship Terrastruct': 3,
  'Cool Classics': 4,
  'Mixed Berry Blue': 5,
  'Grape Soda': 6,
  Aubergine: 7,
  'Colorblind Clear': 8,
  'Vanilla Nitro Cola': 100,
  'Orange Creamsicle': 101,
  'Shirley Temple': 102,
  'Earth Tones': 103,
  'Everglade Green': 104,
  'Buttered Toast': 105,
  'Dark Mauve': 200,
  'Dark Flagship Terrastruct': 201,
  Terminal: 300,
  'Terminal Grayscale': 301,
  Origami: 302,
  C4: 303,
}

export interface D2Settings {
  theme?: string
  darkTheme?: string
  transparent?: boolean | string
  sketch?: boolean | string
  scale?: number | string
  defaultViewMode?: 'diagram' | 'both' | 'code'
}

export interface RenderOptions {
  themeID: number
  sketch: boolean
  transparentBackground: boolean
  scale: number
}

export const settingsSchema: SettingSchemaDesc[] = [
  {
    key: 'theme',
    type: 'enum',
    title: 'Light Theme',
    description: 'Color theme in light mode, or Auto to follow Logseq dark/light mode.',
    default: AUTO_THEME,
    enumChoices: [AUTO_THEME, ...Object.keys(THEME_MAP)],
  },
  {
    key: 'darkTheme',
    type: 'enum',
    title: 'Dark Theme (for Auto mode)',
    description: 'Which dark theme to use when Logseq is in Dark Mode.',
    default: 'Dark Mauve',
    enumChoices: ['Dark Mauve', 'Dark Flagship Terrastruct', 'Terminal', 'Terminal Grayscale'],
  },
  {
    key: 'transparent',
    type: 'boolean',
    title: 'Transparent Background',
    description: 'Make diagram background transparent so it blends seamlessly into the Logseq card.',
    default: true,
  },
  {
    key: 'sketch',
    type: 'boolean',
    title: 'Sketch mode',
    description: 'Render diagrams in hand-drawn sketch style.',
    default: false,
  },
  {
    key: 'scale',
    type: 'enum',
    title: 'Diagram size (scale)',
    description: 'Scale the rendered diagram. 1 is natural D2 size.',
    default: '1',
    enumChoices: ['0.6', '0.75', '0.9', '1', '1.1', '1.25', '1.5'],
  },
  {
    key: 'defaultViewMode',
    type: 'enum',
    title: 'Default View Mode',
    description: 'Initial display mode for D2 code blocks: Diagram (diagram only), Both (code and diagram), or Code (code only).',
    default: 'diagram',
    enumChoices: ['diagram', 'both', 'code'],
  },
]

export function getDefaultViewMode(): 'diagram' | 'both' | 'code' {
  try {
    const mode = (logseq.settings as D2Settings | undefined)?.defaultViewMode
    if (mode === 'both' || mode === 'code' || mode === 'diagram') {
      return mode
    }
  } catch {
    // fallback
  }
  return 'diagram'
}

function parseColorToLuminance(colorStr: string): number | null {
  if (!colorStr) return null
  const hex = colorStr.trim().replace(/^#/, '')
  if (hex.length === 3 || hex.length === 6) {
    const fullHex =
      hex.length === 3
        ? hex.split('').map((c) => c + c).join('')
        : hex
    const num = Number.parseInt(fullHex, 16)
    if (!Number.isNaN(num)) {
      const r = (num >> 16) & 255
      const g = (num >> 8) & 255
      const b = num & 255
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    }
  }

  const match = colorStr.match(/rgba?\(([^)]+)\)/)
  if (!match) return null

  const parts = match[1].split(',').map((v) => Number.parseFloat(v.trim()))
  if (parts.length < 3 || parts.some((v) => !Number.isFinite(v))) return null
  if (parts.length >= 4 && parts[3] === 0) return null

  const [r, g, b] = parts
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function backgroundLuminance(element: Element | null): number | null {
  if (!element) return null
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (!style) return null

  // 1. Check CSS variables directly first (Logseq primary background)
  const varBg =
    style.getPropertyValue('--ls-primary-background-color') ||
    style.getPropertyValue('--ls-main-content-background') ||
    style.getPropertyValue('--background-color')
  if (varBg) {
    const lum = parseColorToLuminance(varBg)
    if (lum !== null) return lum
  }

  return parseColorToLuminance(style.backgroundColor)
}

let knownThemeMode: 'dark' | 'light' | null = null
let darkModeCache: boolean | null = null

export function setKnownThemeMode(mode: 'dark' | 'light' | null): void {
  knownThemeMode = mode
  darkModeCache = mode === 'dark' ? true : mode === 'light' ? false : null
}

export function invalidateThemeModeCache(): void {
  darkModeCache = knownThemeMode === 'dark' ? true : knownThemeMode === 'light' ? false : null
}

function isDarkMode(): boolean {
  if (darkModeCache !== null) return darkModeCache

  try {
    const doc = window.top?.document ?? document
    const candidates = [
      doc.documentElement,
      doc.body,
      doc.querySelector('#app-container'),
      doc.querySelector('#main-content-container'),
      doc.querySelector('.theme-container'),
    ]

    for (const element of candidates) {
      if (!element) continue

      const theme = (
        element.getAttribute('data-theme') ??
        element.getAttribute('data-color-scheme') ??
        ''
      ).toLowerCase()

      if (theme) {
        if (theme.includes('dark') || theme.includes('black') || theme.includes('night')) {
          return (darkModeCache = true)
        }
        if (theme.includes('light') || theme.includes('day') || theme.includes('white')) {
          return (darkModeCache = false)
        }
      }

      if (
        element.classList.contains('dark') ||
        element.classList.contains('is-dark') ||
        element.classList.contains('theme-dark')
      ) {
        return (darkModeCache = true)
      }
      if (
        element.classList.contains('light') ||
        element.classList.contains('is-light') ||
        element.classList.contains('theme-light')
      ) {
        return (darkModeCache = false)
      }
    }

    for (const element of candidates) {
      const luminance = backgroundLuminance(element)
      if (luminance !== null) return (darkModeCache = luminance < 0.5)
    }
  } catch {
    // Cross-origin host: fall through
  }

  const mediaDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  return (darkModeCache = mediaDark)
}

export function getThemeMode(): 'dark' | 'light' {
  return isDarkMode() ? 'dark' : 'light'
}

export function getRenderOptions(): RenderOptions {
  const settings = (logseq.settings ?? {}) as D2Settings
  const themeName = String(settings.theme ?? AUTO_THEME)
  const darkMode = isDarkMode()

  let themeID = 0
  if (themeName === AUTO_THEME) {
    if (darkMode) {
      const darkThemeName = String(settings.darkTheme ?? 'Dark Mauve')
      themeID = THEME_MAP[darkThemeName] ?? 200
    } else {
      themeID = 0 // Default Light
    }
  } else {
    themeID = THEME_MAP[themeName] ?? 0
  }

  const rawScale = Number(settings.scale ?? 1)
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1

  // Transparent by default so it blends into the Logseq card background seamlessly
  const transparent =
    settings.transparent === undefined ||
    settings.transparent === true ||
    settings.transparent === 'true'

  return {
    themeID,
    sketch: settings.sketch === true || settings.sketch === 'true',
    transparentBackground: transparent,
    scale,
  }
}

/** Identifies renders that share the same appearance. */
export function getSettingsKey(): string {
  const { themeID, sketch, transparentBackground, scale } = getRenderOptions()
  return `${themeID}:${sketch}:${transparentBackground}:${scale}`
}
