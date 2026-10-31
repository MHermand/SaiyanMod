import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Flow, Panel } from '../types'
import { FORM_COLOR, FORMS, mascotSvg } from './mascot'
import type { Form } from './mascot'

const flow = atom({ plugin: 'agents-progress', key: 'flow' } as const, null)
const agents = atom({ plugin: 'agents-progress', key: 'agents' } as const, [])
const panel = atom({ plugin: 'agents-progress', key: 'panel' } as const, {
  isListOpen: false,
  listOffset: 0,
})
const now = atom({ plugin: 'agents-progress', key: 'now' } as const, 0)

const STEP_TOOL = 'mcp__agents-progress__step'
// Added to the end of each subagent's brief: a tool that is merely listed goes
// unused, the same request in the brief is followed.
const STEP_BRIEF = `

Progress reporting: before any other work, call \`${STEP_TOOL}\` with \`total\` (your plan in 3-8 steps) and \`done: 0\`; call it again with \`done\` and a few-word \`note\` as each step finishes. It only draws a progress bar.`
const ACCENT = '#8f8cf4'
const DONE = '#5fbf8f'

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else the
// process locale; English when nothing says French, Hebrew or Russian.

type Lang = 'en' | 'fr' | 'ru' | 'he'

const STRINGS = {
  en: {
    pane: 'Agents',
    cost: 'Cost',
    tokens: 'Tokens',
    time: 'Time',
    collapse: 'Collapse',
    expand: 'Expand',
    running: 'Running',
    finished: 'Finished',
    planned: 'Planned',
    empty: 'No subagents yet.',
    round: 'round',
    failed: 'error',
    after: 'after',
    tokensWord: 'tokens',
    agentsCount: 'agents',
    isRunning: 'running',
    isFinished: 'finished',
    isPlanned: 'planned',
    opened: 'Agents panel opened.',
    closed: 'Agents panel closed.',
    done: 'Done',
    plan: 'Plan',
    design: 'Design',
    tasks: 'Tasks',
    review: 'Review',
    busy: 'running',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  fr: {
    pane: 'Agents',
    cost: 'Coût',
    tokens: 'Tokens',
    time: 'Durée',
    collapse: 'Réduire',
    expand: 'Développer',
    running: 'En cours',
    finished: 'Terminés',
    planned: 'Prévus',
    empty: 'Aucun sous-agent pour l’instant.',
    round: 'tour',
    failed: 'erreur',
    after: 'après',
    tokensWord: 'tokens',
    agentsCount: 'agents',
    isRunning: 'en cours',
    isFinished: 'terminé',
    isPlanned: 'prévu',
    opened: 'Panneau des agents ouvert.',
    closed: 'Panneau des agents fermé.',
    done: 'Terminé',
    plan: 'Plan',
    design: 'Conception',
    tasks: 'Tâches',
    review: 'Revue',
    busy: 'en cours',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'faible', medium: 'moyen', high: 'élevé', xhigh: 'très élevé', max: 'max' },
  },
  ru: {
    pane: 'Агенты',
    cost: 'Стоимость',
    tokens: 'Токены',
    time: 'Время',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    running: 'Работают',
    finished: 'Завершены',
    planned: 'Запланированы',
    empty: 'Субагентов пока нет.',
    round: 'раунд',
    failed: 'ошибка',
    after: 'после',
    tokensWord: 'токенов',
    agentsCount: 'агентов',
    isRunning: 'работает',
    isFinished: 'завершён',
    isPlanned: 'запланирована',
    opened: 'Панель агентов открыта.',
    closed: 'Панель агентов закрыта.',
    done: 'Готово',
    plan: 'План',
    design: 'Дизайн',
    tasks: 'Задачи',
    review: 'Ревью',
    busy: 'в работе',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  he: {
    pane: 'סוכנים',
    cost: 'עלות',
    tokens: 'טוקנים',
    time: 'זמן',
    collapse: 'כיווץ',
    expand: 'הרחבה',
    running: 'פועלים',
    finished: 'הסתיימו',
    planned: 'מתוכננים',
    empty: 'עדיין אין סוכנים.',
    round: 'סבב',
    failed: 'שגיאה',
    after: 'אחרי',
    tokensWord: 'טוקנים',
    agentsCount: 'סוכנים',
    isRunning: 'פועל',
    isFinished: 'הסתיים',
    isPlanned: 'מתוכנן',
    opened: 'חלונית הסוכנים נפתחה.',
    closed: 'חלונית הסוכנים נסגרה.',
    done: 'הושלם',
    plan: 'תכנון',
    design: 'עיצוב',
    tasks: 'משימות',
    review: 'בדיקה',
    busy: 'בעבודה',
    tier: { light: 'קל', medium: 'בינוני', careful: 'זהיר', heavy: 'כבד', fable: 'פייבל', other: 'אחר' },
    effort: { low: 'נמוך', medium: 'בינוני', high: 'גבוה', xhigh: 'גבוה מאוד', max: 'מקסימלי' },
  },
} as const

// Module scope is fine here: session.start sets it again on every (re)load.
let lang: Lang = 'en'
const tr = () => STRINGS[lang]

// Hebrew draws every row mirrored: mascot and title on the right, numbers on the left.
const isRtl = () => lang === 'he'

// Effort words as shown; anything unknown shows as it came.
const effortWord = (effort: string): string => (tr().effort as Record<string, string>)[effort] ?? effort

const isFrench = (v: unknown): boolean => typeof v === 'string' && /^(fr|french|fran[cç]ais)/i.test(v.trim())
const isRussian = (v: unknown): boolean => typeof v === 'string' && /^(ru|russian|рус)/i.test(v.trim())
const isHebrew = (v: unknown): boolean => typeof v === 'string' && /^(he|iw|hebrew|עברית)/i.test(v.trim())
const langOf = (v: unknown): Lang => (isFrench(v) ? 'fr' : isHebrew(v) ? 'he' : isRussian(v) ? 'ru' : 'en')

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'fr' || option === 'ru' || option === 'he') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language)
  } catch {
    // No settings: fall through to the locale.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return langOf(locale)
}

