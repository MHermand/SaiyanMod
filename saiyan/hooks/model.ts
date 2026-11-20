// The model, the effort and the session outside a view of their own: the context's block and
// the session's figures in the limits view; the quick choice's line under the bar.
import type { Draft, Effort, Family, Gauge, Lang } from '../types'
import { pct as pctText, rowBars, SEP, span, svg, text, textWidth } from './limits'
import type { Block, Status, Window } from './limits'
import { COLOR, EFFORTS, NAME, effortWord } from './switch'

// As tall as the folded limits row, so the quick line under it scales the same.
const ROW_H = 24

const WORDS = {
  en: {
    model: 'Model',
    effort: 'Effort',
    context: 'Context',
    off: 'not adjustable',
    offNote: 'This model has no effort setting',
    count: (used: string, max: string) => `${used} of ${max} tokens`,
    full: 'Nearly full: Claude will summarize the conversation',
    unknown: 'Known after Claude’s next reply',
    cost: 'Cost',
    messages: 'Messages',
    time: 'Time',
  },
  fr: {
    model: 'Modèle',
    effort: 'Effort',
    context: 'Contexte',
    off: 'non réglable',
    offNote: 'Ce modèle n’a pas de réglage d’effort',
    count: (used: string, max: string) => `${used} sur ${max} jetons`,
    full: 'Bientôt pleine : Claude résumera la conversation',
    unknown: 'Connu après la prochaine réponse de Claude',
    cost: 'Coût',
    messages: 'Messages',
    time: 'Durée',
  },
  es: {
    model: 'Modelo',
    effort: 'Esfuerzo',
    context: 'Contexto',
    off: 'no ajustable',
    offNote: 'Este modelo no tiene ajuste de esfuerzo',
    count: (used: string, max: string) => `${used} de ${max} tokens`,
    full: 'Casi llena: Claude resumirá la conversación',
    unknown: 'Se conoce tras la próxima respuesta de Claude',
    cost: 'Coste',
    messages: 'Mensajes',
    time: 'Tiempo',
  },
} satisfies Record<Lang, unknown>

export const viewWords = (lang: Lang) => WORDS[lang]

const decimal = (n: number, digits: number, lang: Lang): string => {
  const s = n.toFixed(digits).replace(/\.0+$/, '')
  return lang === 'en' ? s : s.replace('.', ',')
}

export const fmtTok = (n: number, lang: Lang): string => {
  const gap = lang === 'en' ? '' : ' '
  return n >= 1e6 ? `${decimal(n / 1e6, 1, lang)}${gap}M` : n >= 1e3 ? `${Math.round(n / 1e3)}${gap}k` : `${Math.round(n)}`
}

export const fmtUsd = (usd: number, lang: Lang): string => {
  const n = usd < 10 ? usd.toFixed(2) : usd.toFixed(1)
  return lang === 'en' ? `≈ $${n}` : `≈ ${n.replace('.', ',')} $`
}

/** How full the context is: calm under 60 %, tight under 80 %, then over. */
export const contextStatus = (percent: number | undefined): Status =>
  percent === undefined || percent < 60 ? 'ok' : percent < 80 ? 'tight' : 'over'

/** The context as a block of the limits view: how full it is in tokens, the warning first when nearly full. */
export const contextBlock = (g: Gauge, lang: Lang): Block => {
  const s = WORDS[lang]
  const status = contextStatus(g.percent)
  const tokens = g.tokens !== undefined && g.window ? s.count(fmtTok(g.tokens, lang), fmtTok(g.window, lang)) : s.unknown
  const isWarning = status !== 'ok'
  return {
    key: 'context',
    icon: 'context',
    title: s.context,
    // Nearly full is said only once over: amber alone colors the count.
    detail: status === 'over' ? `${s.full} · ${tokens}` : tokens,
    isWarning,
    figure: g.percent === undefined ? '—' : pctText(g.percent, lang),
    // Drawn as a window that never resets, so its bar has no pace mark.
    window: { kind: 'context', used: g.percent ?? 0, resetsAt: null, isReset: false, elapsed: null, projected: null, hitAt: null, status },
  }
}

/** The limits view's footer, as the agents view's: this session's cost, messages and time so far. */
export const sessionFigures = (g: Gauge, now: number, lang: Lang): [string, string][] => {
  const s = WORDS[lang]
  return [
    [s.cost, g.costUsd === undefined ? '—' : fmtUsd(g.costUsd, lang)],
    [s.messages, g.turns === undefined ? '—' : String(g.turns)],
    [s.time, g.startedAt ? span(Math.max(0, now - g.startedAt), lang) : '—'],
  ]
}

/**
 * A stretch of the quick line, in whole percents of its width: room, or a model or an effort to
 * press. A Box takes no finer share, so a stretch to press is cut again inside: room `inner.left`
 * and the button `inner.width`, in whole percents of the stretch, which puts it within a fraction
 * of a pixel of what it presses.
 */
export type QuickCell = { key: string; width: number; family?: Family; effort?: Effort; inner?: { left: number; width: number } }

/**
 * The quick choice drawn as the folded limits row is, at its width, so it scales as the row does
 * and its words stand as large: the model's name under the title and the models spread along the
 * 5-hour window, from its bar to the end of its note, the one chosen in its color; the effort's
 * name under the week's label, five dots along the week's bar, from its start to its end, filled
 * up to the effort and hollow past it, and the effort's word ending where the week's note does.
 * `ws` are the windows the row draws, which place its bars; without them, bars without notes.
 * `cells` cut the line for the blank buttons laid over it, each fitted to its word or dot.
 */
