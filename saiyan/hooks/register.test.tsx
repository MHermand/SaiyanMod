import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { headSvg, rowBars, rowGroups, rowShown, rowSvg, textWidth, windowOf } from './limits'
import { mascotSvg } from './mascot'
import { quickLine, sessionFigures } from './model'
import { EFFORTS } from './switch'

const NOW = Date.parse('2026-11-01T00:39:00Z')
const IN = (min: number) => new Date(NOW + min * 60_000).toISOString()
// The 5-hour window resets in 51 minutes, the week in 5 days 4 hours.
const CALM = [
  { kind: 'five_hour', percentUsed: 33, resetsAt: IN(51) },
  { kind: 'seven_day', percentUsed: 11, resetsAt: '2026-11-06T05:00:00.096Z' },
]
// 78% used with only 55% of the window gone.
const TENSE = [
  { kind: 'five_hour', percentUsed: 78, resetsAt: IN(135) },
  { kind: 'seven_day', percentUsed: 19, resetsAt: '2026-11-06T05:00:00.096Z' },
]
const OPTIONS = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opus[1m]', 'fable[1m]', 'opusplan']

const BAND = {
  plugin: 'saiyan',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const FR = { options: { language: 'fr' } }

// Stands for the engine beneath the mod: the model setting, the /model and /effort runs
// it receives, its toasts, and the empty band it draws when no plugin does.
const engine = (on: On, store: Record<string, unknown> = {}, heldCommands: string[] = [], spawnWait: Record<string, number> = {}) => {
  const runs: string[] = []
  const toasts: string[] = []
  const asked: string[] = []
  const prompts: string[] = []
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, store)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.invalidate', (_, e, next) => {
    asked.push(e.event)
    return next(e)
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('config.list', () => ({
    value: [{ key: 'model', label: 'Model', kind: 'choice', value: 'opus[1m]', options: OPTIONS, provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] as never,
  }))
  on('command.register', (_, e) => {
    if (heldCommands.includes(e.name)) throw new Error(`"/${e.name}" refused: another plugin registered it already`)
    return { value: { command: e.name } }
  })
  on('tool.register', (_, e) => ({ value: { tool: `mcp__saiyan__${e.name}` } }) as never)
  on('command.run', (_, e) => {
    runs.push(`/${e.command} ${e.args}`)
    return { text: 'ok' }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('agent.spawn', async (_, e) => {
    for (let i = 0; i < (spawnWait[e.tool_use_id] ?? 0); i++) await Promise.resolve()
    prompts.push(e.prompt)
    return { model: e.tool_use_id === 't-a1' ? 'claude-opus-5-5' : 'claude-sonnet-5-5', agentId: e.tool_use_id.replace('t-', '') } as never
  })
  on('turn.complete', () => ({ text: '' }) as never)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  return { runs, toasts, asked, prompts, clock }
}

const start = ($: any, surface: 'desktop' | 'terminal' = 'desktop') => $.session.start({ cwd: '/', surface, isInteractive: true })
const measure = (rateLimits: typeof CALM) => ({ context: { window: 1_000_000 }, rateLimits, changed: ['rateLimits' as const] })
const spawn = (id: string) => ({ tool_use_id: `t-${id}`, prompt: 'Do the work.', description: `Work ${id}`, subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false })

// One keypress in the prompt box, as the engine raises it.
const press = ($: any, key: { key: string; ctrl?: true; meta?: true; shift?: true }, inputText = '') =>
  $.prompt.edit({ origin: { kind: 'composer' }, key, text: 'draft', cursor: 5, start: 5, end: 5, inputText })
const answerEdits = (on: On) => on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
const command = ($: any, name: string, args = '') => $.command.run({ command: name, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

const mount = ($: any, surface: 'desktop' | 'terminal' = 'desktop') => $.ui.mount({ ...BAND, surface })
const alts = async (ui: any) => (await ui.findAll({ type: 'Svg' })).map((s: any) => String(s.props.alt)).join('\n')
const texts = async (ui: any) => JSON.stringify(await ui.findAll({ type: 'Text' }))
// The view on show, as the terminal's switcher names it.
const viewOf = async (ui: any) => (await ui.find({ key: 'saiyan-view' }))?.props.label
// The pixels an element takes down: an Svg its height, a column Box the sum, a row the tallest.
const px = (el: any): number => {
  if (!el || typeof el !== 'object') return 0
  if (el.type === 'Svg') return Number(el.props?.height)
  const kids = (el.children ?? []).map(px)
  return el.props?.flexDirection === 'column' ? kids.reduce((a: number, b: number) => a + b, 0) : Math.max(0, ...kids)
}
// What the unfolded body takes above its footer, the same footer in every view.
const bodyPx = async (ui: any) => {
  const body = await ui.find({ key: 'body' })
  if (!body) return null
  const above = body.children.filter((c: any) => (c?.key ?? c?.props?.key) !== 'footer')
  return above.map(px).reduce((a: number, b: number) => a + b, 0)
}

test('the prompt box keeps its keys: no shortcut hides the bar or moves the model or the effort', FR, async ($, on) => {
  const { runs, clock, toasts } = engine(on)
  answerEdits(on)
  await start($)
  await $.session.measure(measure(CALM))
  // Cmd+A selects all, Ctrl+A goes to the line's start, and Option types its character, as anywhere else.
  const keys = [
    [{ key: 'a', meta: true }, ''],
    [{ key: 'a', ctrl: true }, ''],
    [{ key: 'æ', meta: true }, 'æ'],
    [{ key: 'µ', meta: true }, 'µ'],
    [{ key: 'ê', meta: true }, 'ê'],
    [{ key: 'm', ctrl: true }, ''],
    [{ key: 'e', ctrl: true }, ''],
  ] as const
  for (const [key, input] of keys) expect((await press($, key, input)).text).toBe(`draft${input}`)
  await clock.advance(600)
  const ui = await mount($)
  expect(await ui.find({ key: 'saiyan-hide' })).not.toBe(undefined)
  await ui.unmount()
  expect(runs).toEqual([])
  expect(toasts).toEqual([])
})

test('the folded limits row: no status dot; the 5-hour group, with the title, as wide as the week', () => {
  const [first, week] = rowGroups(2, 800, 'fr')
  expect(first?.start).toBe(0)
  expect(week?.end).toBe(800)
  expect((first?.end ?? 0) - (first?.start ?? 0)).toBe((week?.end ?? 0) - (week?.start ?? 0))
  expect(first?.labelX).toBeGreaterThan(50)
  const ws = CALM.map(l => windowOf(l, NOW))
  expect(rowSvg(ws, 800, NOW, 'fr')).not.toContain('<circle')
  expect(headSvg(800, NOW, NOW, 'fr')).not.toContain('<circle')
  // Each note ends where its group does.
  expect(rowSvg(ws, 800, NOW, 'fr')).toMatch(new RegExp(`x="${first?.end}"[^>]*text-anchor="end">↻ 51m<`))
})

test('the quick line: the models along the 5-hour window from its bar, the dots along the week’s bar, each button on its dot', () => {
  const W = 796
  const ws = CALM.map(l => windowOf(l, NOW))
  const [fiveHour, week] = rowBars(ws, W, NOW, 'fr')
  const lines = quickLine({ family: 'opus', effort: 'high' }, ['haiku', 'sonnet', 'opus', 'fable'], false, ws, NOW, W, 'fr').lines
  // Wide: one line.
  expect(lines).toHaveLength(1)
  const q = lines[0]!
  expect(q.source).toContain(`x="${fiveHour?.barX}"`)
  expect(q.source).toMatch(new RegExp(`x="${fiveHour?.barX}"[^>]*>Haiku<`))
  const dots = [...q.source.matchAll(/<circle cx="([\d.]+)"/g)].map(m => Number(m[1]))
  expect(Math.abs((dots[0] ?? 0) - 5 - (week?.barX ?? 0)) < 0.1).toBe(true)
  expect(Math.abs((dots[4] ?? 0) + 5 - ((week?.barX ?? 0) + (week?.barW ?? 0))) < 0.1).toBe(true)
  // Where each dot's button lands, from the cells' whole percents: centred on its dot within a pixel.
  let at = 0
  const centre: Record<string, number> = {}
  for (const c of q.cells) {
    if (c.inner && c.effort) {
      const span = (c.width / 100) * W
      const from = (at / 100) * W + (c.inner.left / 100) * span
      centre[c.effort] = from + ((c.inner.width / 100) * span) / 2
    }
    at += c.width
  }
  expect(at).toBeLessThanOrEqual(100)
  EFFORTS.forEach((e, i) => expect(Math.abs((centre[e] ?? 0) - (dots[i] ?? 0)) < 1).toBe(true))
  // The model chosen has no button.
  expect(q.cells.some(c => c.family === 'opus')).toBe(false)
})

test('narrow, the folded row keeps the 5-hour session alone, the choice takes two lines, and nothing runs past its drawing', () => {
  const ws = CALM.map(l => windowOf(l, NOW))
  const families = ['haiku', 'sonnet', 'opus', 'fable'] as const
  // Every text inside its drawing: a start one from x on, an end one up to x.
  const inside = (source: string, W: number) =>
    [...source.matchAll(/<text[^>]* x="([\d.-]+)"[^>]*font-size="([\d.]+)"([^>]*)>([^<]*)</g)].every(([, x, size, rest, words]) => {
      const w = textWidth(words ?? '', Number(size), /font-weight="(600|700)"/.test(rest ?? ''))
      const at = Number(x)
      return /text-anchor="end"/.test(rest ?? '') ? at - w >= -0.5 && at <= W + 0.5 : at >= -0.5 && at + w <= W + 0.5
    })
  for (const W of [120, 160, 200, 240, 280, 320, 360, 420, 500, 640, 796, 1200]) {
    const { ws: shown, hasTitle } = rowShown(ws, W, NOW, 'fr')
    const row = rowSvg(ws, W, NOW, 'fr')
    if (W >= 200) expect(inside(row, W)).toBe(true)
    // Each bar shown stops before the next group.
    const bars = rowBars(shown, W, NOW, 'fr', hasTitle)
    if (W >= 160) bars.forEach(b => expect(b.barX + b.barW).toBeLessThanOrEqual(b.end))
    const lines = quickLine({ family: 'opus', effort: 'xhigh' }, families, false, ws, NOW, W, 'fr').lines
    // Two lines wherever the row keeps the session alone, or the models outgrow its group; one when wide.
    if (!hasTitle) expect(lines).toHaveLength(2)
    if (W >= 640) expect(lines).toHaveLength(1)
    if (W >= 200) lines.forEach(line => expect(inside(line.source, W)).toBe(true))
    // The dots stay in the drawing, apart.
    for (const line of lines) {
      const dots = [...line.source.matchAll(/<circle cx="([\d.]+)"/g)].map(m => Number(m[1]))
      dots.forEach((x, i) => {
        expect(x - 5).toBeGreaterThanOrEqual(0)
        expect(x + 5).toBeLessThanOrEqual(W)
        if (i > 0) expect(x - (dots[i - 1] ?? 0)).toBeGreaterThanOrEqual(12)
      })
    }
  }
  // Wide, the title and both windows; narrow, the 5-hour session alone, without the title.
  expect(rowShown(ws, 796, NOW, 'fr')).toEqual({ ws, hasTitle: true })
  expect(rowShown(ws, 300, NOW, 'fr')).toEqual({ ws: ws.slice(0, 1), hasTitle: false })
  expect(rowSvg(ws, 300, NOW, 'fr')).not.toMatch(/Limites|Hebdomadaire/)
  expect(rowSvg(ws, 300, NOW, 'fr')).toContain('33')
  // The unfolded head drops how old the figures are; the footer, the messages.
  expect(headSvg(800, NOW, NOW, 'fr')).toContain('mis à jour')
  expect(headSvg(800, NOW, NOW, 'fr', false)).not.toContain('mis à jour')
  expect(headSvg(150, NOW, NOW, 'fr')).not.toContain('mis à jour')
  const g = { costUsd: 3.2, turns: 3, startedAt: NOW - 60_000 }
  expect(sessionFigures(g, NOW, 'fr').map(([n]) => n)).toEqual(['Coût', 'Messages', 'Durée'])
  expect(sessionFigures(g, NOW, 'fr', false).map(([n]) => n)).toEqual(['Coût', 'Durée'])
})

test('in a narrow window the bar keeps the 5-hour session alone, and its footers give way', FR, async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(measure(CALM))
  await command($, 'saiyan')
  const at = (cols: number) => $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: cols }, surface: 'desktop' } as never)
  const sources = async (ui: any) => (await ui.findAll({ type: 'Svg' })).map((s: any) => String(s.props.source)).join('\n')
  const wide = await at(100)
  const narrow = await at(36)
  expect(await sources(wide)).toContain('Hebdomadaire')
  expect(await sources(narrow)).not.toContain('Hebdomadaire')
  // Unfolded: the head without its age, the footer without the messages.
  await narrow.press({ key: 'limits-toggle' })
  expect(await sources(narrow)).not.toContain('mis à jour')
  expect(await texts(narrow)).not.toContain('Messages')
  expect(await sources(wide)).toContain('mis à jour')
  expect(await texts(wide)).toContain('Messages')
  // The choice opens on two lines.
  await narrow.press({ key: 'saiyan-pick' })
  expect((await narrow.findAll({ type: 'Svg' })).filter((s: any) => /Opus|Haiku/.test(String(s.props.source)))).toHaveLength(1)
  expect(await narrow.find({ key: 'quick-effort-max' })).toBeTruthy()
  // The agents view's footer drops the tokens.
  await $.agent.spawn(spawn('a1') as never)
  expect(await texts(narrow)).not.toContain('Tokens')
  expect(await texts(wide)).toContain('Tokens')
  await narrow.unmount()
  await wide.unmount()
})

test('the mascot: the model gives the hair, the effort the face and its motion', FR, async ($, on) => {
  // Hair: black, yellow, blue, red.
  const hair = { base: '#2B2522', charged: '#FFD93B', super: '#3FC8F5', ultimate: '#E8302A' } as const
  for (const [form, color] of Object.entries(hair)) expect(mascotSvg(form as never, 24, true, 'm', 'medium')).toContain(`stop-color="${color}"`)
  const face = (mood: string, form = 'super') => mascotSvg(form as never, 24, true, 'm', mood as never)
  // Asleep under its z's, eyes shut, no aura.
  expect(face('low')).toContain('class="zz"')
  expect(face('low')).toContain('class="run dort"')
  expect(face('low')).not.toContain('class="au"')
  expect(face('medium')).toContain('class="run respire cligne"')
  expect(face('high')).toContain('class="run respire cligne reflet auraLente"')
  expect(face('xhigh')).toContain('class="run respire reflet aura eclairs"')
  expect(face('max')).toContain('class="run tremble cheveux flammes peauRouge cheveuxFeu auraFeu traits"')
  // Black hair has no aura of its own: a grey one from high on, and grey bolts, never blue.
  expect(face('high', 'base')).toContain('fill="#8C8C8C"')
  expect(face('xhigh', 'base')).toContain('stroke="#8C8C8C"')
  for (const mood of ['high', 'xhigh', 'max']) expect(face(mood, 'base')).not.toContain('#9BD7FF')
  // All out, each form flares in its own hue: greys, yellows, blues; orange is the red form's alone.
  const flare = { base: '#3A3A3A', charged: '#FFF07A', super: '#2F7BFF', ultimate: '#FF8A1F' } as const
  for (const [form, color] of Object.entries(flare)) {
    expect(face('max', form)).toContain(`fill="${color}"`)
    if (form !== 'ultimate') for (const fire of ['#FF8A1F', '#FF5A2A', '#B3140F']) expect(face('max', form)).not.toContain(fire)
  }
  // The mouth follows the effort for every model, the strongest too: the wide cry at max alone.
  const wide = 'M39 81 Q50 79 61 81'
  expect(face('medium', 'ultimate')).not.toContain(wide)
  expect(face('max', 'ultimate')).toContain(wide)
  expect(face('max', 'base')).toContain(wide)

  // In the bar: the session's model and effort, then those being picked.
  engine(on, { effort: 'high' })
  await start($)
  await $.session.measure(measure(CALM))
  await command($, 'saiyan')
  const ui = await mount($)
  const head = async () => String((await ui.find({ key: 'saiyan-face' })).children[0].props.source)
  expect(await head()).toContain('class="run respire cligne reflet auraLente"')
  expect(await head()).toContain('stop-color="#3FC8F5"')
  await ui.press({ key: 'saiyan-pick' })
  await ui.press({ key: 'quick-model-fable' })
  await ui.press({ key: 'quick-effort-low' })
  expect(await head()).toContain('stop-color="#E8302A"')
  expect(await head()).toContain('class="run dort"')
  await ui.unmount()
})

test('the bar stands from the session\u2019s start, and after a reload', FR, async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(measure(CALM))
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await mount($, surface)
    expect(await ui.find({ key: 'saiyan-hide' })).not.toBe(undefined)
    await ui.unmount()
  }
  const ui = await mount($)
  expect(await alts(ui)).toContain('Limites: Session 5h 33 %, ↻ 51m · Hebdomadaire 11 %, ↻ 5j 4h')

  // Put away, then the session starts again (a reload): the bar stands again.
  await ui.press({ key: 'saiyan-hide' })
  await ui.unmount()
  await start($)
  const back = await mount($)
  expect(await back.find({ key: 'saiyan-hide' })).not.toBe(undefined)
  await back.unmount()

  // The terminal shows the same, with the view's name on the switcher.
  const terminal = await mount($, 'terminal')
  // Before any subagent, the name stands dim, no switch to press.
  expect(await viewOf(terminal)).toBe(undefined)
  expect(await texts(terminal)).toContain('▣ Limites')
  expect((await terminal.find({ type: 'Text', text: /^33 %$/ }))?.text).toBe('33 %')
  await terminal.unmount()
})

