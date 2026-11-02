import type { Lang, Limit } from '../types'

// ---------------------------------------------------------------------------
// Pace: where a window stands against a steady use of it until the reset.

export type { Lang } from '../types'
export type Status = 'ok' | 'tight' | 'over'

export type Window = {
  kind: string
  /** Percent used; 0 once the reset has passed since the reading. */
  used: number
  resetsAt: number | null
  isReset: boolean
  /** Share of the window gone, 0 to 1; null when its length is unknown. */
  elapsed: number | null
  /** Percent used at the reset if the pace so far holds; null when too early to tell. */
  projected: number | null
  /** When that pace reaches 100%, if before the reset. */
  hitAt: number | null
  status: Status
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export const lengthOf = (kind: string): number | null =>
  kind === 'five_hour' ? 5 * HOUR : kind.startsWith('seven_day') ? 7 * 24 * HOUR : null

// Before this share of a window has gone, the pace says more about one burst than about the window.
export const MIN_ELAPSED = 0.08
// At or past this projection the window is tight; past 100 it is over the pace.
const TIGHT = 85

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

export const windowOf = (l: Limit, now: number): Window => {
  const parsed = l.resetsAt ? Date.parse(l.resetsAt) : NaN
  const resetsAt = Number.isFinite(parsed) ? parsed : null
  const isReset = resetsAt !== null && now >= resetsAt
  const used = isReset ? 0 : Math.max(0, l.percentUsed)
  const length = lengthOf(l.kind)
  const elapsed = length && resetsAt !== null && !isReset ? clamp01(1 - (resetsAt - now) / length) : null
  const projected = elapsed !== null && elapsed >= MIN_ELAPSED ? used / elapsed : null
  const start = length && resetsAt !== null ? resetsAt - length : null
  const hitAt =
    projected !== null && projected > 100 && used > 0 && used < 100 && start !== null
      ? start + ((now - start) * 100) / used
      : null
  const status: Status =
    isReset ? 'ok'
    : used >= 100 ? 'over'
    : projected !== null ? (projected > 100 ? 'over' : projected >= TIGHT ? 'tight' : 'ok')
    : used >= 90 ? 'over'
    : used >= 75 ? 'tight'
    : 'ok'
  return { kind: l.kind, used, resetsAt, isReset, elapsed, projected, hitAt, status }
}

const RANK: Record<Status, number> = { ok: 0, tight: 1, over: 2 }
export const worst = (ws: readonly Window[]): Status =>
  ws.reduce<Status>((s, w) => (RANK[w.status] > RANK[s] ? w.status : s), 'ok')

// The two the band's row shows: the 5-hour window and the week, else the first two reported.
export const headline = (ws: readonly Window[]): Window[] => {
  const main = ws.filter(w => w.kind === 'five_hour' || w.kind === 'seven_day')
  return (main.length ? main : ws).slice(0, 2)
}

/** Well-formed windows only: a stored or reported value of another shape is dropped. */
export const limitsOf = (v: unknown): Limit[] =>
  Array.isArray(v)
    ? v.filter(
        (l): l is Limit =>
          !!l &&
          typeof l === 'object' &&
          typeof (l as Limit).kind === 'string' &&
          typeof (l as Limit).percentUsed === 'number' &&
          ((l as Limit).resetsAt === undefined || typeof (l as Limit).resetsAt === 'string'),
      )
    : []

// ---------------------------------------------------------------------------
// Alerts: 75% and 90% used, and the pace reaching the limit before the reset;
// each once per window, the window named by its kind and its reset.

export type Alert = { id: string; key: string; window: Window; threshold: number | null }

export const windowId = (w: Window): string =>
  `${w.kind}@${w.resetsAt === null ? '-' : Math.round(w.resetsAt / (5 * MINUTE))}`

export const THRESHOLDS = [75, 90] as const

// The newest alert each window owes, given what was already shown; a jump past both
// thresholds owes only the higher, and a threshold alert already tells the pace.
export const dueAlerts = (ws: readonly Window[], fired: Readonly<Record<string, readonly string[]>>): Alert[] => {
  const due: Alert[] = []
  for (const w of ws) {
    if (w.isReset || w.used >= 100) continue
    const id = windowId(w)
    const seen = fired[id] ?? []
    const crossed = THRESHOLDS.filter(t => w.used >= t && !seen.includes(String(t)))
    const top = crossed[crossed.length - 1]
    if (top !== undefined) {
      due.push({ id, key: String(top), window: w, threshold: top })
      continue
    }
    if (w.hitAt !== null && w.used >= 20 && !seen.includes('pace')) due.push({ id, key: 'pace', window: w, threshold: null })
  }
  return due
}

/** The alerts shown, as stored: well-formed entries of windows not yet reset. */
export const liveFired = (v: unknown, now: number): Record<string, string[]> => {
  const out: Record<string, string[]> = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [id, keys] of Object.entries(v)) {
    const reset = Number(id.split('@')[1]) * 5 * MINUTE
    if (Array.isArray(keys) && !(reset < now)) out[id] = keys.filter((k): k is string => typeof k === 'string')
  }
  return out
}

