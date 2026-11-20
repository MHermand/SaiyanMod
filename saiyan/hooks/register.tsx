import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, AgentsPanel, Draft, Effort, Family, Flow, Gauge, Lang, Limit, Reading, View } from '../types'
import {
  ACCENT,
  agentSvg,
  barText,
  blank,
  CLAY,
  colorOf,
  contextWindowOf,
  costOf,
  ctxBar,
  ctxOf,
  DONE,
  elapsed,
  fmtCost,
  fmtSpan,
  fmtTokens,
  formOf,
  forms,
  isLang as isAgentsLang,
  isRtl,
  label,
  norm,
  progressOf,
  ratio,
  rowSvg as agentsRowSvg,
  runModel,
  setAgentsLang,
  stepsOf,
  totals,
  tr,
} from './agents'
import type { Lang as AgentsLang } from './agents'
import {
  ago,
  alertText,
  blockSvg,
  cellBar,
  dueAlerts,
  firedKeys,
  headline,
  headSvg,
  iconSvg,
  limitsOf,
  liveFired,
  mainWindows,
  nameOf,
  pct,
  rowNote,
  rowSvg as usageRowSvg,
  summary,
  windowBlock,
  windowOf,
  words as usageWords,
  worst,
} from './limits'
import type { Status, Window } from './limits'
import { FORMS, mascotSvg } from './mascot'
import { contextBlock, quickLine as drawQuick, sessionFigures, viewWords } from './model'
import {
  aliasOf,
  COLOR,
  EFFORTS,
  effortWord,
  FAMILIES,
  familiesIn,
  familyOf,
  isBarKey,
  isEffort,
  moveOf,
  NAME,
  stepIn,
  words as modelWords,
} from './switch'
import type { Move } from './switch'

// --- the bar.
const view = atom({ plugin: 'saiyan', key: 'view' } as const, 'usage')
const isShown = atom({ plugin: 'saiyan', key: 'isShown' } as const, false)
const isUnfolded = atom({ plugin: 'saiyan', key: 'isUnfolded' } as const, false)
const draft = atom({ plugin: 'saiyan', key: 'draft' } as const, null)
const isPicking = atom({ plugin: 'saiyan', key: 'isPicking' } as const, false)
const language = atom({ plugin: 'saiyan', key: 'lang' } as const, 'en')
// --- the agents view.
const flow = atom({ plugin: 'saiyan', key: 'flow' } as const, null)
const agents = atom({ plugin: 'saiyan', key: 'agents' } as const, [])
const agentsPanel = atom({ plugin: 'saiyan', key: 'agentsPanel' } as const, { listOffset: 0 })
const now = atom({ plugin: 'saiyan', key: 'now' } as const, 0)
// --- the usage view.
const reading = atom({ plugin: 'saiyan', key: 'reading' } as const, null)
// --- the model and the effort: the mascot's form, the quick choice, Option+M and Option+E.
const current = atom({ plugin: 'saiyan', key: 'current' } as const, { family: null, effort: null, noEffort: [] })
// The context's fill, the cost and the prompts so far, as the engine last measured them.
const gauge = atom({ plugin: 'saiyan', key: 'gauge' } as const, {})

const VIEWS: readonly View[] = ['usage', 'agents']
const isView = (v: unknown): v is View => VIEWS.includes(v as View)

// Store keys, shared by the views: the bar's language, the last usage reading and the
// alerts shown, the effort last seen.
const LANG_KEY = 'language'
const READING_KEY = 'reading'
const FIRED_KEY = 'fired'
const EFFORT_KEY = 'effort'

// The flag cycles these; its pick is kept in the store, across sessions.
const FLAGS: readonly [Lang, string][] = [['en', '🇺🇸'], ['fr', '🇫🇷'], ['es', '🇪🇸']]