test('/saiyan always shows the bar, on the usage view; ✕ puts it away', FR, async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(measure(CALM))
  await command($, 'saiyan')
  await command($, 'saiyan')
  const ui = await mount($)
  expect(await alts(ui)).toMatch(/Limites: Session/)
  await command($, 'saiyan')
  expect(await alts(ui)).toMatch(/Limites: Session/)
  await ui.press({ key: 'saiyan-hide' })
  expect(await ui.find({ key: 'saiyan-hide' })).toBe(undefined)
  await command($, 'saiyan')
  expect(await alts(ui)).toMatch(/Limites: Session/)
  await ui.unmount()
})

test('unfolded or folded, the bar stays so from one view to the next, and after a prompt', FR, async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(measure(CALM))
  await $.agent.spawn(spawn('a1') as never)
  await command($, 'saiyan')
  const ui = await mount($)
  expect((await ui.find({ key: 'limits-toggle' }))?.props.label).toBe('▶')
  await ui.press({ key: 'limits-toggle' })
  expect((await ui.find({ key: 'limits-toggle' }))?.props.label).toBe('▼')
  await ui.press({ key: 'saiyan-view' })
  expect((await ui.find({ key: 'savvy-agents' }))?.props.label).toBe('▼')
  await $.prompt.submit({ text: 'next', origin: { kind: 'human' } } as never)
  expect((await ui.find({ key: 'savvy-agents' }))?.props.label).toBe('▼')

  await ui.press({ key: 'savvy-agents' })
  await ui.press({ key: 'saiyan-view' })
  expect((await ui.find({ key: 'limits-toggle' }))?.props.label).toBe('▶')
  await ui.unmount()
})