/** What an alert marks as shown: its own key, the thresholds below it, and the pace it also tells. */
export const firedKeys = (a: Alert): string[] =>
  a.threshold === null ? ['pace'] : [...THRESHOLDS.filter(t => t <= (a.threshold ?? 0)).map(String), ...(a.window.hitAt !== null ? ['pace'] : [])]


// ---------------------------------------------------------------------------
// Words.

const STRINGS = {
  en: {
    title: 'Limits',
    resets: (span: string) => `Resets in ${span}`,
    pace: (p: string) => `At this pace: ~${p} at reset`,
    paceHit: (t: string) => `At this pace: limit by ${t}`,
    early: 'Pace: too early to tell',
    pill: { ok: 'On track', tight: 'Tight', over: 'Ahead of pace' } as Record<Status, string>,
    reached: 'Limit reached',
    rowReached: 'reached',
    rowHit: (t: string) => `limit by ${t}`,
    rowReset: 'reset',
    resetDone: 'Reset since the last reading',
    updated: (ago: string) => `updated ${ago}`,
    justNow: 'just now',
    ago: (n: string) => `${n} ago`,
    alertUsed: (name: string, p: string) => `Limits · ${name}: ${p} used.`,
    alertHit: (t: string, span: string) => `At this pace, the limit is reached by ${t} (resets in ${span}).`,
    alertReset: (span: string) => `Resets in ${span}.`,
    alertPace: (name: string, t: string, span: string) =>
      `Limits · ${name}: at this pace, the limit is reached by ${t} (resets in ${span}).`,
    none: 'No usage limits reported yet: they arrive with Claude’s next reply, on a Claude subscription.',
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    d: 'd',
    five: '5h session',
    week: 'Week',
    spend: 'Spend limit',
    spendShort: 'Spend',
    commandHelp: 'Shows the usage limits band, unfolded, and prints the limits',
  },
  fr: {
    title: 'Limites',
    resets: (span: string) => `Remise à zéro dans ${span}`,
    pace: (p: string) => `À ce rythme : ~${p} à la remise à zéro`,
    paceHit: (t: string) => `À ce rythme : limite vers ${t}`,
    early: 'Rythme : trop tôt pour estimer',
    pill: { ok: 'Dans les clous', tight: 'Serré', over: 'Au-dessus du rythme' } as Record<Status, string>,
    reached: 'Limite atteinte',
    rowReached: 'atteinte',
    rowHit: (t: string) => `limite vers ${t}`,
    rowReset: 'remis à zéro',
    resetDone: 'Remise à zéro faite depuis le dernier relevé',
    updated: (ago: string) => `mis à jour ${ago}`,
    justNow: "à l'instant",
    ago: (n: string) => `il y a ${n}`,
    alertUsed: (name: string, p: string) => `Limites · ${name} : ${p} utilisés.`,
    alertHit: (t: string, span: string) => `À ce rythme, limite atteinte vers ${t} (remise à zéro dans ${span}).`,
    alertReset: (span: string) => `Remise à zéro dans ${span}.`,
    alertPace: (name: string, t: string, span: string) =>
      `Limites · ${name} : à ce rythme, limite atteinte vers ${t} (remise à zéro dans ${span}).`,
    none: "Aucune limite d'usage reçue pour l'instant : elles arrivent avec la prochaine réponse de Claude, sur un abonnement Claude.",
    days: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
    d: 'j',
    five: 'Session 5h',
    week: 'Semaine',
    spend: 'Plafond de dépenses',
    spendShort: 'Plafond',
    commandHelp: "Affiche le bandeau des limites d'usage, déplié, et les écrit",
  },
  es: {
    title: 'Límites',
    resets: (span: string) => `Se reinicia en ${span}`,
    pace: (p: string) => `A este ritmo: ~${p} al reiniciarse`,
    paceHit: (t: string) => `A este ritmo: límite hacia las ${t}`,
    early: 'Ritmo: demasiado pronto para estimar',
    pill: { ok: 'Buen ritmo', tight: 'Justo', over: 'Por encima del ritmo' } as Record<Status, string>,
    reached: 'Límite alcanzado',
    rowReached: 'alcanzado',
    rowHit: (t: string) => `límite hacia las ${t}`,
    rowReset: 'reiniciado',
    resetDone: 'Reiniciado desde la última lectura',
    updated: (ago: string) => `actualizado ${ago}`,
    justNow: 'ahora mismo',
    ago: (n: string) => `hace ${n}`,
    alertUsed: (name: string, p: string) => `Límites · ${name}: ${p} usado.`,
    alertHit: (t: string, span: string) => `A este ritmo, el límite se alcanza hacia las ${t} (se reinicia en ${span}).`,
    alertReset: (span: string) => `Se reinicia en ${span}.`,
    alertPace: (name: string, t: string, span: string) =>
      `Límites · ${name}: a este ritmo, el límite se alcanza hacia las ${t} (se reinicia en ${span}).`,
    none: 'Aún no hay límites de uso: llegan con la próxima respuesta de Claude, con una suscripción a Claude.',
    days: ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'],
    d: 'd',
    five: 'Sesión 5h',
    week: 'Semana',
    spend: 'Límite de gasto',
    spendShort: 'Gasto',
    commandHelp: 'Muestra la banda de límites de uso, desplegada, y los escribe',
  },
} satisfies Record<Lang, unknown>

