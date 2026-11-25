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

/** What the model setting offers, in cycle order; all four when it says nothing. */
export const familiesIn = (options: readonly string[] | undefined): Family[] =>
  options ? FAMILIES.filter(f => options.includes(f)) : [...FAMILIES]

/** The alias to ask for: the long-context variant while the session uses one, where it exists. */
export const aliasOf = (family: Family, options: readonly string[] | undefined, usesLong: boolean): string =>
  usesLong && options?.includes(`${family}[1m]`) ? `${family}[1m]` : family