test('unfolded, both views stand as tall as the agents list', FR, async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(measure(CALM))
  await command($, 'limits')
  const ui = await mount($)
  const footer = async () => (await ui.find({ key: 'footer' }))?.props.marginTop
  expect(await bodyPx(ui)).toBe(138)
  expect(await footer()).toBe(2)
  // No thin spacer: the windows' rows fill the body between them.
  const thin = async () => (await ui.findAll({ type: 'Svg' })).filter((s: any) => s.props.alt === ' ')
  expect(await thin()).toEqual([])

  await $.agent.spawn(spawn('a0') as never)
  expect(await bodyPx(ui)).toBe(138)
  for (const id of ['a1', 'a2', 'a3', 'a4']) {
    await $.agent.spawn(spawn(id) as never)
    expect(await bodyPx(ui)).toBe(138)
    expect(await footer()).toBe(2)
  }

  // A third window reported: still the 5-hour window and the week alone, the same height.
  await $.session.measure(measure([...CALM, { kind: 'seven_day_opus', percentUsed: 4, resetsAt: '2026-11-06T05:00:00.096Z' }]))
  await command($, 'saiyan', 'usage')
  expect(await alts(ui)).toMatch(/Hebdomadaire 11/)
  expect(await alts(ui)).not.toMatch(/Opus/)
  expect(await bodyPx(ui)).toBe(138)
  expect(await thin()).toEqual([])

  // Folded, every view is one row again.
  await ui.press({ key: 'limits-toggle' })
  expect(await ui.find({ key: 'body' })).toBe(undefined)
  await command($, 'saiyan', 'agents')
  expect(await ui.find({ key: 'body' })).toBe(undefined)
  await ui.unmount()
})