export const words = (lang: Lang) => STRINGS[lang]

const MODEL = /^seven_day_(.+)$/
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** `short` for the band's row, `long` for the unfolded rows, the alerts and /limits. */
export const nameOf = (kind: string, lang: Lang): { short: string; long: string } => {
  const s = words(lang)
  if (kind === 'five_hour') return { short: '5 h', long: s.five }
  if (kind === 'seven_day') return { short: s.week, long: s.week }
  const model = MODEL.exec(kind)?.[1]
  if (model) {
    const m = model.split('_').map(cap).join(' ')
    return { short: `${s.week} ${m}`, long: `${s.week} ${m}` }
  }
  if (kind === 'spend_limit') return { short: s.spendShort, long: s.spend }
  return { short: kind, long: kind }
}

// ---------------------------------------------------------------------------
// Numbers and times, in the person's local time.

// French and Spanish set a narrow no-break space before %.
export const pct = (n: number, lang: Lang): string => `${Math.round(n)}${lang === 'en' ? '%' : ' %'}`

const pad = (n: number): string => String(n).padStart(2, '0')

export const clock = (ms: number, lang: Lang): string => {
  const d = new Date(ms)
  if (lang !== 'en') return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${d.getHours() % 12 || 12}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

// Within this, a time of day alone is unambiguous; past it, the day is named.
const SAME_DAY = 20 * HOUR

/** `02:30`, or `ven. 06:00` when further off. */
export const whenShort = (ms: number, now: number, lang: Lang): string =>
  ms - now < SAME_DAY ? clock(ms, lang) : `${words(lang).days[new Date(ms).getDay()]} ${clock(ms, lang)}`

/** The time left until a reset: `4j 3h` past a day, `2h 5m` within one, `42m` within the hour. */
export const span = (ms: number, lang: Lang): string => {
  const m = Math.max(1, Math.ceil(ms / MINUTE))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return d > 0 ? `${d}${words(lang).d} ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

/** `il y a 3 min`, `il y a 2 h`. */
export const ago = (ms: number, now: number, lang: Lang): string => {
  const m = Math.floor((now - ms) / MINUTE)
  return m < 1 ? words(lang).justNow : words(lang).ago(m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`)
}

