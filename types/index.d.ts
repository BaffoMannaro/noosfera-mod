export type Pair = { current: number; previous: number | null }

export type Entry = {
  client: string
  title: string
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

/** What the connector's claude_code_panel answers (src/lib/mcp-panel-features.ts in Noosfera). */
export type Panel = {
  me: { name: string; superadmin: boolean; sections: Record<string, boolean> }
  studio_url: string
  usage: { scope: 'personal' | 'team'; percent: number; resets_at: string } | null
  projects: { mine: number; latest: { name: string; client: string | null; last_activity: string; link: string }[] }
  dashboard?: {
    today: string
    kpis: { views: Pair; interactions: Pair; followers: number | null; sessions: Pair; contacts: Pair; adSpend: Pair }
    urgent_counts: Record<string, number>
    urgent: Entry[]
    upcoming: Entry[]
    sites: { name: string; red: number; amber: number }[]
    my_month: { spent_usd: number; limit_usd: number | null } | null
    team_month: { spent_usd: number; budget_usd: number }
  }
  suggestions: Suggestion[]
}

export type Load =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; at: number }
  | { state: 'missing' }
  | { state: 'error'; message: string }

declare module 'claude-code' {
  interface PluginState {
    noosfera: {
      panel: Shaped<Panel | null>
      load: Load
      matches: Shaped<Suggestion[]>
      draft: string
      bandHidden: boolean
    }
  }
}
