// The model, the effort and the session outside a view of their own: the context's block and
// the session's figures in the limits view; the quick choice's line under the bar.
import type { Draft, Effort, Family, Gauge, Lang } from '../types'
import { pct as pctText, rowBars, rowShown, SEP, span, svg, text, textWidth } from './limits'
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

/**
 * The limits view's footer, as the agents view's: this session's cost, messages and time so far;
 * the messages left out where the window is narrow.
 */
export const sessionFigures = (g: Gauge, now: number, lang: Lang, hasMessages = true): [string, string][] => {
  const s = WORDS[lang]
  return [
    [s.cost, g.costUsd === undefined ? '—' : fmtUsd(g.costUsd, lang)],
    ...(hasMessages ? [[s.messages, g.turns === undefined ? '—' : String(g.turns)] as [string, string]] : []),
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

/** One line of the quick choice: its drawing, and the cells the blank buttons laid over it take. */
export type QuickLine = { source: string; cells: QuickCell[] }

/**
 * The quick choice drawn as the folded limits row is, at its width, so it scales as the row does
 * and its words stand as large: the model's name under the title and the models spread along the
 * 5-hour window, from its bar to the end of its note, the one chosen in its color; the effort's
 * name under the week's label, five dots along the week's bar, from its start to its end, filled
 * up to the effort and hollow past it, and the effort's word ending where the week's note does.
 * Where the row has room for the 5-hour session alone, the models take a line and the effort the
 * next, each after its name while the names fit.
 * `ws` are the windows the row draws, which place its bars; without them, bars without notes.
 * Each line's `cells` cut it for the blank buttons laid over it, each fitted to its word or dot.
 */
export const quickLine = (
  d: Draft,
  families: readonly Family[],
  isOff: boolean,
  ws: readonly Window[],
  now: number,
  W: number,
  lang: Lang,
): { lines: QuickLine[]; alt: string } => {
  const s = WORDS[lang]
  const { ws: shown, hasTitle } = rowShown((ws.length >= 2 ? ws : PLACEHOLDERS).slice(0, 2), W, now, lang)
  const [b1, b2] = rowBars(shown, W, now, lang, hasTitle)
  const mid = ROW_H / 2
  const y = mid + 4.5
  const color = d.family ? COLOR[d.family] : '#75736c'
  type Hit = { from: number; to: number; key: string; family?: Family; effort?: Effort }

  // The names of the models with 8px between them, at `size`.
  const modelsW = (size: number): number => families.reduce((sum, f) => sum + textWidth(NAME[f], size, true), 0) + 8 * Math.max(0, families.length - 1)

  // The models, the first from `from` on, the last ending at `to`, the one chosen in its color;
  // smaller where they would not fit at the row's size.
  const models = (from: number, to: number): { body: string; hits: Hit[] } => {
    const hits: Hit[] = []
    let body = ''
    const size = Math.max(9, Math.min(13, (13 * (to - from)) / modelsW(13)))
    const widths = families.map(f => textWidth(NAME[f], size, f === d.family))
    const free = to - from - widths.reduce((a, b) => a + b, 0)
    const gap = families.length > 1 ? Math.max(8, free / (families.length - 1)) : 0
    families.reduce((x, f, i) => {
      const w = widths[i] ?? 0
      body += f === d.family ? text(x, y, 'c', size, NAME[f], ` font-weight="700" fill="${COLOR[f]}"`) : text(x, y, 'm', size, NAME[f])
      if (f !== d.family) hits.push({ from: x - 3, to: x + w + 3, key: `quick-cell-${f}`, family: f })
      return x + w + gap
    }, from)
    return { body, hits }
  }

  // The effort: five dots from `from` to `to`, filled up to it, hollow past it; its word ending at `end`.
  const efforts = (from: number, to: number, end: number): { body: string; hits: Hit[] } => {
    const hits: Hit[] = []
    if (isOff) return { body: text(from, y, 'm', 12, s.off), hits }
    let body = ''
    const R = 5
    const step = Math.max(14, (to - from - 2 * R) / (EFFORTS.length - 1))
    const cx = EFFORTS.map((_, i) => from + R + i * step)
    const level = !d.effort ? 0 : EFFORTS.indexOf(d.effort) + 1
    cx.slice(1).forEach((x, i) => {
      const at = (cx[i] ?? 0) + R + 3
      const paint = i + 1 < level ? `fill="${color}"` : 'class="k"'
      body += `<rect ${paint} x="${at.toFixed(1)}" y="${mid - 1}" width="${Math.max(0, x - R - 3 - at).toFixed(1)}" height="2" rx="1"/>`
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
      ? text(end, y, 'c', 13, effortWord(d.effort, lang), ` font-weight="700" fill="${color}" text-anchor="end"`)
      : text(end, y, 'm', 13, '—', ' text-anchor="end"')
    return { body, hits }
  }

  // The cells: whole percents of the line, each one to press cut again to its word or dot.
  const cellsOf = (hits: readonly Hit[]): QuickCell[] => {
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
    return cells
  }

  const said = [d.family ? `${s.model} ${NAME[d.family]}` : '', isOff ? `${s.effort} ${s.off}` : d.effort ? `${s.effort} ${effortWord(d.effort, lang)}` : '']
  const alt = said.filter(Boolean).join(' · ') || s.model

  // One line while the models fit along the 5-hour window and the dots along the week's bar.
  if (b1 && b2 && modelsW(13) <= b1.end - b1.barX && b2.barW >= 70) {
    // The models along the 5-hour window, a rule as between the row's windows, then the effort's
    // dots along the week's bar and its word at the week's end.
    const m = models(b1.barX, b1.end)
    const e = efforts(b2.barX, b2.barX + b2.barW, b2.end)
    const body =
      text(0, y, 't', 13, s.model, ' font-weight="600"') +
      m.body +
      `<rect class="sp" x="${(b2.start - SEP / 2 - 0.5).toFixed(1)}" y="${mid - 9}" width="1" height="18"/>` +
      text(b2.labelX, y, 't', 12.5, s.effort, ' font-weight="600"') +
      e.body
    return { lines: [{ source: svg(W, ROW_H, body), cells: cellsOf([...m.hits, ...e.hits]) }], alt }
  }

  // Two lines: the names first while the models fit after them, the dots keeping room for the
  // longest effort word so they stay put from one effort to the next.
  const nameW = Math.max(textWidth(s.model, 13, true), textWidth(s.effort, 12.5, true)) + 10
  const x0 = nameW + modelsW(13) <= W ? nameW : 0
  const wordW = Math.max(...EFFORTS.map(e => textWidth(effortWord(e, lang), 13, true)))
  const name = (word: string, size: number): string => (x0 ? text(0, y, 't', size, word, ' font-weight="600"') : '')
  const m = models(x0, W)
  const e = efforts(x0, Math.max(x0 + 70, W - wordW - 10), W)
  return {
    lines: [
      { source: svg(W, ROW_H, name(s.model, 13) + m.body), cells: cellsOf(m.hits) },
      { source: svg(W, ROW_H, name(s.effort, 12.5) + e.body), cells: cellsOf(e.hits) },
    ],
    alt,
  }
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
