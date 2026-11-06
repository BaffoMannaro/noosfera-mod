export type Pair = { current: number; previous: number | null }

export type Entry = {
  client: string
  title: string
  kind?: string
  due: string
  time: string | null
  days_left: number
  channels: string[]
  flags: string[]
  link: string
}

export type Suggestion = {
  id: string
  label: string
  text: string
  keywords: string[]
  section?: string
  agent?: string
}

export type Job = { id: string; title: string; steps: { uses: string[] }[] }

export type Agent = {
  id: string
  name: string
  nickname: string
  summary: string
  color: string
  avatar: string | null
  orient: Job
  tasks: Job[]
}

/** What the connector's claude_code_panel answers (src/lib/mcp-panel-features.ts in Noosfera). */
export type Panel = {
  me: { name: string; superadmin: boolean; sections: Record<string, boolean> }
  studio_url: string
  usage: { scope: 'personal' | 'team'; percent: number; resets_at: string } | null
  projects: { mine: number; latest: { name: string; client: string | null; last_activity: string; link: string }[] }
  dashboard?: {
    today: string
    kpis: { views: Pair; interactions: Pair; followers: number | null; sessions: Pair; contacts: Pair; adSpend: Pair }
    chart?: { days: string[]; views: Record<string, (number | null)[]>; interactions: Record<string, (number | null)[]> }
    urgent_counts: Record<string, number>
    urgent: Entry[]
    upcoming: Entry[]
    social?: { key?: string; chart?: { days: string[]; views: Record<string, (number | null)[]>; interactions: Record<string, (number | null)[]> } | null; name: string; networks: string[]; views: Pair; interactions: Pair; followers: number | null; followers_change: number | null; link: string }[]
    sites: { name: string; url?: string; client_key?: string | null; client?: string | null; red: number; amber: number; performance?: number | null; sessions?: Pair | null; contacts?: number | null; checked?: string | null }[]
    sites_total?: number
    sites_alerts?: number
    my_month: { spent_usd: number; limit_usd: number | null; activities?: Record<string, number> } | null
    team_month: { spent_usd: number; budget_usd: number; people?: { name: string; spent_usd: number; limit_usd: number | null; me: boolean }[] }
  }
  agents?: Agent[]
  suggestions: Suggestion[]
}

export type Load =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; at: number }
  | { state: 'missing' }
  | { state: 'error'; message: string }
  /** Auto mode refused the read: the tool names to allow (mcp__<server>__studio_run). */
  | { state: 'auto'; tools: string[] }

export type Tab = 'overview' | 'social' | 'sites' | 'plans' | 'usage'

/** An agent at work, followed from its agent_start call to the end of the turn. */
export type Run = {
  id: string
  agent: string
  task: string | null
  title: string
  prefix: string
  startedAt: number
  endedAt: number | null
  steps: { uses: string[]; done: boolean }[]
  calls: number
  now: string | null
  startTokens: number
  tokens: number
  startCost: number
  cost: number
  status: 'running' | 'waiting' | 'done'
}

declare module 'claude-code' {
  interface PluginState {
    noosfera: {
      panel: Shaped<Panel | null>
      load: Load
      matches: Shaped<Suggestion[]>
      draft: string
      bandHidden: boolean
      tab: Tab
      picked: string | null
      runs: Shaped<Run[]>
      tick: number
      /** The consumption band of token-weather-usage, hidden from the Noosfera band. */
      usageHidden: boolean
      /** The client the Social and Sites tabs show: a client key, or 'all'. */
      client: string
    }
  }
}