// A batch: the subagents started since the bar was last finished or dismissed.
const blank = (): Flow => ({
  title: tr().pane,
  total: 0,
  done: 0,
  running: 0,
  phase: 'delegate',
  isFinished: false,
  tasks: [],
})

const label = (f: Flow): string => {
  const s = tr()
  if (f.isFinished) return s.done
  if (f.phase === 'plan') return s.plan
  if (f.phase === 'design') return s.design
  const count = f.total ? `${f.done}/${f.total}` : `${f.running} ${s.busy}`
  return `${f.phase === 'review' ? s.review : s.tasks} ${count}`
}

const ratio = (f: Flow): number => (f.isFinished ? 1 : f.total ? f.done / f.total : 0)

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

// The bar is one SVG: the desktop wraps sibling elements onto new lines, so
// title, bar and percent live in one drawing; the mascot, the count and the
// dismiss sit beside it, the mascot right against the count it stands for.
const H = 22
const BAR_H = 16
const CELL = 3
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// CJK, fullwidth forms and emoji advance about 1em; at 0.56em a Chinese title was sized at half its width and the bar drew over it.
// 中日韩文字、全角标点和 emoji 约占 1em；按 0.56em 算时中文标题宽度被低估近一半，进度条会压到标题上。
const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

// Rough advance of system UI text, in em; good enough to size the title's slot.
const charEm = (ch: string): number =>
  WIDE.test(ch) ? 1 : /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZА-ЯЁmwшщжюМШЩЖЮ@%]/.test(ch) ? 0.72 : 0.56

const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