test('a message sent: the agents view while any runs, else the limits; a new agent brings the agents view', FR, async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(measure(CALM))
  const send = (kind = 'composer', extra = {}) => $.prompt.submit({ text: 'next', origin: { kind }, ...extra } as never)
  const onAgents = async (ui: any) => (await ui.find({ key: 'savvy-agents' })) !== undefined

  await command($, 'saiyan', 'agents')
  const ui = await mount($)
  await send()
  expect(await alts(ui)).toMatch(/Limites: Session/)

  await $.agent.spawn(spawn('a1') as never)
  expect(await onAgents(ui)).toBe(true)
  await command($, 'saiyan', 'usage')
  await send()
  expect(await onAgents(ui)).toBe(true)

  // An agent's notification and a slash command are no messages of the person's.
  await $.turn.complete({ agentId: 'a1', reason: 'answer', text: 'done' } as never)
  await send('task-notification')
  expect(await onAgents(ui)).toBe(true)
  await send('composer', { command: { name: 'model', args: 'opus' } })
  expect(await onAgents(ui)).toBe(true)

  await send()
  expect(await alts(ui)).toMatch(/Limites: Session/)

  // A bar the person closed stays closed at a message; the next agent brings it back.
  await ui.press({ key: 'saiyan-hide' })
  await send()
  expect(await ui.find({ key: 'saiyan-hide' })).toBe(undefined)
  await $.agent.spawn(spawn('a2') as never)
  expect(await onAgents(ui)).toBe(true)
  await ui.unmount()
})