// ---------------------------------------------------------------------------
// Sentences: the band's row, the unfolded rows, the alerts and /limits.

/** The row's note after a window's percent, and whether it is a warning. */
export const rowNote = (w: Window, now: number, lang: Lang): { text: string; isWarning: boolean } => {
  const s = words(lang)
  if (w.isReset) return { text: s.rowReset, isWarning: false }
  if (w.used >= 100) return { text: s.rowReached, isWarning: true }
  if (w.hitAt !== null) return { text: s.rowHit(whenShort(w.hitAt, now, lang)), isWarning: true }
  return { text: w.resetsAt === null ? '' : `↻ ${span(w.resetsAt - now, lang)}`, isWarning: false }
}

/** The unfolded row's first note, under the bar: when the window resets. */
export const resetNote = (w: Window, now: number, lang: Lang): string => {
  const s = words(lang)
  if (w.isReset) return s.resetDone
  return w.resetsAt === null ? '' : s.resets(span(w.resetsAt - now, lang))
}

/** The unfolded row's second note: where the pace leads, in a column of its own. */
export const paceNote = (w: Window, now: number, lang: Lang): string => {
  const s = words(lang)
  if (w.isReset || w.used >= 100 || w.elapsed === null) return ''
  if (w.projected === null) return s.early
  return w.hitAt !== null ? s.paceHit(whenShort(w.hitAt, now, lang)) : s.pace(pct(w.projected, lang))
}

export const notes = (w: Window, now: number, lang: Lang): string[] =>
  [resetNote(w, now, lang), paceNote(w, now, lang)].filter(Boolean)

/** The chip at the right of the unfolded row; null after a reset or too early to tell. */
export const pillOf = (w: Window, lang: Lang): string | null =>
  w.isReset ? null : w.used >= 100 ? words(lang).reached : w.projected === null && w.elapsed !== null ? null : words(lang).pill[w.status]

export const alertText = (a: Alert, now: number, lang: Lang): string => {
  const s = words(lang)
  const w = a.window
  const name = nameOf(w.kind, lang).long
  const left = w.resetsAt === null ? '' : span(w.resetsAt - now, lang)
  if (a.threshold === null) return s.alertPace(name, whenShort(w.hitAt ?? now, now, lang), left)
  const tail = w.hitAt !== null ? s.alertHit(whenShort(w.hitAt, now, lang), left) : left ? s.alertReset(left) : ''
  return `${s.alertUsed(name, pct(a.threshold, lang))} ${tail}`.trim()
}

/** What `/limits` prints, one line per window. */
export const summary = (ws: readonly Window[], now: number, lang: Lang): string =>
  ws.length === 0
    ? words(lang).none
    : ws
        .map(w => [`${nameOf(w.kind, lang).long}${lang === 'fr' ? ' :' : ':'} ${pct(w.used, lang)}`, ...notes(w, now, lang)].join(' · '))
        .join('\n')