const rowSvg = (f: Flow, W: number): string => {
  // The title takes what it needs, up to 40% of the row; the bar takes the rest.
  const title = fitText(f.title, 13, Math.max(60, W * 0.4))
  const BAR_X = Math.round(16 + textWidth(title, 13) + 12)
  const BAR_W = Math.max(60, W - BAR_X - 46)
  const color = f.isFinished ? DONE : ACCENT
  const y0 = (H - BAR_H) / 2
  const fillW = Math.round(BAR_W * ratio(f))
  const runW = f.total ? Math.round((BAR_W * Math.min(f.total, f.done + f.running)) / f.total) : 0
  const dots: string[] = []
  // Positions are worked out left to right; right to left mirrors each box
  // inside the bar (`bx`) and across the row (`rx`). Text is never mirrored.
  const rtl = isRtl()
  const bx = (x: number, w: number): number => (rtl ? BAR_W - x - w : x)
  const rx = (x: number, w: number): number => (rtl ? W - x - w : x)

  // Dithered fill: sparse at the start, dense toward the head.
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) dots.push(`<rect class="t${Math.floor(noise(r, c) * 4)}" x="${bx(c * CELL + 1, 2)}" y="${r * CELL + 1}" width="2" height="2"/>`)
    }
  }
  // Handed to workers, not yet accepted: a faint second layer.
  const faint: string[] = []
  for (let c = cols; c < Math.floor(runW / CELL); c++) {
    for (let r = 0; r < rows; r++) {
      if (noise(c + 7, r + 3) < 0.2) faint.push(`<rect class="t${Math.floor(noise(r + 5, c) * 4)}" x="${bx(c * CELL + 1, 1.7)}" y="${r * CELL + 1}" width="1.7" height="1.7"/>`)
    }
  }

  const ticks: string[] = []
  for (let i = 1; i < f.total; i++) {
    const x = Math.round((BAR_W * i) / f.total)
    if (x > fillW + 4) ticks.push(`<rect x="${bx(x, 1.5)}" y="${BAR_H / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)
  }

  const text = label(f)
  const pillW = Math.round(18 + text.length * 6.6)
  const pillX = bx(Math.max(0, Math.min(BAR_W - pillW, fillW - pillW)), pillW)
  const percent = `${Math.round(ratio(f) * 100)}%`
  // `direction="rtl"` puts Hebrew words and numbers in reading order; `start` is then the right edge.
  const titleAt = rtl ? `x="${W - 16}" direction="rtl" text-anchor="start"` : 'x="16"'
  const percentAt = rtl ? `x="6" y="${H / 2 + 4.5}"` : `x="${W - 6}" y="${H / 2 + 4.5}" text-anchor="end"`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
/* Pixels twinkle in four out-of-phase groups; a finished bar settles to a slow glow. */
.t0,.t1,.t2,.t3{animation:tw ${f.isFinished ? 3.2 : 2.2}s ease-in-out infinite}
.t1{animation-duration:${f.isFinished ? 3.8 : 2.8}s;animation-delay:-.7s}.t2{animation-duration:${f.isFinished ? 4.4 : 1.9}s;animation-delay:-1.3s}.t3{animation-duration:${f.isFinished ? 3.5 : 3.3}s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${f.isFinished ? 0.8 : 0.3}}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
<circle cx="${rtl ? W - 5 : 5}" cy="${H / 2}" r="4" fill="${color}"/>
<text class="t" ${titleAt} y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${xml(title)}</text>
<g transform="translate(${rx(BAR_X, BAR_W)},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c)">
<g fill="${color}">${dots.join('')}</g>
<g fill="${color}" opacity="0.45">${faint.join('')}</g>
<g class="tk">${ticks.join('')}</g>
</g>
<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle"${rtl ? ' direction="rtl"' : ''} font-family="${FONT}" font-size="11" font-weight="600" fill="#ffffff">${xml(text)}</text>
</g>
<text class="m" ${percentAt} font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${percent}</text>
</svg>`
}

const barText = (f: Flow, width: number): string => {
  const filled = Math.round(width * ratio(f))
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// ---------------------------------------------------------------------------
// Agents panel: every subagent of the session, plus the tasks the flow planned.

// "Opus 5.5 · low" for a run, or just the model when no effort was seen.
const runModel = (a: AgentRun): string => (a.effort ? `${modelName(a.model)} · ${effortWord(a.effort)}` : modelName(a.model))

// USD per million tokens: input, output, cache read, cache write. The first row that
// matches a model id wins, so a release sits above its family.
// The engine reports tokens, not money, so the panel's cost is an estimate. It reports
// one cache-write count with no split by lifetime; writes are priced at the 1-hour
// rate (2x input), which is what Claude Code writes on a subscription.
type Price = [input: number, output: number, cacheRead: number, cacheWrite: number]

const PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, [10, 50, 0.25, 20]],
  [/fable|mythos/, [10, 50, 1, 20]],
  [/opus-5-5/, [4, 20, 0.2, 8]],
  [/opus/, [5, 25, 0.5, 10]],
  [/sonnet-5-5/, [2, 10, 0.1, 4]],
  [/sonnet-5/, [2, 10, 0.2, 4]],
  [/sonnet/, [3, 15, 0.3, 6]],
  [/haiku-5-5/, [0.1, 0.5, 0.01, 0.2]],
  [/haiku/, [1, 5, 0.1, 2]],
]

