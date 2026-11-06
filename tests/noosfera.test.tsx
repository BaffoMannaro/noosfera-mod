import { expect, test } from 'claude-code/testing'

const PANEL = {
  me: { name: 'Giulia', superadmin: true, sections: { plans: true } },
  studio_url: 'https://studio.maurodev.it',
  usage: { scope: 'team', percent: 42, resets_at: '2026-12-01' },
  projects: { mine: 2, latest: [{ name: 'Natale', client: 'Fioreria Rossi', last_activity: '2026-11-05', link: 'https://studio.maurodev.it/p/x' }] },
  dashboard: {
    today: '2026-11-06',
    kpis: { views: { current: 12400, previous: 10000 }, interactions: { current: 800, previous: 1000 }, followers: 3000, sessions: { current: 500, previous: null }, contacts: { current: 4, previous: 2 }, adSpend: { current: 0, previous: 0 } },
    chart: { days: ['2026-11-04', '2026-11-05'], views: { instagram: [10, 20], facebook: [5, null] }, interactions: { instagram: [1, 2], facebook: [0, 1] } },
    urgent_counts: { late: 1, due_soon: 1 },
    urgent: [{ client: 'Bar Centrale', title: 'Reel cantiere', due: '2026-11-05', time: null, days_left: -1, channels: ['instagram'], flags: ['late'], link: 'https://studio.maurodev.it/piani/bar-centrale' }],
    upcoming: [],
    social: [{ name: 'Bar Centrale', networks: ['instagram'], views: { current: 900, previous: 600 }, interactions: { current: 50, previous: 40 }, followers: 300, followers_change: 4, link: 'https://studio.maurodev.it/social/bar' }],
    sites: [{ name: 'esempio.it', url: 'https://esempio.it', red: 1, amber: 0, performance: 80 }],
    sites_total: 1,
    my_month: { spent_usd: 3.5, limit_usd: null, activities: { image: 3, chat: 0.5 } },
    team_month: { spent_usd: 10, budget_usd: 100, people: [{ name: 'Giulia', spent_usd: 3.5, limit_usd: null, me: true }] },
  },
  agents: [
    {
      id: 'social', name: 'Social media manager', nickname: 'Lilla', summary: 'I social', color: '#C2416B', avatar: null,
      orient: { id: 'orient', title: 'Orientarsi', steps: [{ uses: ['get_memory'] }] },
      tasks: [{ id: 'checkup', title: 'Check-up dei social', steps: [{ uses: ['meta_insights'] }, { uses: ['meta_media'] }, { uses: [] }] }],
    },
  ],
  suggestions: [
    { id: 'agent-social-0', label: 'Social media manager', text: 'Check-up', keywords: ['instagram', 'post'], agent: 'social' },
  ],
}

const PANE = {
  plugin: 'noosfera', component: 'Pane', requestId: 'noosfera',
  props: { title: 'Noosfera', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const
const BAND = {
  plugin: 'noosfera', component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 } },
} as const

function engine(on: Parameters<Parameters<typeof test>[1]>[1], filledWith: string[], refuse = false) {
  on('command.register', () => ({ value: { command: 'noosfera' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200000, breakdown: { mcpTools: [{ name: 'mcp__noos__studio_run', serverName: 'claude.ai Noosfera', tokens: 1, isLoaded: true }] } }, cost: { usd: 1 } } }) as never)
  on('mcp.call', (_, e) => refuse ? ({ deny: 'The server-side auto mode classifier gave no verdict' }) : ({ value: e.server === 'claude.ai Noosfera' ? { content: [{ type: 'text', text: JSON.stringify(PANEL) }] } : { isError: true, content: [] } }) as never)
  on('prompt.read', () => ({ value: { text: 'post di natale', cursor: 0 } }) as never)
  on('prompt.fill', (_, e) => { filledWith.push(e.text); return { isFilled: true, text: e.text } as never })
  on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
  on('prompt.change', (_, e) => ({ text: e.text, cursor: e.cursor }) as never)
  on('clock.now', () => ({ value: 5000 }) as never)
  on('clock.every', () => ({ value: { cancel: () => undefined } }) as never)
  on('tool.call', () => ({ result: {} }) as never)
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } as never })
}

async function start($: Parameters<Parameters<typeof test>[1]>[0]) {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'noosfera', args: '' } as never)
}

test('the pane greets the person and shows each tab', async ($, on) => {
  engine(on, [])
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg', alt: /ciao Giulia/ } as never)).toBeDefined()
  expect(await ui.find({ type: 'Link', text: /Bar Centrale: Reel cantiere/ })).toBeDefined()
  await ui.press({ key: 'tab-sites' })
  expect(await ui.find({ type: 'Link', text: /esempio\.it/ })).toBeDefined()
  await ui.press({ key: 'tab-usage' })
  expect(await ui.find({ type: 'Svg', alt: /Consumi del mese/ } as never)).toBeDefined()
  await ui.unmount()
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const t = await term.find({ type: 'Text' })
  expect(t?.text).toBe('Noosfera · Ciao Giulia')
  await term.unmount()
})

test('the band shows the agents, then the jobs, and fills the request', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'b-social' })
    await ui.press({ key: 't-social-checkup' })
    await ui.unmount()
  }
  expect(filled[0]).toContain('agent_start con agent "social" e task "checkup"')
  expect(filled[0]).toContain('post di natale')
})

test('an agent at work moves through its steps', async ($, on) => {
  engine(on, [])
  await start($)
  await $.tool.call({ tool: 'mcp__noos__studio_run', feature: 'agent_start', args: { agent: 'social', task: 'checkup' } } as never)
  await $.tool.call({ tool: 'mcp__noos__studio_run', feature: 'meta_insights', args: {} } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const card = await ui.find({ type: 'Svg', alt: /Social media manager: Check-up dei social/ } as never)
  expect(card).toBeDefined()
  await ui.unmount()
})

test('under Auto mode the pane explains the permission and prepares the request', async ($, on) => {
  const filled: string[] = []
  engine(on, filled, true)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /modalità Auto/ }))?.text).toBe('Un permesso per la modalità Auto')
  await ui.press({ key: 'ask-allow' })
  await ui.unmount()
  expect(filled[0]).toContain('mcp__noos__studio_run')
})
