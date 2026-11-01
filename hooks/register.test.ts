import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'agents-progress'
const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }

const spawn = (id: string, subagentType: string) => ({
  tool_use_id: `t-${id}`,
  prompt: 'Do the work.',
  description: `Work ${id}`,
  subagentType,
  provider: 'engine',
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
})

// The count beside the mascot, in whatever Text the surface draws it.
const countOf = async (m: { findAll: (q: { type: string }) => Promise<unknown[]> }): Promise<string> => JSON.stringify(await m.findAll({ type: 'Text' }))

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: any subagent drives the bar, and a batch finishes when none runs`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    const opened: string[] = []
    on('ui.open', (_$, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })
    const prompts: string[] = []
    on('agent.spawn', (_$, e) => {
      prompts.push(e.prompt)
      // a1 runs on Opus, the others on Sonnet.
      return { model: e.tool_use_id === 't-a1' ? 'claude-opus-5-5' : 'claude-sonnet-5-5', agentId: e.tool_use_id.replace('t-', '') } as never
    })
    on('turn.complete', () => ({ text: '' }) as never)
    on('prompt.submit', (_$, e) => ({ text: e.text }))

    await $.agent.spawn(spawn('a1', 'general-purpose') as never)
    await $.agent.spawn(spawn('a2', 'Explore') as never)
    // Every subagent, savvy or not, is asked to report its steps; no separate panel opens.
    expect(prompts.every(p => p.includes('mcp__agents-progress__step'))).toBe(true)
    expect(opened).toEqual([])

    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    const crew = await ui.find({ key: 'savvy-agents' })
    expect(crew?.props.label).toBe('▶')
    expect(await countOf(ui)).toContain('×2')
    // The bar wears the turn's strongest head: Opus's blue hair, though Sonnet's agent came last.
    const crewHead = async (m: Awaited<ReturnType<typeof $.ui.mount>>) => String((await m.findAll({ type: 'Svg' })).find(el => el.props.width === 22)?.props.source)
    if (surface === 'desktop') expect(await crewHead(ui)).toContain('#3FC8F5')
    // The arrow folds the list out under the bar, each agent with its model's mascot (Sonnet's golden hair).
    await ui.press({ key: 'savvy-agents' })
    await ui.unmount()
    const open = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect((await open.find({ key: 'savvy-agents' }))?.props.label).toBe('▼')
    const listed = surface === 'desktop' ? (await open.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('') : JSON.stringify(await open.findAll({ type: 'Text' }))
    expect(listed).toContain('Work a1')
    if (surface === 'desktop') expect(listed).toContain('#FFD93B')
    await open.unmount()

    await $.turn.complete({ agentId: 'a1', reason: 'answer' } as never)
    const half = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    const halfText = surface === 'desktop' ? String((await half.find({ type: 'Svg' }))?.props.source) : JSON.stringify(await half.findAll({ type: 'Text' }))
    expect(halfText).toContain('1/2')
    // Opus is done, Sonnet still works: the head stays Opus's, the turn's strongest.
    if (surface === 'desktop') expect(await crewHead(half)).toContain('#3FC8F5')
    await half.unmount()

    await $.turn.complete({ agentId: 'a2', reason: 'answer' } as never)
    const done = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    const doneText = surface === 'desktop' ? String((await done.find({ type: 'Svg' }))?.props.source) : JSON.stringify(await done.findAll({ type: 'Text' }))
    expect(doneText).toContain('Done')
    await done.unmount()

    // The next subagent starts a new batch.
    await $.agent.spawn(spawn('a3', 'general-purpose') as never)
    const next = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    const nextText = surface === 'desktop' ? String((await next.find({ type: 'Svg' }))?.props.source) : JSON.stringify(await next.findAll({ type: 'Text' }))
    expect(nextText).toContain('0/1')
    expect(opened).toEqual([])
    await next.unmount()

    // Past three agents, the list shows the newest three and the arrows reach the rest.
    await $.agent.spawn(spawn('a4', 'general-purpose') as never)
    const textOf = async (m: Awaited<ReturnType<typeof $.ui.mount>>) =>
      surface === 'desktop' ? (await m.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('') : JSON.stringify(await m.findAll({ type: 'Text' }))
    const paged = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect(await textOf(paged)).not.toContain('Work a1')
    await paged.press({ key: 'savvy-down' })
    await paged.unmount()
    const scrolled = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect(await textOf(scrolled)).toContain('Work a1')
    await scrolled.unmount()

    // An agent's notification enters as a prompt too: the list stays open, nothing is dropped.
    await $.turn.complete({ agentId: 'a3', reason: 'answer' } as never)
    await $.prompt.submit({ text: 'done', origin: { kind: 'task-notification' } } as never)
    const notified = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect((await notified.find({ key: 'savvy-agents' }))?.props.label).toBe('▼')
    expect(await countOf(notified)).toContain('×4')
    await notified.unmount()

    // The person's prompt folds the list and keeps the bar as it is...
    await $.prompt.submit({ text: 'next', origin: { kind: 'human' } } as never)
    const folded = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect((await folded.find({ key: 'savvy-agents' }))?.props.label).toBe('▶')
    expect(await countOf(folded)).toContain('×4')
    await folded.unmount()

    // ...until the next agent: then the list holds the agents running at the prompt (a4) and the new one.
    await $.agent.spawn(spawn('a5', 'general-purpose') as never)
    const fresh = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect((await fresh.find({ key: 'savvy-agents' }))?.props.label).toBe('▶')
    expect(await countOf(fresh)).toContain('×2')
    expect(await countOf(fresh)).not.toContain('×4')
    await fresh.press({ key: 'savvy-agents' })
    await fresh.unmount()
    const listed2 = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    const text2 = await textOf(listed2)
    expect(text2).toContain('Work a4')
    expect(text2).toContain('Work a5')
    expect(text2).not.toContain('Work a3')
    await listed2.unmount()

    // The flag at the foot of the list cycles US, FR, ES and back, keeps its pick in the store,
    // and the list speaks the flag's language.
    const flagOf = async () => {
      const m = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
      const label = (await m.find({ key: 'savvy-lang' }))?.props.label
      const words = JSON.stringify(await m.findAll({ type: 'Text' }))
      return { m, label, words }
    }
    const us = await flagOf()
    expect(us.label).toBe('🇺🇸')
    expect(us.words).toContain('Cost')
    await us.m.press({ key: 'savvy-lang' })
    await us.m.unmount()
    const fr = await flagOf()
    expect(fr.label).toBe('🇫🇷')
    expect(fr.words).toContain('Coût')
    await fr.m.press({ key: 'savvy-lang' })
    await fr.m.unmount()
    const es = await flagOf()
    expect(es.label).toBe('🇪🇸')
    expect(es.words).toContain('Coste')
    await es.m.press({ key: 'savvy-lang' })
    await es.m.unmount()
    const usAgain = await flagOf()
    expect(usAgain.label).toBe('🇺🇸')
    await usAgain.m.unmount()

    // ✕ hides the bar; the next agent brings it back.
    const bar = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    await bar.press({ key: 'savvy-dismiss' })
    await bar.unmount()
    await $.agent.spawn(spawn('a6', 'general-purpose') as never)
    const back = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect(await back.find({ key: 'savvy-agents' })).toBeTruthy()
  })
}

test('a flag picked in an earlier session is the next session’s language', async ($, on) => {
  mock.clock(on)
  // The store as an earlier session left it, after a press on the flag.
  mock.store(on, { language: 'fr' })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id.replace('t-', '') }) as never)
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.agent.spawn(spawn('b1', 'general-purpose') as never)
  const m = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: band })
  await m.press({ key: 'savvy-agents' })
  await m.unmount()
  const open = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: band })
  expect((await open.find({ key: 'savvy-lang' }))?.props.label).toBe('🇫🇷')
  expect(JSON.stringify(await open.findAll({ type: 'Text' }))).toContain('Coût')
})

test('the bar counts the steps the agents report, an agent reporting none as one', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id.replace('t-', '') }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  for (const id of ['c1', 'c2', 'c3']) await $.agent.spawn(spawn(id, 'general-purpose') as never)
  // c1 plans five steps and has done two; c2 and c3 report none.
  await $.tool.call({ tool: 'mcp__agents-progress__step', agentId: 'c1', done: 2, total: 5 } as never)
  const barOf = async () => {
    const m = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: band })
    const words = JSON.stringify(await m.findAll({ type: 'Text' }))
    await m.unmount()
    return words
  }
  expect(await barOf()).toContain('Tasks 2/7')
  // c2 finishes: its one step is done.
  await $.turn.complete({ agentId: 'c2', reason: 'answer' } as never)
  expect(await barOf()).toContain('Tasks 3/7')
  // c1 finishes: all five of its steps count as done.
  await $.turn.complete({ agentId: 'c1', reason: 'answer' } as never)
  expect(await barOf()).toContain('Tasks 6/7')
})