test('the old mods still holding /limits and /agents-info do not stop the bar', FR, async ($, on) => {
  engine(on, {}, ['limits', 'agents-info'])
  answerEdits(on)
  await start($)
  await $.session.measure(measure(CALM))
  const ui = await mount($)
  expect(await alts(ui)).toMatch(/Limites: Session/)
  await ui.unmount()
})

test('the ⇄ before the fold toggle goes from the limits to the agents and back, dimmed and still before any subagent; the model view is no more', FR, async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(measure(CALM))
  await command($, 'saiyan')
  const ui = await mount($)
  // The buttons in the order drawn: the mascot's, then at the right ⇄, the fold toggle, ✕.
  const buttons = async () => (await ui.findAll({ type: 'Button' })).map((b: any) => b.props.key)
  expect(await alts(ui)).toMatch(/Limites: Session/)
  expect(await buttons()).toEqual(['saiyan-pick', 'limits-toggle', 'saiyan-hide'])
  // No subagent yet: ⇄ is dim text, no button to press; asked for, the agents view shows the limits.
  expect(await ui.find({ key: 'saiyan-view' })).toBe(undefined)
  expect(JSON.stringify(await ui.find({ key: 'saiyan-view-off' }))).toMatch(/"dimColor":true[^}]*\}[^⇄]*⇄/)
  await command($, 'saiyan', 'agents')
  expect(await alts(ui)).toMatch(/Limites: Session/)
  expect(await texts(ui)).not.toContain('Aucun sous-agent')
  // A subagent, and ⇄ wakes: the agents view.
  await $.agent.spawn(spawn('a1') as never)
  expect((await ui.find({ key: 'saiyan-view' }))?.props).toMatchObject({ label: '⇄' })
  expect((await ui.find({ key: 'saiyan-view' }))?.props.dimColor).toBe(undefined)
  expect(await ui.find({ key: 'saiyan-view-off' })).toBe(undefined)
  expect((await buttons()).slice(0, 4)).toEqual(['saiyan-pick', 'saiyan-view', 'savvy-agents', 'saiyan-hide'])
  await ui.press({ key: 'saiyan-view' })
  expect(await alts(ui)).toMatch(/Limites: Session/)
  // Asked for the model view, the bar shows the limits.
  await command($, 'saiyan', 'agents')
  await command($, 'saiyan', 'model')
  expect(await alts(ui)).toMatch(/Limites: Session/)
  await ui.unmount()
})

test('the /model and /effort the mod runs print nothing; typed, they print', FR, async ($, on) => {
  engine(on)
  await start($)
  const run = (command: string, origin: object) => $.command.run({ command, args: 'high', origin, presentation: { isFullscreen: false, columns: 100 } } as never)
  for (const what of ['model', 'effort']) {
    expect((await run(what, { kind: 'composer' })).text).toBe('ok')
    // No text at all: an empty one still drew a row, `saiyan: `.
    expect((await run(what, { kind: 'plugin', name: 'saiyan' })).text).toBe(undefined)
    expect((await run(what, { kind: 'plugin', name: 'another' })).text).toBe('ok')
  }
})

