import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { dueAlerts, firedKeys, span, windowOf } from './limits'

// The 5-hour window resets in 51 minutes, the week in 5 days 4 hours.
const NOW = Date.parse('2026-11-01T00:39:00Z')
const IN = (min: number) => new Date(NOW + min * 60_000).toISOString()
const CALM = [
  { kind: 'five_hour', percentUsed: 33, resetsAt: IN(51) },
  { kind: 'seven_day', percentUsed: 11, resetsAt: '2026-11-06T05:00:00.096Z' },
]
// 78% used with only 55% of the window gone.
const TENSE = [
  { kind: 'five_hour', percentUsed: 78, resetsAt: IN(135) },
  { kind: 'seven_day', percentUsed: 19, resetsAt: '2026-11-06T05:00:00.096Z' },
]

const BAND = {
  plugin: 'usage-limits',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const FR = { options: { language: 'fr' } }

// Stands for the engine beneath the plugin, and records its toasts. The band
// the engine draws when no plugin does is an empty Box here.
const engine = (on: On, store: Record<string, unknown> = {}, isBandBeneath = true) => {
  const toasts: string[] = []
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, store)
  if (isBandBeneath) {
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
  }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('config.list', () => ({ value: [] }))
  on('command.register', () => ({ value: { command: 'limits' } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { toasts, clock }
}

const measure = (rateLimits: typeof CALM) => ({ context: { window: 1_000_000 }, rateLimits, changed: ['rateLimits' as const] })

test('the pace: on track below the mark, a time for the limit past it', () => {
  const [five, week] = CALM.map(l => windowOf(l, NOW))
  expect(five?.status).toBe('ok')
  expect(Math.round(five?.projected ?? 0)).toBe(40)
  expect(Math.round((five?.elapsed ?? 0) * 100)).toBe(83)
  expect(week?.status).toBe('ok')
  expect(Math.round(week?.projected ?? 0)).toBe(42)

  const tense = windowOf(TENSE[0]!, NOW)
  expect(tense.status).toBe('over')
  // At 78% in 165 minutes, 100% comes at 211.5 minutes: 46.5 from now, before the reset.
  expect(Math.round(((tense.hitAt ?? 0) - NOW) / 60_000)).toBe(47)

  // A reset since the reading: nothing used, nothing to project.
  const reset = windowOf(CALM[0]!, NOW + 60 * 60_000)
  expect(reset.isReset).toBe(true)
  expect(reset.used).toBe(0)
})

test('the time left: days and hours past a day, hours and minutes within one', () => {
  const MIN = 60_000
  expect(span((5 * 24 * 60 + 4 * 60 + 21) * MIN, 'fr')).toBe('5j 4h')
  expect(span(26 * 60 * MIN, 'fr')).toBe('1j 2h')
  expect(span(26 * 60 * MIN, 'en')).toBe('1d 2h')
  expect(span(24 * 60 * MIN, 'fr')).toBe('1j 0h')
  expect(span((23 * 60 + 59) * MIN, 'fr')).toBe('23h 59m')
  expect(span(125 * MIN, 'fr')).toBe('2h 5m')
  expect(span(42 * MIN, 'fr')).toBe('42m')
  expect(span(10_000, 'fr')).toBe('1m')
})

test('too early in a window, the pace is not projected', () => {
  const w = windowOf({ kind: 'five_hour', percentUsed: 6, resetsAt: IN(290) }, NOW)
  expect(w.projected).toBe(null)
  expect(w.status).toBe('ok')
})

test('alerts: a jump past both thresholds owes the higher, then nothing again', () => {
  const w = windowOf({ kind: 'five_hour', percentUsed: 92, resetsAt: IN(30) }, NOW)
  const due = dueAlerts([w], {})
  expect(due.map(a => a.key)).toEqual(['90'])
  const fired = { [due[0]!.id]: firedKeys(due[0]!) }
  expect(dueAlerts([w], fired)).toEqual([])

  // Ahead of the pace with no threshold crossed: the pace alert, once.
  const ahead = windowOf({ kind: 'seven_day', percentUsed: 30, resetsAt: '2026-11-06T05:00:00.096Z' }, NOW)
  const pace = dueAlerts([ahead], {})
  expect(pace.map(a => a.key)).toEqual(['pace'])
  expect(dueAlerts([ahead], { [pace[0]!.id]: firedKeys(pace[0]!) })).toEqual([])
})

test('the band shows both windows, on the terminal and the desktop', FR, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(CALM))

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const row = await desktop.find({ type: 'Svg' })
  expect(String(row?.props.alt)).toBe('Limites: Session 5h 33\u202f%, ↻ 51m · Semaine 11\u202f%, ↻ 5j 4h')
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await terminal.find({ type: 'Text', text: /^33\u202f%$/ }))?.text).toBe('33\u202f%')
  expect((await terminal.find({ type: 'Text', text: /^Semaine$/ }))?.text).toBe('Semaine')
  await terminal.unmount()
})

