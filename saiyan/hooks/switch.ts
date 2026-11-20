import type { Effort, Family, Lang } from '../types'
import type { Form } from './mascot'

export type { Effort, Family, Lang } from '../types'

export const FAMILIES: readonly Family[] = ['haiku', 'sonnet', 'opus', 'fable']
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const NAME: Record<Family, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', fable: 'Fable' }
export const FORM: Record<Family, Form> = { haiku: 'base', sonnet: 'charged', opus: 'super', fable: 'ultimate' }

// Readable on both themes: a Text's color does not follow the theme.
export const COLOR: Record<Family, string> = { haiku: '#8A7A72', sonnet: '#C48A12', opus: '#1E9BD1', fable: '#E0392F' }

const EFFORT_WORD: Record<Lang, Record<Effort, string>> = {
  en: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  fr: { low: 'faible', medium: 'moyen', high: 'élevé', xhigh: 'très élevé', max: 'max' },
  es: { low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'muy alto', max: 'máx' },
}

const WORDS = {
  en: { help: 'Shows the bar; usage or agents picks its view', failed: 'Could not change it' },
  fr: { help: 'Affiche la barre ; usage ou agents choisit sa vue', failed: 'Changement impossible' },
  es: { help: 'Muestra la barra; usage o agents elige su vista', failed: 'No se pudo cambiar' },
} satisfies Record<Lang, unknown>

export const effortWord = (e: Effort, lang: Lang): string => EFFORT_WORD[lang][e]
export const words = (lang: Lang) => WORDS[lang]

/** The family a model id or alias belongs to: `claude-opus-5-5`, `opus[1m]`. */
export const familyOf = (id: unknown): Family | null =>
  typeof id === 'string' ? (FAMILIES.find(f => id.toLowerCase().includes(f)) ?? null) : null

export const isEffort = (v: unknown): v is Effort => EFFORTS.includes(v as Effort)

/** The next of `list` from `at`, wrapping; from nothing, its first or its last. */
export const stepIn = <T>(list: readonly T[], at: T | null, dir: 1 | -1): T | null => {
  if (!list.length) return null
  const i = at === null ? -1 : list.indexOf(at)
  if (i < 0) return (dir > 0 ? list[0] : list[list.length - 1]) ?? null
  return list[(i + dir + list.length) % list.length] ?? null
}

/** What the model setting offers, in cycle order; all four when it says nothing. */
export const familiesIn = (options: readonly string[] | undefined): Family[] =>
  options ? FAMILIES.filter(f => options.includes(f)) : [...FAMILIES]

/** The alias to ask for: the long-context variant while the session uses one, where it exists. */
export const aliasOf = (family: Family, options: readonly string[] | undefined, usesLong: boolean): string =>
  usesLong && options?.includes(`${family}[1m]`) ? `${family}[1m]` : family

// ---------------------------------------------------------------------------
// The shortcuts, read off one edit of the prompt box. Option held arrives as
// `meta`, or, on a Mac whose key event says nothing, as the character it types.

export type Move = { what: 'model' | 'effort'; dir: 1 | -1 }

export type Key = { key: string; ctrl?: true; shift?: true; meta?: true }

// Only characters nobody types by accident: never a letter of a word.
const BY_CHARACTER: Readonly<Record<string, Move>> = {
  'µ': { what: 'model', dir: 1 },
  'Ó': { what: 'model', dir: -1 },
}

// Control is read in the desktop app alone: a terminal sends Ctrl+M as Enter and uses Ctrl+E to reach the end of the line.
export const moveOf = (key: Key | undefined, input: string, isDesktop = false): Move | null => {
  if (key?.meta && !key.ctrl) {
    const k = key.key.toLowerCase()
    const dir = key.shift || key.key !== k ? -1 : 1
    if (k === 'm') return { what: 'model', dir }
    if (k === 'e') return { what: 'effort', dir }
    // A French keyboard types ê for Option+E: told from the letter by Option held, once its text is in.
    if (k === 'ê' && input) return { what: 'effort', dir }
  }
  if (isDesktop && key?.ctrl && !key.meta) {
    const k = key.key.toLowerCase()
    const dir = key.shift ? -1 : 1
    if (k === 'm') return { what: 'model', dir }
    if (k === 'e') return { what: 'effort', dir }
  }
  return BY_CHARACTER[input] ?? null
}

// Option+A opens and closes the bar: a French keyboard types æ for it, one press raising
// a second edit with no text, which must not count again. Ctrl+A in the desktop app alone,
// where it reaches the mod only if it moves the caret: never from an empty box.
export const isBarKey = (key: Key | undefined, input: string, isDesktop = false): boolean => {
  if (!key) return false
  const k = key.key.toLowerCase()
  if (key.meta && !key.ctrl) return k === 'a' || (k === 'æ' && !!input)
  return isDesktop && !!key.ctrl && !key.meta && k === 'a'
}