test('a press on the mascot opens the choice of model and effort; the next message goes on it, closed or open', FR, async ($, on) => {
  const { runs, clock } = engine(on)
  // What each main request is sent on, as the engine beneath the hooks receives it.
  const sentOn: string[] = []
  on('turn.step', async function* (_: unknown, e: any) {
    sentOn.push(`${e.model} ${e.effort}`)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  } as never)
  const step = async (index: number) => {
    const stream: any = $.turn.step({ turnId: 'turn-1', index, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 } as never)
    for await (const _ of stream) void _
    return stream.result
  }
  await start($)
  await $.session.measure(measure(CALM))
  await command($, 'saiyan', 'usage')
  const ui = await mount($)
  const isOpen = async () => (await ui.find({ key: 'quick' })) !== undefined
  const send = (extra = {}) => $.prompt.submit({ text: 'next', origin: { kind: 'composer' }, ...extra } as never)
  // The line is one drawing (two in a narrow window), made as the folded limits row is: at its
  // width, so its words stand as large; blank buttons over its cells take the presses.
  const line = async () => (await ui.find({ key: 'quick-0' })) as any
  const drawing = async () => String((await line()).children[0].props.source)
  const filled = async () => ((await drawing()).match(/<circle[^>]*fill="#[0-9A-F]+"/g) ?? []).length
  // A blank button laid over the head: no text, about its width.
  const face = await ui.find({ key: 'saiyan-pick' })
  expect(face?.props.label).toBe('\u2800\u2800')
  expect(await isOpen()).toBe(false)
  await ui.press({ key: 'saiyan-pick' })
  expect(await isOpen()).toBe(true)
  // The terminal draws the same choice on a line of its own.
  const term = await mount($, 'terminal')
  expect(await texts(term)).toContain('Modèle')
  expect(await term.find({ key: 'quick' })).not.toBe(undefined)
  await term.unmount()

  // As wide as the row above and as tall, sized by its drawing; the names in white like the title.
  const row = (await ui.findAll({ type: 'Svg' })).find((el: any) => String(el.props.alt).startsWith('Limites:'))
  const size = (source: string) => source.match(/width="(\d+)" height="(\d+)"/)?.slice(1)
  expect(size(await drawing())).toEqual(size(String(row?.props.source)))
  expect(((await ui.find({ key: 'quick' })) as any).props.alignSelf).toBe('flex-start')
  expect(await drawing()).toMatch(/class="t"[^>]*font-size="13"[^>]*font-weight="600">Modèle</)
  expect(await drawing()).toMatch(/class="t"[^>]*font-weight="600">Effort</)
  // The model chosen in its color; the others to press, each over its own cell, the chosen one bare.
  expect(await drawing()).toMatch(/fill="#1E9BD1"[^>]*>Opus</)
  expect(await ui.find({ key: 'quick-model-opus' })).toBe(undefined)
  expect((await ui.find({ key: 'quick-model-sonnet' }))?.props.label).toBe('\u2800\u2800')
  expect((await ui.find({ key: 'quick-effort-high' }))?.props.label).toBe('\u2800\u2800')
  const cells = (await line()).children[1].children.map((b: any) => b.props.width)
  expect(cells.every((w: string) => /^\d+%$/.test(w))).toBe(true)
  expect(cells.reduce((a: number, w: string) => a + parseInt(w), 0)).toBeLessThanOrEqual(100)
  // Each blank button spans its cell exactly and is cut to it; the head's too.
  for (const key of ['quick-cell-high-hit', 'saiyan-face']) {
    const holder = await ui.find({ key })
    expect(holder.props.position).toBe('relative')
    const over = holder.children[holder.children.length - 1]
    expect(over.props).toMatchObject({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' })
  }
  // No Ok, and no note: the next message takes the choice.
  expect((await ui.findAll({ type: 'Button' })).some((b: any) => b.props.label === 'Ok')).toBe(false)
  expect(JSON.stringify(await ui.find({ key: 'saiyan-face' }))).not.toContain('prochain')
  expect(await texts(ui)).not.toContain('prochain')
  // A rule between the models and the effort, as between the row's windows.
  expect(await drawing()).toContain('class="sp"')

  // A model and an effort picked: the dots fill up to it, hollow past it; nothing changes yet.
  await ui.press({ key: 'quick-model-sonnet' })
  expect(await drawing()).toMatch(/fill="#C48A12"[^>]*>Sonnet</)
  expect(await filled()).toBe(0)
  await ui.press({ key: 'quick-effort-high' })
  expect(await filled()).toBe(3)
  expect(await drawing()).toMatch(/fill="#C48A12" text-anchor="end">élevé</)
  expect((await line()).children[0].props.alt).toBe('Modèle Sonnet · Effort élevé')
  await clock.advance(600)
  expect(runs).toEqual([])
  // A slash command, or an agent's notification, leaves the choice waiting.
  await send({ command: { name: 'compact', args: '' } })
  await send({ origin: { kind: 'task-notification' } })
  expect(runs).toEqual([])
  expect(await isOpen()).toBe(true)
  // The person's message takes the choice, which closes: its turn's requests go on it at once,
  // and the turn's end makes it the session's, as /model then /effort.
  await send()
  expect(await isOpen()).toBe(false)
  await step(0)
  await step(1)
  expect(sentOn).toEqual(['sonnet[1m] high', 'sonnet[1m] high'])
  expect(runs).toEqual([])
  await $.turn.complete({ reason: 'answer', text: 'done' } as never)
  expect(runs).toEqual(['/model sonnet[1m]', '/effort high'])
  // The next turn goes on the session's own setting again.
  await step(0)
  expect(sentOn[2]).toBe('claude-opus-5-5 medium')

  // From the agents view as well. Closed again, the pick still waits, and the mascot wears it:
  // black hair for Haiku, where the session runs on Sonnet's yellow.
  const head = async () => String((await ui.find({ key: 'saiyan-face' })).children[0].props.source)
  await command($, 'saiyan', 'agents')
  await ui.press({ key: 'saiyan-pick' })
  expect(await isOpen()).toBe(true)
  await ui.press({ key: 'quick-model-haiku' })
  await ui.press({ key: 'saiyan-pick' })
  expect(await isOpen()).toBe(false)
  expect(await head()).toContain('stop-color="#2B2522"')
  // Open again, it starts from what waits.
  await ui.press({ key: 'saiyan-pick' })
  expect(await drawing()).toMatch(/fill="#8A7A72"[^>]*>Haiku</)
  await ui.press({ key: 'saiyan-pick' })
  // The next message goes on it, closed as it is.
  await send()
  await step(0)
  expect(sentOn[sentOn.length - 1]).toMatch(/^haiku/)
  await $.turn.complete({ reason: 'answer', text: 'done' } as never)
  expect(runs.slice(2)).toEqual([expect.stringMatching(/^\/model haiku/)])
  expect(await head()).toContain('stop-color="#2B2522"')

  // Picked back to what the session runs on, and closed: nothing waits.
  await ui.press({ key: 'saiyan-pick' })
  await ui.press({ key: 'quick-model-opus' })
  await ui.press({ key: 'quick-model-haiku' })
  await ui.press({ key: 'saiyan-pick' })
  await send()
  await $.turn.complete({ reason: 'answer', text: 'done' } as never)
  expect(runs.length).toBe(3)
  // The bar put away closes it too.
  await ui.press({ key: 'saiyan-pick' })
  await ui.press({ key: 'saiyan-hide' })
  await command($, 'saiyan', 'usage')
  expect(await isOpen()).toBe(false)
  await ui.unmount()
})

test('the usage view unfolds, speaks the flag’s language, and comes up on an alert', FR, async ($, on) => {
  const { toasts } = engine(on)
  await start($)
  await $.session.measure(measure(CALM))
  const { text } = await command($, 'limits')
  expect(text).toBe('Session 5h : 33 % · Remise à zéro dans 51m · À ce rythme : ~40 % à la remise à zéro\n' + 'Hebdomadaire : 11 % · Remise à zéro dans 5j 4h · À ce rythme : ~42 % à la remise à zéro')
  const ui = await mount($)
  // The mascot, the head, then three blocks of an icon and a row each.
  expect((await ui.findAll({ type: 'Svg' })).filter((s: any) => String(s.props.alt).trim()).length).toBe(8)
  expect(await alts(ui)).toMatch(/Remise à zéro dans 51m/)
  await ui.press({ key: 'saiyan-lang' })
  expect(await alts(ui)).toMatch(/Sesión 5h 33 %/)
  await ui.press({ key: 'saiyan-lang' })
  await ui.press({ key: 'saiyan-lang' })
  await ui.press({ key: 'limits-toggle' })

  await ui.press({ key: 'saiyan-hide' })
  expect(await ui.find({ key: 'saiyan-hide' })).toBe(undefined)
  await $.session.measure(measure(TENSE))
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toMatch(/^Limites · Session 5h : 75 % utilisés\./)
  expect(await alts(ui)).toMatch(/Limites: Session 5h 78/)
  await ui.unmount()
})

test('unfolded, the limits view draws the context, the 5-hour window and the week as the agents view draws its agents', FR, async ($, on) => {
  engine(on)
  on('session.turns', () => ({ value: 3 }) as never)
  await start($)
  // The week reported first: the blocks still go context, 5 hours, week.
  await $.session.measure({ ...measure([...CALM].reverse()), context: { tokens: 420_000, window: 1_000_000, percent: 42 }, cost: { usd: 3.2 } } as never)
  await command($, 'limits')
  const ui = await mount($)
  const blocks = async () => {
    const svgs = await ui.findAll({ type: 'Svg' })
    return {
      icons: svgs.filter((s: any) => s.props.width === 30).map((s: any) => String(s.props.alt)),
      rows: svgs.filter((s: any) => s.props.height === 46),
    }
  }
  const { icons, rows } = await blocks()
  expect(icons).toEqual(['Contexte', 'Session 5h', 'Hebdomadaire'])
  expect(rows.map((r: any) => String(r.props.alt).split('. ')[0])).toEqual(['Contexte 42\u202f%', 'Session 5h 33\u202f%', 'Hebdomadaire 11\u202f%'])
  expect(String(rows[0].props.alt)).toBe('Contexte 42\u202f%. 420 k sur 1 M jetons')
  // In words, only the time left until the reset; the pace is the mark on the windows' bars.
  expect(rows.slice(1).map((r: any) => String(r.props.alt).split('. ')[1])).toEqual(['Remise à zéro dans 51m', 'Remise à zéro dans 5j 4h'])
  expect(rows.map((r: any) => String(r.props.source).includes('class="tk"'))).toEqual([false, true, true])
  expect(await bodyPx(ui)).toBe(138)
  // The footer, as the agents view's: this session's cost, messages and time.
  const footer = JSON.stringify(await ui.find({ key: 'footer' }))
  for (const shown of ['Coût', '≈ 3,20 $', 'Messages', '"3"', 'Durée', '1m']) expect(footer).toContain(shown)

  // The context: green under 60 %, amber under 80 %, red from 80 %, its warning first then.
  const contextIcon = async () => String((await ui.findAll({ type: 'Svg' })).find((s: any) => s.props.alt === 'Contexte')?.props.source)
  const fill = (percent: number) =>
    $.session.measure({ context: { tokens: percent * 10_000, window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } as never)
  await fill(59)
  expect(await contextIcon()).toContain('#3e9c6e')
  await fill(70)
  expect(await contextIcon()).toContain('#c98a1c')
  expect(String((await blocks()).rows[0].props.alt)).toBe('Contexte 70\u202f%. 700 k sur 1 M jetons')
  await fill(80)
  expect(await contextIcon()).toContain('#d2493f')
  expect(String((await blocks()).rows[0].props.alt)).toBe('Contexte 80\u202f%. Bientôt pleine : Claude résumera la conversation · 800 k sur 1 M jetons')
  // The windows' color says where the share used stands against the mark: 33 % with 83 % of the
  // 5 hours gone is green; 50 % with 55 % gone, close under it, amber; 78 % past it, red.
  const fiveHour = async () => String((await ui.findAll({ type: 'Svg' })).find((s: any) => s.props.alt === 'Session 5h')?.props.source)
  expect(await fiveHour()).toContain('#3e9c6e')
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 50, resetsAt: IN(135) }, CALM[1]!]))
  expect(await fiveHour()).toContain('#c98a1c')
  await $.session.measure(measure(TENSE))
  expect(await fiveHour()).toContain('#d2493f')
  await ui.unmount()

  // The terminal tells the same, the context first.
  const term = await mount($, 'terminal')
  const t = await texts(term)
  expect(t.indexOf('Contexte')).toBeLessThan(t.indexOf('Session 5h'))
  expect(t).toContain('Bientôt pleine')
  expect(t).toContain('≈ 3,20 $')
  await term.unmount()
})