test('the arrow unfolds the details and ✕ hides the band', FR, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(CALM))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'limits-toggle' })
    const details =
      surface === 'desktop'
        ? String((await ui.findAll({ type: 'Svg' })).map(s => s.props.alt).join('\n'))
        : (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(details).toMatch(/Remise à zéro dans 51m/)
    expect(details).toMatch(/À ce rythme : ~40\u202f% à la remise à zéro/)
    await ui.press({ key: 'limits-toggle' })
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'limits-hide' })
  expect(await ui.find({ type: 'Svg' })).toBe(undefined)
  await ui.unmount()
})

test('another band drawn beneath stays drawn under this one', FR, async ($, on) => {
  engine(on, {}, false)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>agents band</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(CALM))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).not.toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /agents band/ }))?.text).toBe('agents band')
  await ui.unmount()
})

test('alerts show once per window, across sessions, and bring a hidden band back', FR, async ($, on) => {
  const { toasts } = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(CALM))
  expect(toasts).toEqual([])

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'limits-hide' })
  expect(await ui.find({ type: 'Svg' })).toBe(undefined)

  await $.session.measure(measure(TENSE))
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toMatch(/^Limites · Session 5h : 75\u202f% utilisés\. À ce rythme, limite atteinte vers \d\d:\d\d \(remise à zéro dans 2h 15m\)\.$/)
  expect(await ui.find({ type: 'Svg' })).not.toBe(undefined)
  await ui.unmount()

  // The same window a point higher, then a new session: nothing new.
  await $.session.measure(measure([{ ...TENSE[0]!, percentUsed: 79 }, TENSE[1]!]))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(TENSE))
  expect(toasts.length).toBe(1)
})

test('alerts off shows none', { options: { language: 'fr', alerts: 'off' } }, async ($, on) => {
  const { toasts } = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(TENSE))
  expect(toasts).toEqual([])
})

test('/limits unfolds the band and prints the windows', FR, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(CALM))

  const { text } = await $.command.run({
    command: 'limits',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
  expect(text).toBe('Session 5h : 33\u202f% · Remise à zéro dans 51m · À ce rythme : ~40\u202f% à la remise à zéro\n' + 'Semaine : 11\u202f% · Remise à zéro dans 5j 4h · À ce rythme : ~42\u202f% à la remise à zéro')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(3)
  await ui.unmount()
})

test('a new session shows the last reading before its first reply', FR, async ($, on) => {
  engine(on, { reading: { limits: CALM, at: NOW - 5 * 60_000 } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'limits-toggle' })
  expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toMatch(/^Limites: Session 5h 33/)
  await ui.unmount()
})

test('a stored reading of another shape draws no band', FR, async ($, on) => {
  engine(on, { reading: { limits: 'five_hour', at: 'yesterday' } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBe(undefined)
  await ui.unmount()
})

test('the flag cycles the language, kept across sessions', FR, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(CALM))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'limits-lang' })).toBe(undefined)
  await ui.press({ key: 'limits-toggle' })
  expect((await ui.find({ type: 'Button', key: 'limits-lang' }))?.props.label).toBe('🇫🇷')

  await ui.press({ key: 'limits-lang' })
  const alts = async () => (await ui.findAll({ type: 'Svg' })).map(e => String(e.props.alt)).join('\n')
  expect(await alts()).toMatch(/^Límites: Sesión 5h 33\u202f%, ↻ 51m/)
  expect(await alts()).toMatch(/Se reinicia en 51m\. A este ritmo: ~40\u202f% al reiniciarse/)

  // A new session keeps the pick over the `language` option.
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await ui.find({ type: 'Button', key: 'limits-lang' }))?.props.label).toBe('🇪🇸')
  await ui.press({ key: 'limits-lang' })
  expect(await alts()).toMatch(/^Limits: 5h session 33%, ↻ 51m · Week 11%, ↻ 5d 4h/)
  await ui.unmount()
})

test('the pace notes of both unfolded rows start in one column', FR, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(CALM))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'limits-toggle' })
  const xs = (await ui.findAll({ type: 'Svg' }))
    .map(e => /<text class="m" x="([\d.]+)" y="55"[^>]*>À ce rythme/.exec(String(e.props.source))?.[1])
    .filter(Boolean)
  expect(xs.length).toBe(2)
  expect(xs[0]).toBe(xs[1])
  await ui.unmount()
})