// ---------------------------------------------------------------------------
// Drawing on the desktop: one SVG per row, since the desktop wraps sibling
// elements onto new lines. Colors follow the app's theme through the SVG's
// own `prefers-color-scheme`.

export const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

const STYLE = `<style>
.t{fill:#1f1e1c}.m{fill:#75736c}.k{fill:#e7e5de}.tk{fill:#1f1e1c;fill-opacity:.55}.sp{fill:#e2dfd6}
.ok{fill:#3e9c6e}.tight{fill:#c98a1c}.over{fill:#d2493f}
@media (prefers-color-scheme: dark){.t{fill:#f0eee7}.m{fill:#a3a097}.k{fill:#4a4944}.tk{fill:#f0eee7;fill-opacity:.6}.sp{fill:#45443f}.ok{fill:#5bbe8a}.tight{fill:#e7ae45}.over{fill:#ef6b5f}}
</style>`

export const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// Rough advance of system UI text, in em; good enough to lay out a row.
const charEm = (ch: string): number =>
  /[\s.,:;'|!il1()[\] ]/.test(ch) ? 0.3 : /[A-Z@%mw↻]/.test(ch) ? 0.72 : /[0-9]/.test(ch) ? 0.6 : 0.56

export const textWidth = (s: string, size: number, isBold = false): number =>
  [...s].reduce((w, ch) => w + charEm(ch) * size, 0) * (isBold ? 1.05 : 1)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
export const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out ? out + '…' : ''
}

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${STYLE}${body}</svg>`

const text = (x: number, y: number, cls: string, size: number, s: string, extra = ''): string =>
  `<text class="${cls}" x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-variant-numeric="tabular-nums"${extra}>${xml(s)}</text>`

// The bar: its track, the share used, and the pace mark where a steady use would stand now.
const bar = (x: number, y: number, w: number, h: number, win: Window): string => {
  const used = Math.min(100, win.used)
  const fill = used > 0 ? Math.max(h, (w * used) / 100) : 0
  const tick =
    win.elapsed === null ? '' : `<rect class="tk" x="${(x + w * win.elapsed - 1).toFixed(1)}" y="${y - 4}" width="2" height="${h + 8}" rx="1"/>`
  return `<rect class="k" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>${fill ? `<rect class="${win.status}" x="${x}" y="${y}" width="${fill.toFixed(1)}" height="${h}" rx="${h / 2}"/>` : ''}${tick}`
}

const ROW_H = 24

/** The folded row: status dot, title, then each headline window with its bar, percent and note. */
export const rowSvg = (ws: readonly Window[], W: number, now: number, lang: Lang): string => {
  const title = words(lang).title
  const mid = ROW_H / 2
  let body = `<circle class="${worst(ws)}" cx="5" cy="${mid}" r="4"/>${text(16, mid + 4.5, 't', 13, title, ' font-weight="600"')}`
  const x0 = 16 + textWidth(title, 13, true) + 16
  const SEP = 25
  const gw = (W - x0 - SEP * (ws.length - 1)) / Math.max(1, ws.length)
  const pctW = textWidth(pct(100, lang), 13, true)
  ws.forEach((w, i) => {
    const gx = x0 + i * (gw + SEP)
    if (i > 0) body += `<rect class="sp" x="${(gx - SEP / 2 - 0.5).toFixed(1)}" y="${mid - 9}" width="1" height="18"/>`
    const label = nameOf(w.kind, lang).short
    const labelW = textWidth(label, 12.5, true)
    const note = rowNote(w, now, lang)
    let noteW = note.text ? textWidth(note.text, 12) : 0
    // The bar gives way first, down to 48px; then the note goes.
    if (gw - labelW - pctW - noteW - 32 < 48) noteW = 0
    const barW = Math.max(28, gw - labelW - pctW - (noteW ? noteW + 32 : 24))
    body += text(gx, mid + 4.5, 't', 12.5, label, ' font-weight="600"')
    body += bar(gx + labelW + 8, mid - 3, barW, 6, w)
    const px = gx + labelW + 8 + barW + 8 + pctW
    body += text(px, mid + 4.5, note.isWarning ? w.status : 't', 13, pct(w.used, lang), ' font-weight="600" text-anchor="end"')
    if (noteW) body += text(px + 8, mid + 4.5, note.isWarning ? w.status : 'm', 12, note.text)
  })
  return svg(W, ROW_H, body)
}

/** The unfolded head: status dot, title, and how old the figures are. */
export const headSvg = (ws: readonly Window[], W: number, readAt: number, now: number, lang: Lang): string => {
  const s = words(lang)
  const mid = ROW_H / 2
  const age = s.updated(ago(readAt, now, lang))
  return svg(
    W,
    ROW_H,
    `<circle class="${worst(ws)}" cx="5" cy="${mid}" r="4"/>${text(16, mid + 4.5, 't', 13, s.title, ' font-weight="600"')}${text(W, mid + 4, 'm', 12, age, ' text-anchor="end"')}`,
  )
}

const DETAIL_H = 60
const NOTE_SIZE = 12
const NOTE_GAP = 20

/** Where the pace notes start, the same for every unfolded row: past the widest reset note. */
export const paceColumn = (ws: readonly Window[], now: number, lang: Lang): number =>
  Math.round(Math.max(0, ...ws.map(w => textWidth(resetNote(w, now, lang), NOTE_SIZE))) + NOTE_GAP)

/** One unfolded window: name and percent, a taller bar, then the reset, the pace at `paceX`, and a chip. */
export const detailSvg = (w: Window, W: number, now: number, lang: Lang, paceX: number): string => {
  const name = nameOf(w.kind, lang).long
  let body = text(0, 15, 't', 13.5, name, ' font-weight="600"')
  body += text(W, 15, w.used >= 100 ? 'over' : 't', 15, pct(w.used, lang), ' font-weight="600" text-anchor="end"')
  body += bar(0, 25, W, 8, w)
  const chip = pillOf(w, lang)
  const chipW = chip ? textWidth(chip, 11, true) + 18 : 0
  const cls = w.used >= 100 ? 'over' : w.status
  if (chip) {
    const cx = W - chipW
    body += `<rect class="${cls}" x="${cx.toFixed(1)}" y="42" width="${chipW.toFixed(1)}" height="18" rx="9" fill-opacity=".16"/>`
    body += text(cx + chipW / 2, 55, cls, 11, chip, ' font-weight="600" text-anchor="middle"')
  }
  const room = W - (chip ? chipW + 12 : 0)
  const reset = fitText(resetNote(w, now, lang), NOTE_SIZE, Math.min(room, paceX - 12))
  if (reset) body += text(0, 55, 'm', NOTE_SIZE, reset)
  const pace = fitText(paceNote(w, now, lang), NOTE_SIZE, room - paceX)
  if (pace) body += text(paceX, 55, 'm', NOTE_SIZE, pace)
  return svg(W, DETAIL_H, body)
}

// ---------------------------------------------------------------------------
// Drawing on the terminal: a bar of cells, the pace mark as a thin bar.

export type Cells = { text: string; part: 'used' | 'free' | 'mark' }

/** The bar in runs of cells: used, free, and the pace mark in place of the cell it falls on. */
export const cellBar = (w: Window, width: number): Cells[] => {
  const n = Math.round((width * Math.min(100, w.used)) / 100)
  const at = w.elapsed === null ? -1 : Math.min(width - 1, Math.round(width * w.elapsed))
  const runs: Cells[] = []
  for (let i = 0; i < width; i++) {
    const part: Cells['part'] = i === at ? 'mark' : i < n ? 'used' : 'free'
    const last = runs[runs.length - 1]
    const ch = part === 'mark' ? '│' : part === 'used' ? '█' : '░'
    if (last && last.part === part) last.text += ch
    else runs.push({ text: ch, part })
  }
  return runs
}