// Haiku 5.5 is priced by prompt length: a request whose prompt (input, cache reads and
// cache writes together) is over 100,000 tokens pays these prices instead.
const HAIKU_LONG_PROMPT = 100_000
const HAIKU_LONG: Price = [0.5, 2.5, 0.05, 1]

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const priceOf = (model: string, prompt: number): Price => {
  const id = model.toLowerCase()
  if (prompt > HAIKU_LONG_PROMPT && /haiku-5-5/.test(id)) return HAIKU_LONG
  return PRICES.find(([re]) => re.test(id))?.[1] ?? [4, 20, 0.2, 8]
}

// `isRequest` says the usage is one model request, which is what a prompt-length price
// is set by; a turn's sum is priced at the model's ordinary prices.
const costOf = (model: string, u: Usage, isRequest: boolean): number => {
  const prompt = isRequest ? (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) : 0
  const [i, o, r, w] = priceOf(model, prompt)
  return (
    ((u.input_tokens || 0) * i +
      (u.output_tokens || 0) * o +
      (u.cache_read_input_tokens || 0) * r +
      (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

// Haiku 4.5 and the Claude 3 models have a 200K window; the rest, Haiku 5.5 included, 1M.
const windowOf = (model: string): number => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

// A span for the totals line, in words rather than a clock: "45 s", "2 min 05 s", "1 h 05 min".
const fmtSpan = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`
}

const elapsed = (a: AgentRun, at: number): number => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

const totals = (list: AgentRun[], at: number) => {
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = list.reduce((s, a) => s + a.tokens, 0)
  const start = Math.min(...list.map(a => a.startedAt))
  const end = Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt)))
  return { cost, tokens, time: list.length ? end - start : 0 }
}

// --- desktop drawings: each row's text is one SVG, as the band above the prompt is; the
// mascot is a drawing of its own beside it, so the row's redraw each second leaves its motion be.

const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#ecebe8}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}}
</style>`

const CLAY = '#D97757'

// The form each model family takes, from the weakest to the strongest; `register`
// applies the form options over it.
const forms: Record<string, Form> = { haiku: 'base', sonnet: 'charged', opus: 'super', fable: 'ultimate' }

const formOf = (model: string): Form => {
  const family = /(fable|mythos|opus|sonnet|haiku)/i.exec(model)?.[1]?.toLowerCase().replace('mythos', 'fable')
  return (family && forms[family]) || 'base'
}

const colorOf = (model: string): string => FORM_COLOR[formOf(model)]

// Rows are laid out left to right; in Hebrew each box mirrors across the
// row (`mx`) and text hugs the mirrored side. `words` text may hold Hebrew and
// takes `direction="rtl"` (whose `start` is the right edge); numbers stay
// left to right so "≈$0.25" keeps its order.
const mx = (W: number, x: number, w = 0): number => (isRtl() ? W - x - w : x)

// Text that starts at x: left-aligned, or right-aligned at the mirrored x.
const startText = (W: number, x: number, y: number, words = true): string =>
  !isRtl()
    ? `x="${x}" y="${y}"`
    : `x="${W - x}" y="${y}"${words ? ' direction="rtl" text-anchor="start"' : ' text-anchor="end"'}`

// Text that ends at x: right-aligned, or left-aligned at the mirrored x.
const endText = (W: number, x: number, y: number, words = false): string =>
  !isRtl() ? `x="${x}" y="${y}" text-anchor="end"` : `x="${W - x}" y="${y}"${words ? ' direction="rtl" text-anchor="end"' : ''}`

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${body}</svg>`

// The task's own progress when the worker reports steps; a finished run is full.
const progressOf = (a: AgentRun): number | null => {
  if (a.status === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)
  return null
}

const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

const ROW_H = 46

// One agent's text on two lines: its name; model, effort and steps, then cost, tokens and
// time; then the bar, the agent's steps in its color, or its context in grey.
const agentSvg = (W: number, a: AgentRun, at: number): string => {
  const s = tr()
  const color = colorOf(a.model)
  const ctx = ctxOf(a)
  const progress = progressOf(a)
  const X = 0
  const textW = W
  const right = `≈${fmtCost(a.costUsd)} · ${fmtTokens(a.tokens)} ${s.tokensWord} · ${fmtSpan(elapsed(a, at))}`
  const meta = [runModel(a)]
  if (a.stepTotal) meta.push(`${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' ' + a.stepNote : ''}`)
  if (a.round > 1) meta.push(`${s.round} ${a.round}`)
  if (a.status === 'failed') meta.push(s.failed)
  const fillW = Math.round(textW * (progress ?? ctx / 100))
  const fill = a.status === 'failed' ? ' fill="#D0453F"' : progress === null ? ' class="m"' : ` fill="${color}"`
  return svg(
    W,
    ROW_H,
    `<text class="t" ${startText(W, X, 15)} font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(a.description || a.type, 13, textW))}</text>
<text class="s" ${startText(W, X, 31)} font-family="${FONT}" font-size="11">${xml(fitText(meta.join(' · '), 11, textW - textWidth(right, 11) - 12))}</text>
<text class="s" ${endText(W, W, 31)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${right}</text>
<rect class="k" x="${mx(W, X, textW)}" y="38" width="${textW}" height="3" rx="1.5"/><rect x="${mx(W, X, fillW)}" y="38" width="${fillW}" height="3" rx="1.5"${fill}/>`,
  )
}

// --- terminal drawing: the same rows in text.

const ctxBar = (pct: number, width: number): string => {
  const filled = Math.round((width * pct) / 100)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// Folds the agents list under the bar out or in; true when it ends up open.
async function toggleList($: EngineInterface): Promise<boolean> {
  const at = await $.clock.now()
  await update($, now, () => at)
  const next = await update($, panel, prev => ({ ...prev, isListOpen: !prev.isListOpen, listOffset: 0 }))
  return next.isListOpen
}

// Where a prompt the person sent comes from: their own Enter, the desktop app,
// the phone bridge or an SDK host. Every other origin is a notification or a message.
const PERSON_ORIGINS = new Set(['human', 'composer', 'bridge', 'sdk'])

// The list shows LIST_ROWS agents at a time; the arrows by the summary move it.
const LIST_ROWS = 3

const scrollList = ($: EngineInterface, by: number, count: number) =>
  update($, panel, prev => ({ ...prev, listOffset: Math.max(0, Math.min(count - LIST_ROWS, (prev.listOffset ?? 0) + by)) }))

export const register: Register = (on, options) => {
  for (const family of ['haiku', 'sonnet', 'opus', 'fable']) {
    const chosen = FORMS.find(f => f === options[`form${family.charAt(0).toUpperCase()}${family.slice(1)}`])
    if (chosen) forms[family] = chosen
  }
  // Each prompt the person sends folds the list in and notes the agents running
  // then; the next agent spawned drops the rest, so the list holds this turn's.
  // The bar stays as it is until then, or until ✕. Agents' notifications and
  // other sessions' messages enter as prompts too, under their own origin.
  on('prompt.submit', async ($, e, next) => {
    const kind: string = e.origin?.kind ?? 'unclassified'
    const sent = await next(e)
    if (sent.drop !== undefined || !PERSON_ORIGINS.has(kind)) return sent
    const running = (await read($, agents)).filter(a => a.status === 'running').map(a => a.id)
    await update($, panel, () => ({ isListOpen: false, listOffset: 0, keepIds: running }))
    return sent
  })

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($, options.language)
    await $.tool.register({
      name: 'step',
      description:
        'For subagents: report progress on your own task to the agents panel. ' +
        'Right after reading the brief, call it with `total` (your plan in 3-8 steps) and `done: 0`; ' +
        'call it again as each step finishes. Cheap and silent: it only draws a bar.',
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
          total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
          note: { type: 'string', description: 'The step in progress, a few words.' },
        },
        required: ['done'],
      },
      // In every agent's tool list, not behind ToolSearch: workers do not go looking for it.
      isDeferred: false,
    })
    await $.command.register({
      name: 'agents-info',
      description: 'Show or hide the list of subagents under the progress bar: running and finished, with model, context, cost and time',
    })

    // Ticks the running agents' clocks; quiet when nothing runs.
    $.clock.every(1000, () => {
      void (async () => {
        const list = await read($, agents)
        if (!list.some(a => a.status === 'running')) return
        const at = await $.clock.now()
        await update($, now, () => at)
      })()
    })
    return started
  })

  on('command.run', { command: 'agents-info' }, async $ => {
    const isOpen = await toggleList($)
    return { text: isOpen ? tr().opened : tr().closed }
  })

  // A worker's own progress: the call runs in the worker's loop, so agentId names it.
  on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
    const input = e as unknown as { done?: number; total?: number; note?: string }
    const agentId = e.agentId
    if (!agentId) return { result: 'ignored: only subagents report steps' }
    let matched = false
    await update($, agents, list =>
      list.map(a => {
        if (a.agentId !== agentId) return a
        matched = true
        const total = Math.max(0, Math.round(input.total ?? a.stepTotal ?? 0))
        const done = Math.max(0, Math.round(input.done ?? a.stepDone ?? 0))
        return { ...a, stepTotal: total, stepDone: total ? Math.min(total, done) : done, stepNote: input.note?.trim() || undefined }
      }),
    )
    return { result: matched ? 'ok' : `ignored: no panel row for agent ${agentId}` }
  })

  on('agent.spawn', async ($, e, next) => {
    const isUnbriefed = !e.prompt.includes(STEP_TOOL)
    const started = await next(isUnbriefed ? { ...e, prompt: e.prompt + STEP_BRIEF } : e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    // First agent since the person's prompt: keep only the agents running when it was sent.
    const keepIds = (await read($, panel)).keepIds
    if (keepIds) {
      const kept = await update($, agents, list => list.filter(a => keepIds.includes(a.id)))
      await update($, panel, prev => ({ isListOpen: prev.isListOpen, listOffset: 0 }))
      const running = kept.filter(a => a.status === 'running').length
      await update($, flow, () => (kept.length ? { ...blank(), total: kept.length, running, done: kept.length - running } : null))
    }
    await update($, agents, list => {
      const round = 1 + list.filter(a => norm(a.description) === norm(e.description) && e.description).length
      const run: AgentRun = {
        id: started.agentId ?? e.tool_use_id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        round,
      }
      return [...list.filter(a => a.id !== run.id), run].slice(-200)
    })
    await update($, now, () => at)
    // Every subagent counts in the bar; a finished or dismissed bar starts a new batch.
    await update($, flow, prev => {
      const base = prev && !prev.isFinished ? prev : blank()
      return { ...base, total: base.total + 1, running: base.running + 1 }
    })
    return started
  })

  // Each model request of a subagent: live context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const usage = result.usage
    if (!agentId || !usage) return result

    const model = usage.model || e.model
    await update($, agents, list =>
      list.map((a): AgentRun =>
        a.agentId !== agentId
          ? a
          : {
              ...a,
              model,
              effort: typeof e.effort === 'string' ? e.effort : a.effort,
              status: 'running',
              endedAt: undefined,
              contextTokens:
                (usage.input_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0) +
                (usage.output_tokens || 0),
              contextMax: windowOf(model),
              tokens:
                a.tokens +
                (usage.input_tokens || 0) +
                (usage.output_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0),
              costUsd: a.costUsd + costOf(model, usage, true),
              steps: a.steps + 1,
            },
      ),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      let wasRunning = false
      await update($, agents, list =>
        list.map((a): AgentRun => {
          if (a.agentId !== agentId) return a
          wasRunning = a.status === 'running'
          // A run whose steps went unseen still gets the turn's own sum.
          const fallback = a.steps === 0 && e.usage
          return {
            ...a,
            status: e.reason === 'answer' ? 'done' : 'failed',
            endedAt: at,
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || a.model,
                  tokens:
                    e.usage.input_tokens +
                    e.usage.output_tokens +
                    e.usage.cache_read_input_tokens +
                    e.usage.cache_creation_input_tokens,
                  costUsd: costOf(e.usage.model || a.model, e.usage, false),
                }
              : {}),
          }
        }),
      )
      // The batch is done once none of its subagents still runs.
      if (wasRunning) {
        await update($, flow, prev => {
          if (!prev || prev.isFinished) return prev
          const running = Math.max(0, prev.running - 1)
          return { ...prev, running, done: Math.min(prev.total, prev.done + 1), isFinished: running === 0 }
        })
      }
      await update($, now, () => at)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, flow)
    if (f === null || e.props.hasSurvey) return next(e)
    // Draw this row with the other mods' bands beneath it. Claude Code's own placeholder ({ type: 'engine' }) is
    // never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const p: Panel = await read($, panel)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)
    const isWorking = list.some(a => a.status === 'running')
    // Newest first: the bar under each says whether it still runs.
    const shown = [...list].reverse()
    const t = totals(list, at)
    // The totals line: each figure under its name, the names dim and the figures bold.
    const figures: [string, string][] = [
      [s.cost, `≈${fmtCost(t.cost)}`],
      [s.tokens, fmtTokens(t.tokens)],
      [s.time, fmtSpan(t.time)],
    ]
    const offset = Math.max(0, Math.min(shown.length - LIST_ROWS, p.listOffset ?? 0))
    const page = shown.slice(offset, offset + LIST_ROWS)
    // Under the list: the turn's totals, set apart, and the arrows when more agents than rows.
    const footer = (
      <Box key="footer" flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" gap={1} marginTop={2}>
        <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" gap={3}>
          {figures.map(([name, value]) => (
            <Box key={name} flexDirection={isRtl() ? 'row-reverse' : 'row'} gap={1}>
              <Text dimColor>{name}</Text>
              <Text bold>{value}</Text>
            </Box>
          ))}
        </Box>
        {shown.length > LIST_ROWS && (
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Button key="savvy-up" label="▲" plain onPress={() => void scrollList($, -LIST_ROWS, shown.length)} />
            <Text dimColor>{`${offset + 1}–${offset + page.length} / ${shown.length}`}</Text>
            <Button key="savvy-down" label="▼" plain onPress={() => void scrollList($, LIST_ROWS, shown.length)} />
          </Box>
        )}
      </Box>
    )

    // The arrow by the dismiss folds the agents list out under the bar, and back in;
    // the count stands with the mascot, as a label.
    const count = `×${list.length}`
    const arrow = p.isListOpen ? '▼' : isRtl() ? '◀' : '▶'
    const crewButton = <Button key="savvy-agents" label={arrow} plain onPress={() => void toggleList($)} />
    const percent = `${Math.round(ratio(f) * 100)}%`
    const dismiss = (
      <Button
        key="savvy-dismiss"
        label="✕"
        plain
        role="dismiss"
        onPress={() => update($, flow, () => null)}
      />
    )

    // The terminal's element table is completed with an `Svg` that draws nothing: test the surface too.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      // Drawn a little wider than the slot is likely to be, without a width: the
      // surface scales it down to the room the count and the dismiss leave.
      const cols = e.props.bodyColumns || 100
      const width = Math.max(180, Math.min(1600, cols * 9 - 80))
      const W = Math.max(240, Math.min(1600, cols * 9 - 16))
      // The bar wears the head of the strongest model among this turn's agents (those running when
      // the person sent the prompt, and those started since), done or not; the later one on a tie.
      const rank = (a: AgentRun): number => FORMS.indexOf(formOf(a.model))
      const lead = list.reduce<AgentRun | undefined>((best, a) => (!best || rank(a) >= rank(best) ? a : best), undefined)
      const details = !p.isListOpen ? null : (
        <Box key="list" flexDirection="column" alignItems={isRtl() ? 'flex-end' : undefined} marginTop={2}>
          {page.map(a => (
            <Box key={a.id} flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" gap={1}>
              <Svg source={mascotSvg(formOf(a.model), 30, a.status === 'running', 'a')} alt={runModel(a)} width={30} height={30} />
              <Box flexGrow={1} flexShrink={1}>
                <Svg source={agentSvg(W - 40, a, at)} alt={`${a.description}: ${runModel(a)}, ${a.status === 'running' ? s.isRunning : s.isFinished}`} />
              </Box>
            </Box>
          ))}
          {footer}
        </Box>
      )
      return (
        <Box flexDirection="column">
          <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" gap={1}>
            <Box flexGrow={1} flexShrink={1}>
              <Svg source={rowSvg(f, width)} alt={`${f.title}: ${label(f)}, ${percent}`} />
            </Box>
            <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" flexShrink={0} gap={0}>
              <Svg source={mascotSvg(lead ? formOf(lead.model) : 'base', 22, isWorking, 'c')} alt={lead ? runModel(lead) : s.pane} width={22} height={22} />
              <Text>{count}</Text>
            </Box>
            <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" flexShrink={0}>
              {crewButton}
              {dismiss}
            </Box>
          </Box>
          {details}
          {below}
        </Box>
      )
    }

    // Terminal: the same content in text rows.
    const cols = e.props.bodyColumns
    const titleW = Math.max(8, Math.min(30, f.title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 32))
    const barW = Math.max(6, Math.min(20, cols - 34))
    const row = (a: AgentRun) => {
      const color = colorOf(a.model)
      const ctx = ctxOf(a)
      const progress = progressOf(a)
      const steps = a.stepTotal ? ` · ${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' ' + a.stepNote : ''}` : ''
      return (
        <Box key={a.id} flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Text color={color}>▣</Text>
            <Text bold wrap="truncate-end">
              {a.description || a.type}
            </Text>
            <Text dimColor wrap="truncate-end">
              {runModel(a)}
              {steps}
            </Text>
          </Box>
          <Text wrap="truncate-end">
            {'  '}
            {a.status === 'failed' ? <Text color="red">{ctxBar(100, barW)}</Text> : progress === null ? <Text dimColor>{ctxBar(ctx, barW)}</Text> : <Text color={color}>{ctxBar(progress * 100, barW)}</Text>}
            <Text dimColor>
              {' '}
              ≈{fmtCost(a.costUsd)} · {fmtTokens(a.tokens)} {s.tokensWord} · {fmtSpan(elapsed(a, at))}
            </Text>
          </Text>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Box width={titleW} flexShrink={0}>
            <Text color={f.isFinished ? DONE : ACCENT}>● </Text>
            <Text wrap="truncate-end">{f.title}</Text>
          </Box>
          <Text color={f.isFinished ? DONE : ACCENT}>{barText(f, width)}</Text>
          <Text bold>{label(f)}</Text>
          <Text dimColor>{percent}</Text>
          <Text color={CLAY}>▣{count}</Text>
          {crewButton}
          {dismiss}
        </Box>
        {p.isListOpen && (
          <Box key="list" flexDirection="column" marginTop={1}>
            {page.map(row)}
            {footer}
          </Box>
        )}
        {below}
      </Box>
    )
  })
}