// Presses closer than this make one change, so a run of them asks the engine once.
const APPLY_MS = 500
const TICK_MS = 30_000
const ALERT_MS = 8_000
// The list shows LIST_ROWS agents at a time; the arrows by the summary move it.
const LIST_ROWS = 3
// Unfolded on desktop, every view draws the same body under its head, so the bar keeps its
// height from one view to the next: the agents list's rows, in pixels, then the footer.
const ROW_PX = 46
const BODY_PX = LIST_ROWS * ROW_PX
// Room left empty in that body: an SVG as tall as it, since a Box counts in text rows. Drawn as
// the rows are, wide and holding a shape, with a non-empty alt: the desktop drew a 1-pixel-wide
// empty one with an empty alt shorter than asked.
const blankSvg = (w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="none"/></svg>`

const STEP_TOOL = 'mcp__saiyan__step'
// Added to the end of each subagent's brief: a tool that is merely listed goes
// unused, the same request in the brief is followed.
const STEP_BRIEF = `

Progress reporting: before any other work, call \`${STEP_TOOL}\` with \`total\` (your plan in 3-8 steps) and \`done: 0\`; call it again with \`done\` and a few-word \`note\` as each step finishes. It only draws a progress bar.`

// Where a prompt the person sent comes from: their own Enter, the desktop app,
// the phone bridge or an SDK host. Every other origin is a notification or a message.
const PERSON_ORIGINS = new Set(['human', 'composer', 'bridge', 'sdk'])

// The terminal's colors for the usage states; the desktop's are in the SVGs.
const STATUS_COLOR: Record<Status, string> = { ok: '#5bbe8a', tight: '#e7ae45', over: '#ef6b5f' }

// Module scope is fine here: session.start sets it again on every (re)load.
let lang: AgentsLang = 'en'
let isDesktop = false
let isAlerting = true
let ticker: { cancel: () => void } | null = null
let secondTicker: { cancel: () => void } | null = null
// Says what Option+M and Option+E chose once their presses stop.
let toldTimer: { cancel: () => void } | null = null
// What the quick choice changed, taken as the person's message left: each request of that turn
// goes on it, and the turn's end makes it the session's.
let switching: { model?: string; effort?: Effort } | null = null
let families: Family[] = [...FAMILIES]
let modelOptions: readonly string[] | undefined
let usesLong = false

// A model or effort change waiting to be asked for, or asked for and not yet run:
// what a request reports meanwhile is older than the choice.
const applyTimers: { model?: { cancel: () => void }; effort?: { cancel: () => void } } = {}
const inFlight = { model: 0, effort: 0 }

// The usage view and the quick choice speak English where the agents view speaks Russian or Hebrew.
const lang3 = (l: AgentsLang): Lang => (l === 'fr' || l === 'es' ? l : 'en')

// A language named in words or as a code; English for any other.
const langOf = (v: string): AgentsLang =>
  /^(fr|fran)/i.test(v) ? 'fr' : /^(es|span|espa)/i.test(v) ? 'es' : /^ru/i.test(v) ? 'ru' : /^he/i.test(v) ? 'he' : 'en'

// The flag's last pick; before any, the `language` option; on auto, Claude Code's own
// language setting, then the locale.
const detectLang = async ($: EngineInterface, option: unknown): Promise<AgentsLang> => {
  const picked = await $.store.get(LANG_KEY)
  if (isAgentsLang(picked)) return picked
  if (isAgentsLang(option)) return option
  const rows = await $.config.list().catch(() => [])
  const setting = rows.find(r => r.key === 'language')?.value
  if (typeof setting === 'string' && setting.trim()) return langOf(setting.trim())
  try {
    return langOf(Intl.DateTimeFormat().resolvedOptions().locale)
  } catch {
    return 'en'
  }
}

// Words the bar and its commands in `next`, and keeps the pick for the next sessions.
const useLang = async ($: EngineInterface, next: AgentsLang) => {
  lang = next
  setAgentsLang(next)
  await update($, language, () => lang3(next))
  await update($, flow, prev => (prev ? { ...prev, title: tr().pane } : prev))
  // A usage-limits or agents-progress still installed holds its command: the bar goes on without it.
  await $.command.register({ name: 'limits', description: usageWords(lang3(next)).commandHelp }).catch(() => undefined)
}

// The flag moves on to the next language.
const nextLang = async ($: EngineInterface) => {
  const at = FLAGS.findIndex(([l]) => l === lang)
  const next = FLAGS[(at + 1) % FLAGS.length]?.[0] ?? 'en'
  await $.store.set(LANG_KEY, next)
  await useLang($, next)
}

// ---------------------------------------------------------------------------
// The bar: shown or not, and which view.

// A write of the state redraws the bar only while another band is on show: ask.
const redraw = ($: EngineInterface) => $.ui.invalidate('ui.render')

const showBar = async ($: EngineInterface, v: View) => {
  await update($, view, () => v)
  await update($, isShown, () => true)
  redraw($)
}

// ✕ puts the bar and its quick choice away; what was picked still waits for the next message.
const hideBar = async ($: EngineInterface) => {
  await update($, isShown, () => false)
  await update($, isPicking, () => false)
  redraw($)
}

// A press on the mascot: the quick choice under the bar, from what waits or what the session
// runs on; again, away. What was picked still waits for the next message, unless it changes nothing.
const togglePicking = async ($: EngineInterface) => {
  const c = await read($, current)
  const isOpen = await update($, isPicking, was => !was)
  if (isOpen) await update($, draft, d => d ?? { family: c.family, effort: c.effort })
  else await update($, draft, d => (d && (d.family !== c.family || d.effort !== c.effort) ? d : null))
  redraw($)
}

const pickDraft = async ($: EngineInterface, change: Partial<Draft>) => {
  await update($, draft, d => (d ? { ...d, ...change } : d))
  redraw($)
}

// As the person's next message leaves: what the quick choice changed is taken, and the choice
// closes. No command can run while the message is held (it would wait on its own turn), so that
// turn's requests are sent on the choice (`turn.step`) and its end runs the commands.
const takeDraft = async ($: EngineInterface) => {
  const d = await read($, draft)
  if (!d) return
  await update($, draft, () => null)
  await update($, isPicking, () => false)
  redraw($)
  const c = await read($, current)
  const { family, effort } = d
  const next: { model?: string; effort?: Effort } = {}
  if (family && family !== c.family) {
    next.model = aliasOf(family, modelOptions, usesLong)
    await update($, current, x => ({ ...x, family }))
  }
  if (effort && effort !== c.effort && !(family && c.noEffort.includes(family))) {
    next.effort = effort
    await update($, current, x => ({ ...x, effort }))
    await $.store.set(EFFORT_KEY, effort)
  }
  if (next.model || next.effort) switching = { ...switching, ...next }
}

// The turn's end: the choice becomes the session's, the model first, as /model and /effort.
const settleSwitch = async ($: EngineInterface) => {
  const s = switching
  if (!s) return
  if (s.model) await runNow($, 'model', s.model)
  if (s.effort) await runNow($, 'effort', s.effort)
  if (switching === s) switching = null
}

// Ctrl+A, Option+A: the bar on the usage view, or away.
const toggleBar = async ($: EngineInterface) => ((await read($, isShown)) ? hideBar($) : showBar($, 'usage'))

// An alert takes a hidden bar; a bar the person put on another view is left as it is.
const raise = async ($: EngineInterface, v: View) => {
  if (!(await read($, isShown)) || (await read($, view)) === v) await showBar($, v)
}

// The view the work calls for, without opening a bar the person closed.
const followWork = async ($: EngineInterface, v: View) => {
  await update($, view, () => v)
  redraw($)
}

// The ⇄ before the controls: the other view.
const cycleView = async ($: EngineInterface) => {
  const v = await read($, view)
  await showBar($, VIEWS[(VIEWS.indexOf(v) + 1) % VIEWS.length] ?? 'usage')
}

// Folds the bar's details out or in, for every view; true when it ends up unfolded.
const toggleUnfolded = async ($: EngineInterface): Promise<boolean> => {
  const at = await $.clock.now()
  await update($, now, () => at)
  await update($, agentsPanel, prev => ({ ...prev, listOffset: 0 }))
  return update($, isUnfolded, was => !was)
}

// ---------------------------------------------------------------------------
// The agents view.

const scrollList = ($: EngineInterface, by: number, count: number) =>
  update($, agentsPanel, prev => ({ ...prev, listOffset: Math.max(0, Math.min(count - LIST_ROWS, (prev.listOffset ?? 0) + by)) }))

// ---------------------------------------------------------------------------
// The usage view.

const storedReading = (v: unknown): Reading | null => {
  if (!v || typeof v !== 'object' || typeof (v as Reading).at !== 'number') return null
  const limits = limitsOf((v as Reading).limits)
  return limits.length ? { limits, at: (v as Reading).at } : null
}

// Toasts what each window newly owes, once across sessions, and brings the usage view up.
const alert = async ($: EngineInterface, ws: readonly Window[], at: number) => {
  if (!isAlerting) return
  const fired = liveFired(await $.store.get(FIRED_KEY), at)
  const due = dueAlerts(ws, fired)
  if (!due.length) return
  for (const a of due) {
    fired[a.id] = [...new Set([...(fired[a.id] ?? []), ...firedKeys(a)])]
    $.ui.toast(alertText(a, at, lang3(lang)), { timeoutMs: ALERT_MS })
  }
  await $.store.set(FIRED_KEY, fired)
  await raise($, 'usage')
}

// A fresh reading: drawn, kept for the next session, and checked for alerts.
const take = async ($: EngineInterface, limits: Limit[]) => {
  const at = await $.clock.now()
  const r: Reading = { limits, at }
  await update($, reading, () => r)
  await update($, now, () => at)
  await $.store.set(READING_KEY, r)
  await alert(
    $,
    limits.map(l => windowOf(l, at)),
    at,
  )
}

// ---------------------------------------------------------------------------
// The model and the effort: the quick choice under the bar, Option+M and Option+E.

// Asks the engine for the change now and waits for it: the message about to leave goes on it.
const runNow = async ($: EngineInterface, what: 'model' | 'effort', value: string) => {
  applyTimers[what]?.cancel()
  applyTimers[what] = undefined
  inFlight[what] += 1
  try {
    await $.command.run({ command: what, args: value })
  } catch {
    $.ui.toast(modelWords(lang3(lang)).failed)
  } finally {
    inFlight[what] -= 1
  }
}

// Asks the engine for the change once the presses stop.
const apply = ($: EngineInterface, what: 'model' | 'effort', value: string) => {
  applyTimers[what]?.cancel()
  applyTimers[what] = $.clock.after(APPLY_MS, () => {
    applyTimers[what] = undefined
    inFlight[what] += 1
    void $.command
      .run({ command: what, args: value })
      .catch(() => $.ui.toast(modelWords(lang3(lang)).failed))
      .finally(() => {
        inFlight[what] -= 1
      })
  })
}

const chooseFamily = async ($: EngineInterface, family: Family) => {
  await update($, current, c => ({ ...c, family }))
  apply($, 'model', aliasOf(family, modelOptions, usesLong))
}

const chooseEffort = async ($: EngineInterface, effort: Effort) => {
  await update($, current, c => ({ ...c, effort }))
  await $.store.set(EFFORT_KEY, effort)
  apply($, 'effort', effort)
}

// A toast says what the shortcuts chose, once their presses stop: no view shows it otherwise.
const tell = ($: EngineInterface, text?: string) => {
  toldTimer?.cancel()
  toldTimer = $.clock.after(APPLY_MS, () => {
    toldTimer = null
    void read($, current).then(c => {
      const l = lang3(lang)
      const said = text ?? (c.family ? (c.effort && !c.noEffort.includes(c.family) ? `${NAME[c.family]} · ${viewWords(l).effort.toLowerCase()} ${effortWord(c.effort, l)}` : NAME[c.family]) : '')
      if (said) $.ui.toast(said)
    })
  })
}

const move = async ($: EngineInterface, m: Move) => {
  const c = await read($, current)
  if (m.what === 'model') {
    const family = stepIn(families, c.family, m.dir)
    if (family) await chooseFamily($, family)
    return tell($)
  }
  // A model without an effort setting has nothing to move: the toast says so.
  if (c.family && c.noEffort.includes(c.family)) return tell($, viewWords(lang3(lang)).offNote)
  const effort = stepIn(EFFORTS, c.effort, m.dir)
  if (effort) await chooseEffort($, effort)
  tell($)
}

// What the main thread's request runs on, unless a newer choice is on its way.
const observe = async ($: EngineInterface, model: string, effort: unknown) => {
  const family = familyOf(model)
  const c = await read($, current)
  const isModelFree = !applyTimers.model && inFlight.model === 0
  const isEffortFree = !applyTimers.effort && inFlight.effort === 0
  const nextFamily = isModelFree && family ? family : c.family
  const nextEffort = isEffortFree && isEffort(effort) ? effort : c.effort
  const noEffort =
    family && isModelFree
      ? effort === undefined
        ? [...new Set([...c.noEffort, family])]
        : c.noEffort.filter(f => f !== family)
      : c.noEffort
  const nextModel = isModelFree && family ? model : c.model
  if (nextFamily === c.family && nextEffort === c.effort && noEffort.length === c.noEffort.length && nextModel === c.model) return
  await update($, current, () => ({ family: nextFamily, effort: nextEffort, noEffort, model: nextModel }))
  if (nextEffort && nextEffort !== c.effort) await $.store.set(EFFORT_KEY, nextEffort)
}

// The figures a measure carries, those it lacks left out so the last ones stay.
const measured = (context: { tokens?: number; window?: number; percent?: number } | undefined, cost: { usd: number } | undefined): Gauge => {
  const g: Gauge = {}
  if (context?.tokens !== undefined) g.tokens = context.tokens
  if (context?.window) g.window = context.window
  if (context?.percent !== undefined) g.percent = context.percent
  if (cost) g.costUsd = cost.usd
  return g
}

export const register: Register = (on, options) => {
  isAlerting = options.alerts !== 'off'
  for (const family of ['haiku', 'sonnet', 'opus', 'fable']) {
    const chosen = FORMS.find(f => f === options[`form${family.charAt(0).toUpperCase()}${family.slice(1)}`])
    if (chosen) forms[family] = chosen
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    isDesktop = e.surface === 'desktop'
    await useLang($, await detectLang($, options.language))
    // The bar stands from the session's start, and again after a reload; ✕ puts it away for now.
    await update($, isShown, () => true)
    await update($, draft, () => null)
    await update($, isPicking, () => false)
    await $.command.register({ name: 'saiyan', description: modelWords(lang3(lang)).help, argumentHint: '[usage|agents]', immediate: true })
    await $.command
      .register({
        name: 'agents-info',
        description: 'Show or hide the list of subagents under the progress bar: running and finished, with model, context, cost and time',
      })
      .catch(() => undefined)
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

    // Ticks the running agents' clocks; quiet when nothing runs.
    secondTicker?.cancel()
    secondTicker = $.clock.every(1000, () => {
      void (async () => {
        const list = await read($, agents)
        if (!list.some(a => a.status === 'running')) return
        const at = await $.clock.now()
        await update($, now, () => at)
      })()
    })
    ticker?.cancel()
    ticker = $.clock.every(TICK_MS, () => void $.clock.now().then(t => update($, now, () => t)))

    // The usage: fresh, else the last session's.
    const usage = await $.session.usage().catch(() => null)
    const fresh = limitsOf(usage?.rateLimits)
    if (fresh.length) {
      await take($, fresh)
    } else {
      if (!(await read($, reading))) {
        const stored = storedReading(await $.store.get(READING_KEY))
        if (stored) await update($, reading, () => stored)
      }
      const at = await $.clock.now()
      await update($, now, () => at)
    }

    // The model and effort: the setting's choices, the session's model, the effort last seen.
    const rows = await $.config.list().catch(() => [])
    const row = rows.find(r => r.key === 'model')
    modelOptions = row?.options
    families = familiesIn(modelOptions)
    usesLong = /\[1m\]/.test(String(row?.value ?? ''))
    const model = await $.session.model().catch(() => '')
    const storedEffort = await $.store.get(EFFORT_KEY)
    await update($, current, c => ({
      ...c,
      family: familyOf(model) ?? familyOf(row?.value) ?? c.family,
      effort: c.effort ?? (isEffort(storedEffort) ? storedEffort : null),
      model: model || c.model,
    }))
    const turns = await $.session.turns().catch(() => undefined)
    await update($, gauge, g => ({
      ...g,
      ...measured(usage?.context, usage?.cost),
      startedAt: usage?.startedAt ?? g.startedAt,
      turns: turns ?? g.turns,
    }))
    return started
  })

  // From the prompt box: Option+M and Option+E move the model and the effort, Option+A
  // opens and closes the bar; in the desktop app Ctrl+M, Ctrl+E and Ctrl+A do the same.
  // Each is consumed, so nothing is typed.
  on('prompt.edit', async ($, e, next) => {
    const m = moveOf(e.key, e.inputText, isDesktop)
    if (m) {
      await move($, m)
      return { text: e.text, cursor: e.cursor }
    }
    if (isBarKey(e.key, e.inputText, isDesktop)) {
      await toggleBar($)
      return { text: e.text, cursor: e.cursor }
    }
    return next(e)
  })

  on('command.run', { command: 'saiyan' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    await showBar($, isView(asked) ? asked : 'usage')
    return {}
  })

  // The /model and /effort the quick choice and the shortcuts run print nothing: the change went
  // with the message already, and a line after the answer read as if it came late. Typed, they print.
  for (const what of ['model', 'effort'] as const) {
    on('command.run', { command: what }, async ($, e, next) => {
      const done = await next(e)
      const by = e.origin as { kind?: string; name?: string } | undefined
      return by?.kind === 'plugin' && by.name === 'saiyan' ? { ...done, text: '' } : done
    })
  }

  on('command.run', { command: 'limits' }, async $ => {
    await update($, isUnfolded, () => true)
    await showBar($, 'usage')
    const r = await read($, reading)
    const at = await $.clock.now()
    return {
      text: summary(
        (r?.limits ?? []).map(l => windowOf(l, at)),
        at,
        lang3(lang),
      ),
    }
  })

  on('command.run', { command: 'agents-info' }, async $ => {
    const isNowUnfolded = await toggleUnfolded($)
    await showBar($, 'agents')
    return { text: isNowUnfolded ? tr().opened : tr().closed }
  })

  // Pushed after each turn and whenever a window moves a whole point.
  on('session.measure', async ($, e, next) => {
    const limits = limitsOf(e.rateLimits)
    if (limits.length) await take($, limits)
    const turns = await $.session.turns().catch(() => undefined)
    await update($, gauge, g => ({ ...g, ...measured(e.context, e.cost), turns: turns ?? g.turns }))
    return next(e)
  })

  // Each prompt the person sends notes the agents running then; the next agent spawned
  // drops the rest, so the list holds this turn's.
  // Agents' notifications and other sessions' messages enter as prompts too, under their own origin.
  on('prompt.submit', async ($, e, next) => {
    const kind: string = e.origin?.kind ?? 'unclassified'
    // A choice waiting under the bar goes with the person's message; a slash command or another
    // session's message leaves it waiting for the next.
    if (PERSON_ORIGINS.has(kind) && !e.command) await takeDraft($)
    const sentAt = await $.clock.now()
    const sent = await next(e)
    if (sent.drop !== undefined || !PERSON_ORIGINS.has(kind)) return sent
    const running = (await read($, agents)).filter(a => a.status === 'running').map(a => a.id)
    await update($, agentsPanel, () => ({ listOffset: 0, keepIds: running, keepFrom: sentAt }))
    // A message sent: the agents view while any runs, else the limits. A slash command is no message.
    if (!e.command) await followWork($, running.length ? 'agents' : 'usage')
    return sent
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
    // First agents since the person's prompt: drop last turn's, but for those running when it
    // was sent. Agents started together each see the prompt's mark before one clears it, so the
    // drop spares every agent started since: none takes away a row another just added.
    const panel = await read($, agentsPanel)
    const keep = panel.keepIds ? { ids: panel.keepIds, from: panel.keepFrom ?? 0 } : null
    const latest = await update($, agents, list => {
      const kept = keep ? list.filter(a => keep.ids.includes(a.id) || a.startedAt >= keep.from) : list
      const round = 1 + kept.filter(a => norm(a.description) === norm(e.description) && e.description).length
      const run: AgentRun = {
        id: started.agentId ?? e.tool_use_id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: contextWindowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        round,
      }
      return [...kept.filter(a => a.id !== run.id), run].slice(-200)
    })
    if (keep) await update($, agentsPanel, p => (p.keepIds ? { listOffset: 0 } : p))
    await update($, now, () => at)
    // The batch counts what the list holds, whatever order the agents started in: a finished
    // batch makes way for a new one, from the moment it finished.
    await update($, flow, prev => {
      const open = prev && !prev.isFinished ? prev : null
      if (!keep && open && open.since === undefined) return { ...open, total: open.total + 1, running: open.running + 1 }
      const def = keep ? { since: keep.from, keep: keep.ids } : open ? { since: open.since ?? 0, keep: open.keep ?? [] } : { since: prev?.finishedAt ?? at, keep: [] }
      const batch = latest.filter(a => def.keep.includes(a.id) || a.startedAt >= def.since)
      const same = open && open.since === def.since ? open : null
      const total = Math.max(batch.length, same?.total ?? 0)
      const done = Math.min(total, Math.max(batch.filter(a => a.status !== 'running').length, same?.done ?? 0))
      return { ...(same ?? { ...blank(), ...def }), total, done, running: total - done, isFinished: false }
    })
    await showBar($, 'agents')
    return started
  })

  // The main thread's request: the model and effort it runs on. A subagent's: its live
  // context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    // The main loop's requests go on the quick choice until the turn's end makes it the session's.
    const s = !e.agentId ? switching : null
    const sent = s ? { ...e, ...(s.model ? { model: s.model } : {}), ...(s.effort ? { effort: s.effort } : {}) } : e
    if (!e.agentId) await observe($, sent.model, sent.effort)
    const result = yield* next(sent)
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
              contextMax: contextWindowOf(model),
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
    if (!agentId) await settleSwitch($)
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
          return { ...prev, running, done: Math.min(prev.total, prev.done + 1), isFinished: running === 0, ...(running === 0 ? { finishedAt: at } : {}) }
        })
      }
      await update($, now, () => at)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, isShown)
    if (!shown || e.props.hasSurvey) return next(e)
    // A bar left on the model view, which is no more, shows the limits; so does one on the agents
    // view before any subagent has run, the view's switch dimmed until one does.
    const hasAgents = (await read($, flow)) !== null
    const stored = await read($, view)
    const v: View = isView(stored) && (stored !== 'agents' || hasAgents) ? stored : 'usage'
    const unfolded = await read($, isUnfolded)
    const l3 = await read($, language)
    const c = await read($, current)
    // Draw this bar with the other mods' bands beneath it. Claude Code's own placeholder
    // ({ type: 'engine' }) is never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    // What waits for the next message; the quick choice shows it while open.
    const pending = await read($, draft)
    const d = (await read($, isPicking)) ? pending : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const isTerminal = e.surface === 'terminal' || !('Svg' in ui)
    const rtl = isRtl()
    const rowDir = rtl ? 'row-reverse' : 'row'
    const list = await read($, agents)
    const isWorking = list.some(a => a.status === 'running')
    const cols = e.props.bodyColumns || 100

    // At the left, the mascot wears the session's model; at the right, ⇄ moves to the other view,
    // before the fold toggle, and ✕ puts the bar away (the terminal keeps the view's name and its
    // › at the left, where no mascot stands). A Button holds text alone, so a blank one laid over the
    // head takes its presses: the quick choice of model and effort. Its label is all it draws on
    // the desktop, so it is blank braille cells, at least the drawing's width: a space would be
    // collapsed or trimmed. `laid` spans the drawing exactly and cuts the button to it, so a
    // button wider than the drawing neither shifts off it nor reaches a neighbour.
    const laid = (button: JSX.Element) => (
      <Box position="absolute" top={0} bottom={0} left={0} right={0} overflow="hidden">
        {button}
      </Box>
    )
    const family = c.family
    const viewName = v === 'usage' ? usageWords(l3).title : tr().pane
    // The head wears the model's hair and the effort's face: those picked and waiting for the next
    // message, open or not, else the session's. A model without an effort setting is at ease.
    const faceFamily = pending ? pending.family : family
    const faceEffort = pending ? pending.effort : c.effort
    const faceMood = faceEffort && !(faceFamily && c.noEffort.includes(faceFamily)) ? faceEffort : 'medium'
    const viewButton = hasAgents ? (
      <Button key="saiyan-view" label={isTerminal ? `▣ ${viewName} ›` : '⇄'} plain onPress={() => void cycleView($)} />
    ) : (
      // No Button has a disabled state: before any subagent, the switch is dim text, not to be pressed.
      <Box key="saiyan-view-off">
        <Text dimColor>{isTerminal ? `▣ ${viewName}` : '⇄'}</Text>
      </Box>
    )
    const switcher = (
      <Box flexDirection="row" alignItems="center" flexShrink={0}>
        {!isTerminal &&
          (() => {
            const { Svg } = ui as typeof ui & { Svg: NonNullable<(typeof ui)['Svg']> }
            return (
              <Box key="saiyan-face" position="relative">
                <Svg source={mascotSvg(faceFamily ? forms[faceFamily] ?? 'base' : 'base', 24, true, 'v', faceMood)} alt={viewName} width={24} height={24} />
                {laid(<Button key="saiyan-pick" label={'\u2800\u2800'} plain onPress={() => void togglePicking($)} />)}
              </Box>
            )
          })()}
        {isTerminal && viewButton}
      </Box>
    )
    // Open, the quick choice stands on one line under the bar's row: the model chosen in its
    // color, the others to press; the effort as five dots in the model's color, filled up to it,
    // hollow past it. A pick waits for the person's next message, which takes it (`takeDraft`).
    // On the desktop the line is drawn as the folded limits row is, at its width, under it in its column: the same
    // size of text, the models under the 5-hour window, the effort under the week. The desktop
    // draws a Button's label without color, so the line is a drawing, and blank buttons laid over
    // its cells take the presses, as the mascot's does.
    const isQuick = !!d && !isTerminal
    const isDraftOff = !!d?.family && c.noEffort.includes(d.family)
    // The limits row's windows, as it draws them, place the line's bars.
    const quickReading = isQuick ? await read($, reading) : null
    const quickAt = Math.max(await read($, now), quickReading?.at ?? 0)
    const quickWindows = headline((quickReading?.limits ?? []).map(l => windowOf(l, quickAt)))
    const quickLine =
      isQuick &&
      d &&
      (() => {
        const { Svg } = ui as typeof ui & { Svg: NonNullable<(typeof ui)['Svg']> }
        const q = drawQuick(d, families, isDraftOff, quickWindows, quickAt, Math.max(260, Math.min(1600, cols * 9 - 104)), l3)
        // Sized by the drawing, so the cells' shares are of its width as drawn.
        return (
          <Box key="quick" position="relative" alignSelf="flex-start" marginTop={1}>
            <Svg source={q.source} alt={q.alt} />
            <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row">
              {q.cells.map(cell => {
                const { family: f, effort: e, inner } = cell
                if (!inner) return <Box key={cell.key} width={`${cell.width}%`} />
                // The stretch cut again: room, then the button fitted to its word or dot.
                return (
                  <Box key={cell.key} width={`${cell.width}%`} flexDirection="row">
                    <Box width={`${inner.left}%`} />
                    <Box key={`${cell.key}-hit`} width={`${inner.width}%`} position="relative">
                      {f && laid(<Button key={`quick-model-${f}`} label={'\u2800\u2800'} plain onPress={() => void pickDraft($, { family: f })} />)}
                      {e && laid(<Button key={`quick-effort-${e}`} label={'\u2800\u2800'} plain onPress={() => void pickDraft($, { effort: e })} />)}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )
      })()
    // The view's row with the line under it.
    const quickMid = (row: JSX.Element) =>
      isQuick ? (
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          {row}
          {quickLine}
        </Box>
      ) : (
        row
      )
    const headAlign = isQuick ? 'flex-start' : 'center'
    // Terminal: the same choice on a line of its own under the bar's head.
    const quick =
      d &&
      isTerminal &&
      (() => {
        const sm = viewWords(l3)
        const color = d.family ? COLOR[d.family] : undefined
        const level = isDraftOff || !d.effort ? 0 : EFFORTS.indexOf(d.effort) + 1
        return (
          <Box key="quick" flexDirection={rowDir} justifyContent="space-between" alignItems="center" gap={2} marginTop={1}>
            <Box flexDirection={rowDir} alignItems="center" gap={2}>
              <Box flexDirection={rowDir} alignItems="center" gap={1}>
                <Text>{sm.model}</Text>
                {families.map(f =>
                  f === d.family ? (
                    <Text key={`quick-model-${f}`} bold color={COLOR[f]}>
                      {NAME[f]}
                    </Text>
                  ) : (
                    <Button key={`quick-model-${f}`} label={NAME[f]} plain dimColor onPress={() => void pickDraft($, { family: f })} />
                  ),
                )}
              </Box>
              <Box flexDirection={rowDir} alignItems="center" gap={1}>
                <Text>{sm.effort}</Text>
                {isDraftOff ? (
                  <Text dimColor>{sm.off}</Text>
                ) : (
                  EFFORTS.map((e, i) =>
                    i < level ? (
                      <Button key={`quick-effort-${e}`} plain onPress={() => void pickDraft($, { effort: e })}>
                        <Text color={color}>●</Text>
                      </Button>
                    ) : (
                      <Button key={`quick-effort-${e}`} label="○" plain dimColor onPress={() => void pickDraft($, { effort: e })} />
                    ),
                  )
                )}
                {!isDraftOff && d.effort && (
                  <Text bold color={color}>
                    {effortWord(d.effort, l3)}
                  </Text>
                )}
              </Box>
            </Box>
          </Box>
        )
      })()
    const hide = <Button key="saiyan-hide" label="✕" plain role="dismiss" onPress={() => void hideBar($)} />
    const flag = <Button key="saiyan-lang" label={FLAGS.find(([l]) => l === lang)?.[1] ?? '🌐'} plain onPress={() => void nextLang($)} />
    // Unfolded on desktop: the view's rows, room left empty down to BODY_PX, then the footer
    // with the flag, the same in every view.
    const body = (rows: JSX.Element[], rowsPx: number, left: JSX.Element[] | null, right: JSX.Element | false | null) => {
      if (isTerminal) return null
      const { Svg } = ui as typeof ui & { Svg: NonNullable<(typeof ui)['Svg']> }
      const room = BODY_PX - rowsPx
      return (
        <Box key="body" flexDirection="column" alignItems={rtl ? 'flex-end' : undefined} marginTop={2}>
          {rows}
          {room > 0 && (
            <Box key="room">
              <Svg source={blankSvg(Math.max(240, Math.min(1600, cols * 9 - 16)), room)} alt=" " height={room} />
            </Box>
          )}
          <Box key="footer" flexDirection={rowDir} alignItems="center" justifyContent="space-between" gap={1} marginTop={2}>
            <Box flexDirection={rowDir} alignItems="center" gap={3}>
              {left}
            </Box>
            <Box flexDirection={rowDir} alignItems="center" gap={1}>
              {right}
              {flag}
            </Box>
          </Box>
        </Box>
      )
    }

    // --- the usage view.
    if (v === 'usage') {
      const r = await read($, reading)
      const s = usageWords(l3)
      const at = Math.max(await read($, now), r?.at ?? 0)
      const ws = (r?.limits ?? []).map(l => windowOf(l, at))
      const heads = headline(ws)
      const toggle = (
        <Button key="limits-toggle" label={unfolded ? '▼' : '▶'} plain onPress={() => void toggleUnfolded($)} />
      )
      // On desktop the flag stands in the unfolded body's footer.
      const controls = (
        <Box flexDirection="row" alignItems="center" flexShrink={0}>
          {unfolded && isTerminal && flag}
          {!isTerminal && viewButton}
          {r && toggle}
          {hide}
        </Box>
      )
      if (!r) {
        return (
          <Box flexDirection="column">
            <Box flexDirection="row" alignItems={headAlign} gap={1}>
              {switcher}
              {quickMid(
                <Box flexGrow={1}>
                  <Text dimColor wrap="truncate-end">
                    {s.none}
                  </Text>
                </Box>,
              )}
              {controls}
            </Box>
            {quick}
            {below}
          </Box>
        )
      }
      const alt = heads.map(w => `${nameOf(w.kind, l3).long} ${pct(w.used, l3)}, ${rowNote(w, at, l3).text}`).join(' · ')
      const gaugeNow = await read($, gauge)
      // Unfolded, the footer's figures, as the agents view's: the names dim, the figures bold.
      const figureBoxes = sessionFigures(gaugeNow, at, l3).map(([name, value]) => (
        <Box key={name} flexDirection={rowDir} gap={1}>
          <Text dimColor>{name}</Text>
          <Text bold>{value}</Text>
        </Box>
      ))
      if (!isTerminal) {
        const { Svg } = ui as typeof ui & { Svg: NonNullable<(typeof ui)['Svg']> }
        // Drawn a little wider than the slot is likely to be, without a width: the
        // surface scales it down to the room the mascot and the controls leave.
        const rowW = Math.max(260, Math.min(1600, cols * 9 - 104))
        const W = Math.max(260, Math.min(1600, cols * 9 - 16))
        // Unfolded, one block per row as the agents view draws its agents: the context, the
        // 5-hour window and the week, whatever else the account reports.
        const blocks = [contextBlock(gaugeNow, l3), ...mainWindows(ws).map(w => windowBlock(w, at, l3))]
        return (
          <Box flexDirection="column">
            <Box flexDirection="row" alignItems={headAlign} gap={1}>
              {switcher}
              {quickMid(
                <Box flexGrow={1} flexShrink={1}>
                  {unfolded ? (
                    <Svg source={headSvg(rowW, r.at, at, l3)} alt={`${s.title}: ${alt}`} />
                  ) : (
                    <Svg source={usageRowSvg(heads, rowW, at, l3)} alt={`${s.title}: ${alt}`} />
                  )}
                </Box>,
              )}
              {controls}
            </Box>
            {quick}
            {unfolded &&
              body(
                blocks.map(b => (
                  <Box key={b.key} flexDirection={rowDir} alignItems="center" gap={1}>
                    <Svg source={iconSvg(b.icon, b.window.status, 30)} alt={b.title} width={30} height={30} />
                    <Box flexGrow={1} flexShrink={1}>
                      <Svg source={blockSvg(b, W - 40)} alt={`${b.title} ${b.figure}. ${b.detail}`} height={ROW_PX} />
                    </Box>
                  </Box>
                )),
                blocks.length * ROW_PX,
                figureBoxes,
                null,
              )}
            {below}
          </Box>
        )
      }
      // Terminal: the same content in text rows, the pace mark a thin bar across the cells.
      const cells = (w: Window, width: number) =>
        cellBar(w, width).map((cell, i) =>
          cell.part === 'used' ? (
            <Text key={`c${i}`} color={STATUS_COLOR[w.status]}>
              {cell.text}
            </Text>
          ) : cell.part === 'mark' ? (
            <Text key={`c${i}`}>{cell.text}</Text>
          ) : (
            <Text key={`c${i}`} dimColor>
              {cell.text}
            </Text>
          ),
        )
      const barW = Math.max(6, Math.min(20, Math.floor((cols - 34) / Math.max(1, heads.length)) - 22))
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={2}>
            {switcher}
            <Text>
              <Text color={STATUS_COLOR[worst(heads)]}>●</Text> <Text bold>{s.title}</Text>
            </Text>
            {heads.map(w => {
              const note = rowNote(w, at, l3)
              return (
                <Text key={w.kind} wrap="truncate-end">
                  <Text bold>{nameOf(w.kind, l3).short}</Text> {cells(w, barW)}{' '}
                  {note.isWarning ? (
                    <Text bold color={STATUS_COLOR[w.status]}>
                      {pct(w.used, l3)} {note.text}
                    </Text>
                  ) : (
                    <Text>
                      <Text bold>{pct(w.used, l3)}</Text> <Text dimColor>{note.text}</Text>
                    </Text>
                  )}
                </Text>
              )
            })}
            {controls}
          </Box>
          {quick}
          {unfolded && (
            <Box key="details" flexDirection="column" marginTop={1}>
              {[contextBlock(gaugeNow, l3), ...mainWindows(ws).map(w => windowBlock(w, at, l3))].map(b => {
                const w = b.window
                return (
                  <Box key={b.key} flexDirection="column" marginBottom={1}>
                    <Text wrap="truncate-end">
                      <Text bold>{b.title}</Text> <Text bold color={w.status === 'ok' ? undefined : STATUS_COLOR[w.status]}>{b.figure}</Text>
                    </Text>
                    <Text>{cells(w, Math.max(10, Math.min(60, cols - 4)))}</Text>
                    {b.isWarning ? (
                      <Text color={STATUS_COLOR[w.status]} wrap="truncate-end">
                        {b.detail}
                      </Text>
                    ) : (
                      <Text dimColor wrap="truncate-end">
                        {b.detail}
                      </Text>
                    )}
                  </Box>
                )
              })}
              <Box flexDirection={rowDir} gap={3}>
                {figureBoxes}
              </Box>
              <Text dimColor wrap="truncate-end">
                {s.updated(ago(r.at, at, l3))}
              </Text>
            </Box>
          )}
          {below}
        </Box>
      )
    }

    // --- the agents view.
    const batch = await read($, flow)
    const s = tr()
    const p: AgentsPanel = await read($, agentsPanel)
    // The arrow by the dismiss folds the agents list out under the bar, and back in.
    const arrow = unfolded ? '▼' : rtl ? '◀' : '▶'
    const crewButton = <Button key="savvy-agents" label={arrow} plain onPress={() => void toggleUnfolded($)} />
    // Never without a batch: the view falls back to the limits until a subagent has run.
    if (!batch) return below ?? next(e)
    const f = stepsOf(batch, list)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)
    // Newest first: the bar under each says whether it still runs.
    const shownAgents = [...list].reverse()
    const t = totals(list, at)
    // The totals line: each figure under its name, the names dim and the figures bold.
    const figures: [string, string][] = [
      [s.cost, `≈${fmtCost(t.cost)}`],
      [s.tokens, fmtTokens(t.tokens)],
      [s.time, fmtSpan(t.time)],
    ]
    const offset = Math.max(0, Math.min(shownAgents.length - LIST_ROWS, p.listOffset ?? 0))
    const page = shownAgents.slice(offset, offset + LIST_ROWS)
    // Under the list: the turn's totals, set apart, and the arrows when more agents than rows.
    const figureBoxes = figures.map(([name, value]) => (
      <Box key={name} flexDirection={rowDir} gap={1}>
        <Text dimColor>{name}</Text>
        <Text bold>{value}</Text>
      </Box>
    ))
    const arrows = shownAgents.length > LIST_ROWS && (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Button key="savvy-up" label="▲" plain onPress={() => void scrollList($, -LIST_ROWS, shownAgents.length)} />
        <Text dimColor>{`${offset + 1}–${offset + page.length} / ${shownAgents.length}`}</Text>
        <Button key="savvy-down" label="▼" plain onPress={() => void scrollList($, LIST_ROWS, shownAgents.length)} />
      </Box>
    )
    const footer = (
      <Box key="footer" flexDirection={rowDir} alignItems="center" justifyContent="space-between" gap={1} marginTop={2}>
        <Box flexDirection={rowDir} alignItems="center" gap={3}>
          {figureBoxes}
        </Box>
        <Box flexDirection={rowDir} alignItems="center" gap={1}>
          {arrows}
          {flag}
        </Box>
      </Box>
    )
    // The count stands with the mascot, as a label.
    const count = `×${list.length}`
    const percent = `${Math.round(ratio(f) * 100)}%`

    if (!isTerminal) {
      const { Svg } = ui as typeof ui & { Svg: NonNullable<(typeof ui)['Svg']> }
      const width = Math.max(180, Math.min(1600, cols * 9 - 112))
      const W = Math.max(240, Math.min(1600, cols * 9 - 16))
      // The bar wears the head of the strongest model among this turn's agents (those running when
      // the person sent the prompt, and those started since), done or not; the later one on a tie.
      const rank = (a: AgentRun): number => FORMS.indexOf(formOf(a.model))
      const lead = list.reduce<AgentRun | undefined>((best, a) => (!best || rank(a) >= rank(best) ? a : best), undefined)
      const details = !unfolded
        ? null
        : body(
            page.map(a => (
              <Box key={a.id} flexDirection={rowDir} alignItems="center" gap={1}>
                <Svg source={mascotSvg(formOf(a.model), 30, a.status === 'running', 'a')} alt={runModel(a)} width={30} height={30} />
                <Box flexGrow={1} flexShrink={1}>
                  <Svg
                    source={agentSvg(W - 40, a, at)}
                    alt={`${a.description}: ${runModel(a)}, ${a.status === 'running' ? s.isRunning : s.isFinished}`}
                    height={ROW_PX}
                  />
                </Box>
              </Box>
            )),
            page.length * ROW_PX,
            figureBoxes,
            arrows,
          )
      return (
        <Box flexDirection="column">
          <Box flexDirection={rowDir} alignItems={headAlign} gap={1}>
            {switcher}
            {quickMid(
              <Box flexGrow={1} flexShrink={1}>
                <Svg source={agentsRowSvg(f, width)} alt={`${f.title}: ${label(f)}, ${percent}`} />
              </Box>,
            )}
            <Box flexDirection={rowDir} alignItems="center" flexShrink={0} gap={0}>
              <Svg source={mascotSvg(lead ? formOf(lead.model) : 'base', 22, isWorking, 'c')} alt={lead ? runModel(lead) : s.pane} width={22} height={22} />
              <Text>{count}</Text>
            </Box>
            <Box flexDirection={rowDir} alignItems="center" flexShrink={0}>
              {viewButton}
              {crewButton}
              {hide}
            </Box>
          </Box>
          {quick}
          {details}
          {below}
        </Box>
      )
    }

    // Terminal: the same content in text rows.
    const titleW = Math.max(8, Math.min(30, f.title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 44))
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
          {switcher}
          <Box width={titleW} flexShrink={0}>
            <Text color={f.isFinished ? DONE : ACCENT}>● </Text>
            <Text wrap="truncate-end">{f.title}</Text>
          </Box>
          <Text color={f.isFinished ? DONE : ACCENT}>{barText(f, width)}</Text>
          <Text bold>{label(f)}</Text>
          <Text dimColor>{percent}</Text>
          <Text color={CLAY}>▣{count}</Text>
          {crewButton}
          {hide}
        </Box>
        {quick}
        {unfolded && (
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
