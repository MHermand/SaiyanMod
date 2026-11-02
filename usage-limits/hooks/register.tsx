import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Reading } from '../types'
import {
  ago,
  alertText,
  cellBar,
  detailSvg,
  dueAlerts,
  firedKeys,
  headline,
  headSvg,
  limitsOf,
  liveFired,
  nameOf,
  notes,
  paceColumn,
  paceNote,
  pct,
  pillOf,
  resetNote,
  rowNote,
  rowSvg,
  summary,
  windowOf,
  words,
  worst,
} from './limits'
import type { Lang, Status, Window } from './limits'

const reading = atom({ plugin: 'usage-limits', key: 'reading' } as const, null)
const now = atom({ plugin: 'usage-limits', key: 'now' } as const, 0)
const panel = atom({ plugin: 'usage-limits', key: 'panel' } as const, { isOpen: false, isHidden: false })
const language = atom({ plugin: 'usage-limits', key: 'lang' } as const, 'en')

// The last reading, so a new session shows the band before its first reply;
// and the alerts shown per window, so another session does not show them again.
const READING_KEY = 'reading'
const FIRED_KEY = 'fired'
const LANG_KEY = 'language'

// The flag in the unfolded band cycles these; its pick is kept in the store, across sessions.
const FLAGS: readonly [Lang, string][] = [['en', '🇺🇸'], ['fr', '🇫🇷'], ['es', '🇪🇸']]
const isLang = (v: unknown): v is Lang => FLAGS.some(([l]) => l === v)

const TICK_MS = 30_000
const ALERT_MS = 8_000

// The terminal's colors for the three states; the desktop's are in the SVGs.
const COLOR: Record<Status, string> = { ok: '#5bbe8a', tight: '#e7ae45', over: '#ef6b5f' }

let lang: Lang = 'en'
let isAlerting = true
let ticker: { cancel: () => void } | null = null

// A language named in words or as a code; English for any other.
const langOf = (v: string): Lang => (/^(fr|fran)/i.test(v) ? 'fr' : /^(es|span|espa)/i.test(v) ? 'es' : 'en')

// The flag's last pick; before any, the `language` option; on auto, Claude Code's own
// language setting, then the locale.
const detectLang = async ($: EngineInterface, option: unknown): Promise<Lang> => {
  const picked = await $.store.get(LANG_KEY)
  if (isLang(picked)) return picked
  if (isLang(option)) return option
  const rows = await $.config.list().catch(() => [])
  const setting = rows.find(r => r.key === 'language')?.value
  if (typeof setting === 'string' && setting.trim()) return langOf(setting.trim())
  try {
    return langOf(Intl.DateTimeFormat().resolvedOptions().locale)
  } catch {
    return 'en'
  }
}

// Draws the band and words /limits in `next`, and keeps the pick for the next sessions.
const useLang = async ($: EngineInterface, next: Lang) => {
  lang = next
  await update($, language, () => next)
  await $.command.register({ name: 'limits', description: words(next).commandHelp })
}

// The flag moves on to the next language.
const nextLang = async ($: EngineInterface) => {
  const at = FLAGS.findIndex(([l]) => l === lang)
  const next = FLAGS[(at + 1) % FLAGS.length]?.[0] ?? 'en'
  await $.store.set(LANG_KEY, next)
  await useLang($, next)
}

const storedReading = (v: unknown): Reading | null => {
  if (!v || typeof v !== 'object' || typeof (v as Reading).at !== 'number') return null
  const limits = limitsOf((v as Reading).limits)
  return limits.length ? { limits, at: (v as Reading).at } : null
}