test('a subagent brings the agents view up, and the batch finishes when none runs', FR, async ($, on) => {
  const { prompts } = engine(on)
  await start($)
  await $.agent.spawn(spawn('a1') as never)
  await $.agent.spawn(spawn('a2') as never)
  expect(prompts.every(p => p.includes('mcp__saiyan__step'))).toBe(true)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await mount($, surface)
    expect((await ui.find({ key: 'savvy-agents' }))?.props.label).toBe('▶')
    expect(await texts(ui)).toContain('×2')
    await ui.press({ key: 'savvy-agents' })
    const listed = surface === 'desktop' ? (await ui.findAll({ type: 'Svg' })).map((el: any) => String(el.props.source)).join('') : await texts(ui)
    expect(listed).toContain('Work a1')
    await ui.press({ key: 'savvy-agents' })
    await ui.unmount()
  }

  await $.tool.call({ tool: 'mcp__saiyan__step', agentId: 'a1', done: 2, total: 5 } as never)
  await $.turn.complete({ agentId: 'a2', reason: 'answer', text: 'done' } as never)
  const half = await mount($, 'terminal')
  expect(await texts(half)).toContain('Tâches 3/6')
  await half.unmount()
  await $.turn.complete({ agentId: 'a1', reason: 'answer', text: 'done' } as never)
  const done = await mount($, 'terminal')
  expect(await texts(done)).toContain('Terminé')
  await done.unmount()

  // The next agent brings the agents view, whatever the view on show.
  await command($, 'saiyan', 'usage')
  await $.agent.spawn(spawn('a3') as never)
  const back = await mount($)
  expect(await back.find({ key: 'savvy-agents' })).not.toBe(undefined)
  await back.unmount()
})

test('four agents spawned at once after a prompt all keep their row', FR, async ($, on) => {
  // Each agent takes its own time to start, as in the app: the later ones answer last.
  const { clock } = engine(on, {}, [], { 't-a2': 3, 't-a3': 12, 't-a4': 30 })
  await start($)
  await $.agent.spawn(spawn('old') as never)
  await $.turn.complete({ agentId: 'old', reason: 'answer', text: 'done' } as never)
  await clock.advance(60_000)
  await $.prompt.submit({ text: 'lance 4 agents', origin: { kind: 'composer' } } as never)
  const ids = ['a1', 'a2', 'a3', 'a4']
  await Promise.all(ids.map(id => $.agent.spawn(spawn(id) as never)))
  for (const id of ids) {
    const r: any = await $.tool.call({ tool: 'mcp__saiyan__step', agentId: id, done: 1, total: 3 } as never)
    expect(r.result).toBe('ok')
  }
  const ui = await mount($, 'terminal')
  expect(await texts(ui)).toContain('×4')
  expect(await texts(ui)).not.toContain('Work old')
  await ui.unmount()
})