export const quickLine = (
  d: Draft,
  families: readonly Family[],
  isOff: boolean,
  ws: readonly Window[],
  now: number,
  W: number,
  lang: Lang,
): { source: string; alt: string; cells: QuickCell[] } => {
  const s = WORDS[lang]
  const shown = ws.length >= 2 ? ws : PLACEHOLDERS
  const [fiveHour, week] = rowBars(shown.slice(0, 2), W, now, lang)
  const b1 = fiveHour ?? { start: 0, labelX: 0, end: W / 2, label: '', labelW: 0, barX: 0, barW: W / 2, noteW: 0 }
  const b2 = week ?? { start: W / 2, labelX: W / 2, end: W, label: '', labelW: 0, barX: W / 2, barW: W / 2, noteW: 0 }
  const mid = ROW_H / 2
  const y = mid + 4.5
  const color = d.family ? COLOR[d.family] : '#75736c'
  let body = text(0, y, 't', 13, s.model, ' font-weight="600"')
  const hits: { from: number; to: number; key: string; family?: Family; effort?: Effort }[] = []

  // The models: the first from the 5-hour bar on, the last ending where its note does.
  const widths = families.map(f => textWidth(NAME[f], 13, f === d.family))
  const free = b1.end - b1.barX - widths.reduce((a, b) => a + b, 0)
  const gap = families.length > 1 ? Math.max(8, free / (families.length - 1)) : 0
  families.reduce((x, f, i) => {
    const w = widths[i] ?? 0
    body += f === d.family ? text(x, y, 'c', 13, NAME[f], ` font-weight="700" fill="${COLOR[f]}"`) : text(x, y, 'm', 13, NAME[f])
    if (f !== d.family) hits.push({ from: x - 3, to: x + w + 3, key: `quick-cell-${f}`, family: f })
    return x + w + gap
  }, b1.barX)

  // The effort: a rule before it, as between the row's windows; its five dots along the week's
  // bar, its word at the week's end.
  body += `<rect class="sp" x="${(b2.start - SEP / 2 - 0.5).toFixed(1)}" y="${mid - 9}" width="1" height="18"/>`
  body += text(b2.labelX, y, 't', 12.5, s.effort, ' font-weight="600"')
  const R = 5
  const step = Math.max(14, (b2.barW - 2 * R) / (EFFORTS.length - 1))
  const cx = EFFORTS.map((_, i) => b2.barX + R + i * step)
  const level = isOff || !d.effort ? 0 : EFFORTS.indexOf(d.effort) + 1
  if (isOff) body += text(b2.barX, y, 'm', 12, s.off)
  else {
    cx.slice(1).forEach((x, i) => {
      const from = (cx[i] ?? 0) + R + 3
      const paint = i + 1 < level ? `fill="${color}"` : 'class="k"'
      body += `<rect ${paint} x="${from.toFixed(1)}" y="${mid - 1}" width="${Math.max(0, x - R - 3 - from).toFixed(1)}" height="2" rx="1"/>`
    })
    const half = Math.min(R + 4, step / 2)
    cx.forEach((x, i) => {
      body +=
        i < level
          ? `<circle cx="${x.toFixed(1)}" cy="${mid}" r="${R}" fill="${color}"/>`
          : `<circle cx="${x.toFixed(1)}" cy="${mid}" r="${R - 0.75}" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity=".7"/>`
      const e = EFFORTS[i]
      if (e) hits.push({ from: x - half, to: x + half, key: `quick-cell-${e}`, effort: e })
    })
    body += d.effort
      ? text(b2.end, y, 'c', 13, effortWord(d.effort, lang), ` font-weight="700" fill="${color}" text-anchor="end"`)
      : text(b2.end, y, 'm', 13, '—', ' text-anchor="end"')
  }

  // The cells: whole percents of the line, each one to press cut again to its word or dot.
  const cells: QuickCell[] = []
  let at = 0
  for (const h of hits) {
    const from = Math.max(0, h.from)
    const to = Math.min(W, h.to)
    const a = Math.max(at, Math.floor((from / W) * 100))
    const b = Math.max(a + 1, Math.ceil((to / W) * 100))
    if (a > at) cells.push({ key: `quick-room-${cells.length}`, width: a - at })
    const span = ((b - a) / 100) * W
    const left = Math.max(0, Math.round(((from - (a / 100) * W) / span) * 100))
    const width = Math.max(1, Math.min(100 - left, Math.round(((to - from) / span) * 100)))
    cells.push({ key: h.key, ...(h.family ? { family: h.family } : {}), ...(h.effort ? { effort: h.effort } : {}), width: b - a, inner: { left, width } })
    at = b
  }
  const said = [d.family ? `${s.model} ${NAME[d.family]}` : '', isOff ? `${s.effort} ${s.off}` : d.effort ? `${s.effort} ${effortWord(d.effort, lang)}` : '']
  return { source: svg(W, ROW_H, body), alt: said.filter(Boolean).join(' · ') || s.model, cells }
}

// The windows that place the line's bars before any reading: no notes, so bars to the groups' ends.
const PLACEHOLDERS: Window[] = ['five_hour', 'seven_day'].map(kind => ({
  kind,
  used: 0,
  resetsAt: null,
  isReset: false,
  elapsed: null,
  projected: null,
  hitAt: null,
  status: 'ok',
}))