// Toasts what each window newly owes, once across sessions, and shows the band again.
const alert = async ($: EngineInterface, ws: readonly Window[], at: number) => {
  if (!isAlerting) return
  const fired = liveFired(await $.store.get(FIRED_KEY), at)
  const due = dueAlerts(ws, fired)
  if (!due.length) return
  for (const a of due) {
    fired[a.id] = [...new Set([...(fired[a.id] ?? []), ...firedKeys(a)])]
    $.ui.toast(alertText(a, at, lang), { timeoutMs: ALERT_MS })
  }
  await $.store.set(FIRED_KEY, fired)
  await update($, panel, p => ({ ...p, isHidden: false }))
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

export const register: Register = (on, options) => {
  isAlerting = options.alerts !== 'off'

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await useLang($, await detectLang($, options.language))
    ticker?.cancel()
    ticker = $.clock.every(TICK_MS, () => void $.clock.now().then(t => update($, now, () => t)))
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
    return started
  })

  // Pushed after each turn and whenever a window moves a whole point.
  on('session.measure', async ($, e, next) => {
    const limits = limitsOf(e.rateLimits)
    if (limits.length) await take($, limits)
    return next(e)
  })

  on('command.run', { command: 'limits' }, async $ => {
    await update($, panel, () => ({ isOpen: true, isHidden: false }))
    const r = await read($, reading)
    const at = await $.clock.now()
    return {
      text: summary(
        (r?.limits ?? []).map(l => windowOf(l, at)),
        at,
        lang,
      ),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, reading)
    const p = await read($, panel)
    const lang = await read($, language)
    if (!r || p.isHidden || e.props.hasSurvey) return next(e)
    // Draw this band with the other mods' bands beneath it. Claude Code's own placeholder
    // ({ type: 'engine' }) is never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const at = Math.max(await read($, now), r.at)
    const ws = r.limits.map(l => windowOf(l, at))
    const heads = headline(ws)
    const s = words(lang)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const alt = heads.map(w => `${nameOf(w.kind, lang).long} ${pct(w.used, lang)}, ${rowNote(w, at, lang).text}`).join(' · ')
    const controls = (
      <Box flexDirection="row" alignItems="center" flexShrink={0}>
        {p.isOpen && (
          <Button key="limits-lang" label={FLAGS.find(([l]) => l === lang)?.[1] ?? '🌐'} plain onPress={() => nextLang($)} />
        )}
        <Button
          key="limits-toggle"
          label={p.isOpen ? '▼' : '▶'}
          plain
          onPress={() => update($, panel, q => ({ ...q, isOpen: !q.isOpen }))}
        />
        <Button key="limits-hide" label="✕" plain role="dismiss" onPress={() => update($, panel, q => ({ ...q, isHidden: true }))} />
      </Box>
    )

    // The terminal's element table is completed with an `Svg` that draws nothing: test the surface too.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      // Drawn a little wider than the slot is likely to be, without a width: the
      // surface scales it down to the room the controls leave.
      const cols = e.props.bodyColumns || 100
      const rowW = Math.max(260, Math.min(1600, cols * 9 - 72))
      const W = Math.max(260, Math.min(1600, cols * 9 - 16))
      // The pace notes of every row start in one column.
      const paceX = paceColumn(ws, at, lang)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Box flexGrow={1} flexShrink={1}>
              {p.isOpen ? (
                <Svg source={headSvg(ws, rowW, r.at, at, lang)} alt={`${s.title}: ${alt}`} />
              ) : (
                <Svg source={rowSvg(heads, rowW, at, lang)} alt={`${s.title}: ${alt}`} />
              )}
            </Box>
            {controls}
          </Box>
          {p.isOpen && (
            <Box key="details" flexDirection="column" gap={1} marginTop={1}>
              {ws.map(w => (
                <Box key={w.kind}>
                  <Svg
                    source={detailSvg(w, W, at, lang, paceX)}
                    alt={`${nameOf(w.kind, lang).long} ${pct(w.used, lang)}. ${notes(w, at, lang).join('. ')}`}
                  />
                </Box>
              ))}
            </Box>
          )}
          {below}
        </Box>
      )
    }

    // Terminal: the same content in text rows, the pace mark a thin bar across the cells.
    const cols = e.props.bodyColumns
    const cells = (w: Window, width: number) =>
      cellBar(w, width).map((c, i) =>
        c.part === 'used' ? (
          <Text key={`c${i}`} color={COLOR[w.status]}>
            {c.text}
          </Text>
        ) : c.part === 'mark' ? (
          <Text key={`c${i}`}>{c.text}</Text>
        ) : (
          <Text key={`c${i}`} dimColor>
            {c.text}
          </Text>
        ),
      )
    const barW = Math.max(6, Math.min(20, Math.floor((cols - 24) / Math.max(1, heads.length)) - 22))
    // The pace notes of every row start in one column.
    const resetW = Math.max(0, ...ws.map(w => resetNote(w, at, lang).length)) + 3
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Text>
            <Text color={COLOR[worst(heads)]}>●</Text> <Text bold>{s.title}</Text>
          </Text>
          {heads.map(w => {
            const note = rowNote(w, at, lang)
            return (
              <Text key={w.kind} wrap="truncate-end">
                <Text bold>{nameOf(w.kind, lang).short}</Text> {cells(w, barW)}{' '}
                {note.isWarning ? (
                  <Text bold color={COLOR[w.status]}>
                    {pct(w.used, lang)} {note.text}
                  </Text>
                ) : (
                  <Text>
                    <Text bold>{pct(w.used, lang)}</Text> <Text dimColor>{note.text}</Text>
                  </Text>
                )}
              </Text>
            )
          })}
          {controls}
        </Box>
        {p.isOpen && (
          <Box key="details" flexDirection="column" marginTop={1}>
            {ws.map(w => {
              const chip = pillOf(w, lang)
              return (
                <Box key={w.kind} flexDirection="column" marginBottom={1}>
                  <Text wrap="truncate-end">
                    <Text bold>{nameOf(w.kind, lang).long}</Text> <Text bold>{pct(w.used, lang)}</Text>
                    {chip ? <Text color={COLOR[w.used >= 100 ? 'over' : w.status]}> · {chip}</Text> : ''}
                  </Text>
                  <Text>{cells(w, Math.max(10, Math.min(60, cols - 4)))}</Text>
                  <Text dimColor wrap="truncate-end">
                    {resetNote(w, at, lang).padEnd(resetW)}
                    {paceNote(w, at, lang)}
                  </Text>
                </Box>
              )
            })}
            <Text dimColor wrap="truncate-end">
              {s.updated(ago(r.at, at, lang))}
            </Text>
          </Box>
        )}
        {below}
      </Box>
    )
  })
}
