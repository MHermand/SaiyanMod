// --- the bar: which view it shows, and whether it is on screen.

export type View = 'usage' | 'agents'

export type Lang = 'en' | 'fr' | 'es'

// --- the agents view.

export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
  /**
   * Which agents the batch counts: those started from `since` on, and `keep`, the ones
   * still running from before. Absent on a batch begun before these were kept.
   */
  since?: number
  keep?: string[]
  /** When the last of its agents finished. */
  finishedAt?: number
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
}

export type AgentsPanel = {
  /** First agent shown in the list, newest first. */
  listOffset: number
  /**
   * Set by the person's prompt: the agents running when it was sent. The next
   * agent spawned drops every other one from the list; absent, nothing pending.
   */
  keepIds?: string[]
  /** When that prompt was sent: an agent started since is never dropped. */
  keepFrom?: number
}

// --- the usage view.

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

// --- the model and the effort.

export type Family = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
/** `model`: the main thread's model id as its last request named it (`claude-opus-5-5`). */
export type Current = { family: Family | null; effort: Effort | null; noEffort: Family[]; model?: string }
/** The quick choice under the bar: the model and effort picked, applied only on Ok. */
export type Draft = { family: Family | null; effort: Effort | null }

/** The session's figures as `$.session.usage()` and `session.measure` give them. */
export type Gauge = {
  /** The context's fill: tokens, the window, and their share in percent. */
  tokens?: number
  window?: number
  percent?: number
  costUsd?: number
  startedAt?: number
  /** Prompts the person has sent. */
  turns?: number
}

declare module 'claude-code' {
  interface PluginState {
    saiyan: {
      view: View
      isShown: boolean
      /** Unfolded or folded, the same in every view. */
      isUnfolded: boolean
      /** The model and effort picked under the bar, waiting for the next message; null, none. */
      draft: Draft | null
      /** Whether the quick choice stands open under the bar, opened from the mascot. */
      isPicking: boolean
      lang: Lang
      flow: Flow | null
      agents: AgentRun[]
      agentsPanel: AgentsPanel
      now: number
      reading: Reading | null
      current: Current
      gauge: Gauge
    }
  }
}
