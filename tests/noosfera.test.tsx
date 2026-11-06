import { expect, test } from 'claude-code/testing'

const PANEL = {
  me: { name: 'Giulia', superadmin: true, sections: { plans: true } },
  studio_url: 'https://studio.maurodev.it',
  usage: { scope: 'team', percent: 42, resets_at: '2026-12-01' },
  projects: { mine: 2, latest: [{ name: 'Natale', client: 'Fioreria Rossi', last_activity: '2026-11-05', link: 'https://studio.maurodev.it/p/x' }] },
  dashboard: {
    today: '2026-11-06',
    kpis: { views: { current: 12400, previous: 10000 }, interactions: { current: 800, previous: 1000 }, followers: 3000, sessions: { current: 500, previous: null }, contacts: { current: 4, previous: 2 }, adSpend: { current: 0, previous: 0 } },
    urgent_counts: { late: 1, due_soon: 1 },
    urgent: [{ client: 'Bar Centrale', title: 'Reel cantiere', due: '2026-11-05', time: null, days_left: -1, channels: ['instagram'], flags: ['late'], link: 'https://studio.maurodev.it/piani/bar-centrale' }],
    upcoming: [],
    sites: [{ name: 'esempio.it', red: 1, amber: 0 }],
    my_month: { spent_usd: 3.5, limit_usd: null },
    team_month: { spent_usd: 10, budget_usd: 100 },
  },
  suggestions: [
    { id: 'agent-social-0', label: 'Social media manager', text: 'Fai il check-up dei social di «cliente» come agente social', keywords: ['social media manager', 'instagram', 'post'], agent: 'social' },
    { id: 'plans-today', label: 'Da fare nei piani', text: "Cosa c'è da fare oggi nei piani editoriali?", keywords: ['piani'] },
    { id: 'agents', label: 'Che agenti ci sono', text: 'Quali agenti?', keywords: ['agent'] },
    { id: 'projects', label: 'I miei progetti', text: 'Progetti?', keywords: ['progett'] },
  ],
}

const PANE = {
  plugin: 'noosfera', component: 'Pane', requestId: 'noosfera',
  props: { title: 'Noosfera', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const BAND = {
  plugin: 'noosfera', component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 } },
} as const

function engine(on: Parameters<Parameters<typeof test>[1]>[1], filledWith: string[]) {
  on('command.register', () => ({ value: { command: 'noosfera' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { breakdown: { mcpTools: [{ name: 'mcp__noos__studio_run', serverName: 'claude.ai Noosfera', tokens: 1, isLoaded: true }] } } } }) as never)
  on('mcp.call', (_, e) => ({ value: e.server === 'claude.ai Noosfera' ? { content: [{ type: 'text', text: JSON.stringify(PANEL) }] } : { isError: true, content: [] } }) as never)
  on('prompt.read', () => ({ value: { text: 'post di natale', cursor: 0 } }) as never)
  on('prompt.fill', (_, e) => { filledWith.push(e.text); return { isFilled: true, text: e.text } as never })
  on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
  on('prompt.change', (_, e) => ({ text: e.text, cursor: e.cursor }) as never)
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } as never })
}

test('the pane shows the person, the urgent entries and the sites', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Ciao Giulia/ }))?.text).toBe('Ciao Giulia')
    expect(await ui.find({ type: 'Link', text: /Bar Centrale/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /esempio\.it/ })).toBeDefined()
    await ui.unmount()
  }
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text' }))?.text).toBe('Noosfera:')
  await band.unmount()
})

test('the band suggests the agent for the draft and fills the prompt', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'noosfera', args: '' } as never)
  await $.prompt.change({ text: 'post di natale', cursor: 14, origin: { kind: 'typing' } } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text' }))?.text).not.toBe('engine')
    await ui.press({ key: 's-agent-social-0' })
    await ui.unmount()
  }
  expect(filled[0]).toBe("Usa l'agente «Social media manager» di Noosfera: post di natale")
})
