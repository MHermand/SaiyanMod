/** One rate-limit window as `$.session.usage()` reports it. */
export type Limit = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

/** The windows of the last response that reported any, and when they were read. */
export type Reading = {
  limits: Limit[]
  at: number
}

export type Panel = {
  isOpen: boolean
  /** Set by the band's ✕; the next alert or `/limits` shows the band again. */
  isHidden: boolean
}

export type Lang = 'en' | 'fr' | 'es'

declare module 'claude-code' {
  interface PluginState {
    'usage-limits': {
      reading: Reading | null
      now: number
      panel: Panel
      /** The band's language: the flag's last pick, else the `language` option. */
      lang: Lang
    }
  }
}
