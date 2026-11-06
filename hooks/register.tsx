import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Entry, Job, Load, Panel, Run, Suggestion, Tab } from '../types'
import { avatar, C, dailyBars, eye, header, hbars, kpis, money, pills, ring, runCard, settle, short, trend } from './svg'
// @ts-ignore: plain JavaScript, Apache-2.0 (see NOTICE).
import { register as registerUsage, setUsageShown, stackUsage, usageLine, usageSessionStart, usageTurnComplete } from './token-weather-usage.mjs'

// Drawings go as images (no isInteractive): an interactive frame without a height stays 150px
// tall and shrinks a taller drawing; an image takes the pane's width, and SMIL still runs.
// Noosfera beside the chat: the person's corner of the Dashboard in a pane, in tabs, and above
// the prompt the agents with their jobs; while an agent works the pane follows its steps.
// Everything comes from the Noosfera connector the person already uses (feature
// claude_code_panel), with their own login: each one sees their own data. Nothing is kept
// outside this session but the connector's name and whether the band is hidden.

const PANE = 'noosfera'
const TITLE = 'Noosfera'
const FEATURE = 'claude_code_panel'
const STALE_MS = 10 * 60 * 1000

const panel = atom({ plugin: 'noosfera', key: 'panel' } as const, null, { shape: 'panel-2' })
const load = atom({ plugin: 'noosfera', key: 'load' } as const, { state: 'idle' } as Load)
const matches = atom({ plugin: 'noosfera', key: 'matches' } as const, [], { shape: 'matches-1' })
const draft = atom({ plugin: 'noosfera', key: 'draft' } as const, '')
const bandHidden = atom({ plugin: 'noosfera', key: 'bandHidden' } as const, false)
const tab = atom({ plugin: 'noosfera', key: 'tab' } as const, 'overview' as Tab)
const picked = atom({ plugin: 'noosfera', key: 'picked' } as const, null as string | null)
const runs = atom({ plugin: 'noosfera', key: 'runs' } as const, [], { shape: 'runs-1' })
const tick = atom({ plugin: 'noosfera', key: 'tick' } as const, 0)
const usageHidden = atom({ plugin: 'noosfera', key: 'usageHidden' } as const, false)
const client = atom({ plugin: 'noosfera', key: 'client' } as const, 'all')

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** The same rule as matchSuggestions in Noosfera (src/lib/claude-code-suggestions.ts). */
function match(list: Suggestion[], text: string, limit = 3): Suggestion[] {
  const t = fold(text)
  if (t.trim().length < 3) return []
  const scored = list
    .map((s, i) => ({ s, i, score: s.keywords.filter(k => t.includes(fold(k))).length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || Number(Boolean(b.s.agent)) - Number(Boolean(a.s.agent)) || a.i - b.i)
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const { s } of scored) {
    const key = s.agent ?? s.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= limit) break
  }
  return out
}

function when(e: Entry): string {
  const [, m, d] = e.due.split('-')
  const day = e.days_left === 0 ? 'oggi' : e.days_left === 1 ? 'domani' : e.days_left < 0 ? `${-e.days_left} gg fa` : `${d}/${m}`
  return e.time ? `${day} ${e.time}` : day
}

const FLAG: Record<string, string> = {
  late: 'in ritardo',
  not_out: 'non risulta uscita',
  missing_material: 'manca il materiale',
  ready_unpublished: 'da pubblicare',
  awaiting_client: 'attende il cliente',
  due_soon: 'in scadenza',
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Panoramica' },
  { id: 'social', label: 'Social' },
  { id: 'sites', label: 'Siti' },
  { id: 'plans', label: 'Piani' },
  { id: 'usage', label: 'Consumi' },
]

const ACTIVITY: Record<string, string> = {
  image: 'Immagini', video: 'Video', chat: 'Chat', seo: 'SEO', import: 'Import', advice: 'Consigli',
  index: 'Indice', brief: 'Brief', memory: 'Memoria', note: 'Note', agents: 'Agenti',
}

/** What the person sends to Claude to allow the pane's read under Auto mode. */
function allowRequest(tools: string[]): string {
  const names = tools.length ? tools.map(t => `«${t}»`).join(' oppure ') : 'studio_run del connettore di Noosfera'
  return `Aggiungi alle mie impostazioni di Claude Code (il file ~/.claude/settings.json, nell'elenco permissions.allow) il permesso per lo strumento studio_run del connettore di Noosfera, così il pannello della mod Noosfera funziona anche in modalità Auto. Lo strumento è ${names}: se sono più di uno, scegli solo quello del connettore di Noosfera (studio.maurodev.it), non altri. Non cambiare nient'altro.`
}

/** The request that starts an agent on one of its jobs, with what the person already typed. */
function jobRequest(agent: Agent, job: Job, typed: string): string {
  const head = `Usa l'agente «${agent.name}» di Noosfera per il lavoro «${job.title}» (agent_start con agent "${agent.id}" e task "${job.id}")`
  return typed.trim() ? `${head}: ${typed.trim()}` : `${head} per «cliente»: `
}

/** The agent the draft points to, from the suggestions' keywords. */
function agentFor(data: Panel, text: string): string | null {
  return match(data.suggestions, text, 3).find(s => s.agent)?.agent ?? null
}

/** The feature a tool call runs on the Noosfera connector, or null for any other tool. */
function featureOf(tool: string, input: unknown, prefix: string): string | null {
  if (!prefix || !tool.startsWith(prefix)) return null
  const name = tool.slice(prefix.length)
  if (name === 'studio_run') {
    const f = (input as { feature?: unknown } | null)?.feature
    return typeof f === 'string' ? f : null
  }
  return name
}

/** Marks the steps an agent's call completes: the first open step that names the feature, and every step before it. */
function advance(run: Run, agent: Agent | undefined, feature: string): Run {
  let next = run
  if (!next.task && agent) {
    const job = agent.tasks.find(t => t.steps.some(s => s.uses.includes(feature)))
    if (job) next = { ...next, task: job.id, title: job.title, steps: [...next.steps, ...job.steps.map(s => ({ uses: s.uses, done: false }))] }
  }
  const at = next.steps.findIndex(s => !s.done && s.uses.includes(feature))
  if (at < 0) return { ...next, calls: next.calls + 1, now: feature }
  return { ...next, calls: next.calls + 1, now: feature, steps: next.steps.map((s, i) => (i <= at ? { ...s, done: true } : s)) }
}


// The pill family of the band, the same as token-weather-usage's pills: round border, a light
// tint behind, no vertical padding (a border's padding made the band taller than the prompt).
const PILL = { borderStyle: 'round', paddingX: 1, paddingY: 0 } as const
// Neutral grey at low opacity: readable on the app's light and dark themes.
const NEUTRAL: [string, string] = ['rgba(127,127,127,0.10)', 'rgba(127,127,127,0.30)']
const tinted = ([back, line]: [string, string]) => ({ backgroundColor: back, borderColor: line })
/** The agent's colour (from Noosfera) as a pill tint; the agent the draft points to a little stronger. */
function agentTint(hex: string, strong = false): [string, string] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return NEUTRAL
  const n = parseInt(m[1] ?? '0', 16)
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
  return [`rgba(${rgb},${strong ? 0.2 : 0.11})`, `rgba(${rgb},${strong ? 0.6 : 0.32})`]
}

let server: string | null = null
let busy = false
let ticker: { cancel: () => void } | null = null
// What the pane drew last (tab, client, reading): the same again draws the charts at rest.
let drawn = ''

/** The connector's name as /mcp lists it: the server whose studio_run knows our feature. */
async function call($: EngineInterface, name: string): Promise<{ panel: Panel | null; why: string }> {
  let res: Awaited<ReturnType<EngineInterface['mcp']['call']>>
  try {
    res = await $.mcp.call(name, 'studio_run', { feature: FEATURE })
  } catch (error) {
    return { panel: null, why: `${name}: ${error instanceof Error ? error.message : String(error)}` }
  }
  // The connector may put other blocks first (the studio's news): take the one that is the pane.
  for (const block of res.content) {
    if (block.type !== 'text' || !block.text) continue
    try {
      const data = JSON.parse(block.text) as Panel
      if (data && data.me && Array.isArray(data.suggestions)) return { panel: data, why: '' }
    } catch {
      // not JSON: next block
    }
  }
  const first = res.content.find(b => b.type === 'text')?.text ?? ''
  return { panel: null, why: `${name}: ${res.isError ? 'errore' : 'risposta'} ${first.replace(/\s+/g, ' ').slice(0, 160)}` }
}

async function refresh($: EngineInterface) {
  if (busy) return
  busy = true
  await update($, load, () => ({ state: 'loading' }) as Load)
  try {
    let found: Panel | null = null
    const why: string[] = []
    const saved = server ?? ((await $.store.get('server')) as string | undefined) ?? null
    if (saved) {
      const r = await call($, saved)
      found = r.panel
      if (found) server = saved
      else why.push(r.why)
    }
    const tools = found ? [] : ((await $.session.usage({ breakdown: 'summary' })).context.breakdown?.mcpTools ?? [])
    if (!found) {
      const names = [...new Set(tools.filter(t => t.name.endsWith('__studio_run')).map(t => t.serverName))].filter(n => n !== saved)
      if (names.length === 0 && !saved) why.push(`nessun server con studio_run tra ${tools.length} strumenti MCP`)
      for (const name of names) {
        const r = await call($, name)
        if (r.panel) {
          found = r.panel
          server = name
          await $.store.set('server', name)
          break
        }
        why.push(r.why)
      }
    }
    if (!found) {
      const known = tools.some(t => t.name.endsWith('__studio_run')) || Boolean(saved)
      // Auto mode: the classifier refuses a call no request of the person asked for.
      if (why.length > 0 && why.every(w => w.includes('auto mode'))) {
        const blocked = [...new Set(tools.filter(t => t.name.endsWith('__studio_run')).map(t => t.name))]
        await update($, load, () => ({ state: 'auto', tools: blocked }) as Load)
        return
      }
      const message = `Il connettore di Noosfera non ha risposto con i dati del pannello. ${why.join(' | ')}`
      await update($, load, () => (known ? { state: 'error', message } : { state: 'missing' }) as Load)
      return
    }
    const data = found
    await update($, panel, () => data)
    const at = await $.clock.now()
    await update($, load, () => ({ state: 'ok', at }) as Load)
    const typed = await read($, draft)
    await update($, matches, () => match(data.suggestions, typed))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, load, () => ({ state: 'error', message }) as Load)
  } finally {
    busy = false
  }
}

/** Tokens in the context and the session's spend now, to count what an agent used. */
async function meter($: EngineInterface): Promise<{ tokens: number; cost: number }> {
  const u = await $.session.usage().catch(() => null)
  return { tokens: u?.context.tokens ?? 0, cost: u?.cost?.usd ?? 0 }
}

export const register: Register = (on, options) => {
  // Claude's consumption above the prompt (token-weather-usage, NOTICE): registered first, so its
  // line sits above the agents.
  registerUsage(on, { ...options, language: 'it', goPill: true })

  on('session.start', async ($, e, next) => {
    const ran = await usageSessionStart($, e, next)
    await $.command.register({ name: 'noosfera', description: 'Apre il pannello di Noosfera e lo aggiorna' })
    if ((await $.store.get('bandHidden')) === true) await update($, bandHidden, () => true)
    const hideUsage = (await $.store.get('usageHidden')) === true
    setUsageShown(!hideUsage)
    await update($, usageHidden, () => hideUsage)
    const saved = await $.store.get('client')
    if (typeof saved === 'string' && saved) await update($, client, () => saved)
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    return ran
  })

  on('command.run', { command: 'noosfera' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await update($, bandHidden, () => false)
    await $.store.set('bandHidden', false)
    await refresh($)
    const l = await read($, load)
    if (l.state === 'ok') return { text: 'Pannello di Noosfera aperto e aggiornato.' }
    if (l.state === 'error') return { text: `Pannello aperto, ma non riesco a leggere Noosfera: ${l.message}` }
    if (l.state === 'missing') return { text: 'Pannello aperto: il connettore di Noosfera non è collegato qui.' }
    if (l.state === 'auto') return { text: 'Pannello aperto: in modalità Auto serve un permesso, il pannello spiega come.' }
    return { text: 'Pannello di Noosfera aperto.' }
  })

  // Agents at work: agent_start opens a run, every later call on the connector moves its steps.
  on('tool.call', async ($, e, next) => {
    const input = (e as { input?: unknown }).input ?? e
    const tool = e.tool
    const isStart = tool.endsWith('__studio_run') && (input as { feature?: unknown })?.feature === 'agent_start'
    const data = await read($, panel)
    if (isStart && data) {
      const args = ((input as { args?: Record<string, unknown> }).args ?? {}) as { agent?: string; task?: string }
      const agent = data.agents?.find(a => a.id === args.agent)
      if (agent) {
        const job = args.task ? agent.tasks.find(t => t.id === args.task) : undefined
        const m = await meter($)
        const startedAt = await $.clock.now()
        const run: Run = {
          id: `${startedAt}`,
          agent: agent.id,
          task: job?.id ?? null,
          title: job?.title ?? 'Sceglie il lavoro',
          prefix: tool.slice(0, -'studio_run'.length),
          startedAt,
          endedAt: null,
          steps: [...agent.orient.steps, ...(job?.steps ?? [])].map(s => ({ uses: s.uses, done: false })),
          calls: 0,
          now: 'agent_start',
          startTokens: m.tokens,
          tokens: m.tokens,
          startCost: m.cost,
          cost: m.cost,
          status: 'running',
        }
        await update($, runs, list => [run, ...list.filter(r => r.status !== 'done' || r.agent !== agent.id)].slice(0, 3))
        await update($, picked, () => null)
        void $.ui.open({ id: PANE, title: TITLE })
        if (!ticker) ticker = $.clock.every(1000, () => void update($, tick, n => n + 1))
      }
      return next(e)
    }
    const list = await read($, runs)
    const live = list.find(r => r.status === 'running')
    if (!live) return next(e)
    const feature = featureOf(tool, input, live.prefix)
    if (feature && feature !== FEATURE) {
      const agent = data?.agents?.find(a => a.id === live.agent)
      await update($, runs, all => all.map(r => (r.id === live.id ? advance(r, agent, feature) : r)))
    }
    const ran = await next(e)
    const m = await meter($)
    await update($, runs, all => all.map(r => (r.id === live.id ? { ...r, tokens: m.tokens, cost: m.cost } : r)))
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    const list = await read($, runs)
    if (list.some(r => r.status === 'waiting')) {
      await update($, runs, all => all.map(r => (r.status === 'waiting' ? { ...r, status: 'running', endedAt: null } : r)))
      if (!ticker) ticker = $.clock.every(1000, () => void update($, tick, n => n + 1))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await usageTurnComplete($, e, next)
    const list = await read($, runs)
    if (list.some(r => r.status === 'running')) {
      const m = await meter($)
      const end = await $.clock.now()
      await update($, runs, all =>
        all.map(r => (r.status === 'running'
          ? { ...r, tokens: m.tokens, cost: m.cost, endedAt: end, now: null, status: r.steps.every(s => s.done) ? 'done' : 'waiting' }
          : r)))
    }
    ticker?.cancel()
    ticker = null
    const l = await read($, load)
    if (l.state !== 'loading' && (l.state !== 'ok' || (await $.clock.now()) - l.at > STALE_MS)) void refresh($)
    return ran
  })

  on('prompt.change', async ($, e, next) => {
    const ran = await next(e)
    await update($, draft, () => e.text)
    const data = await read($, panel)
    if (data) {
      const found = match(data.suggestions, e.text)
      const before = await read($, matches)
      if (found.map(s => s.id).join() !== before.map(s => s.id).join()) await update($, matches, () => found)
    }
    return ran
  })

  // Above the prompt, two sections, Consumi and Agenti: a title row (name on the left, the
  // button that hides or shows it on the right), then its content laid out as a grid. Every
  // pill is the same family as token-weather-usage's: round border, paddingX 1, a light tint
  // of its colour behind, the value in bold.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const usage = await usageLine($, e)
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : null
    const noUsage = await read($, usageHidden)
    const hidden = await read($, bandHidden)
    const data = await read($, panel)
    const agents = data?.agents ?? []
    const cols = (e.props.bodyColumns ?? 80) >= 90 ? 2 : 1

    const toggle = (key: string, shown: boolean, what: string, onPress: () => Promise<void> | void) => (
      <Box key={`${key}-pill`} flexDirection="row" alignItems="center" columnGap={1} flexShrink={0} {...PILL} {...tinted(NEUTRAL)}>
        {Svg && <Svg source={eye(shown)} alt={shown ? `Nascondi ${what}` : `Mostra ${what}`} width={14} height={14} />}
        <Button key={key} label={Svg ? (shown ? 'Nascondi' : 'Mostra') : (shown ? '▾ Nascondi' : '▸ Mostra')} plain dimColor onPress={onPress} />
      </Box>
    )
    const heading = (key: string, text: string, right: unknown[]) => (
      <Box key={`h-${key}`} flexDirection="row" justifyContent="space-between" alignItems="center" paddingX={1}>
        <Box flexDirection="row" columnGap={1} alignItems="center">
          <Text bold color="success">▍</Text>
          <Text bold>{text}</Text>
        </Box>
        <Box flexDirection="row" columnGap={1} alignItems="center">{right as never}</Box>
      </Box>
    )
    const grid = (key: string, cells: unknown[]) => {
      const rows: unknown[][] = []
      for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols))
      return (
        <Box key={`g-${key}`} flexDirection="column" rowGap={1} paddingX={1}>
          {rows.map((r, i) => (
            <Box key={`${key}-r${i}`} flexDirection="row" columnGap={1}>
              {r.map((c, j) => <Box key={`${key}-c${i}-${j}`} flexDirection="column" flexGrow={1} flexShrink={1} width={cols > 1 ? '50%' : '100%'}>{c as never}</Box>)}
              {r.length < cols && <Box key={`${key}-pad${i}`} flexGrow={1} flexShrink={1} width="50%" />}
            </Box>
          ))}
        </Box>
      )
    }

    const sections: unknown[] = []
    sections.push(heading('usage', 'Consumi', [toggle('usage', !noUsage, 'i consumi', async () => {
      setUsageShown(noUsage)
      await update($, usageHidden, () => !noUsage)
      await $.store.set('usageHidden', !noUsage)
      $.ui.invalidate('ui.render')
    })]))
    if (usage) sections.push(usage)
    else if (!noUsage) sections.push(<Box key="usage-wait" paddingX={1}><Text dimColor>I consumi arrivano dopo la prima risposta.</Text></Box>)

    const wrap = () => <Box flexDirection="column" rowGap={1}>{sections as never}</Box>
    // While Claude works or a survey is up the agents step aside, as before.
    if (e.props.hasSurvey || e.props.isWorking || !data || agents.length === 0) return stackUsage(Box, wrap(), await next(e))

    const agentsToggle = toggle('agents', !hidden, 'gli agenti', async () => {
      await update($, bandHidden, () => !hidden)
      await $.store.set('bandHidden', !hidden)
    })
    if (hidden) {
      sections.push(heading('agents', 'Agenti', [agentsToggle]))
      return wrap()
    }
    const typed = await read($, draft)
    const chosen = await read($, picked)
    await read($, matches)
    const hint = agentFor(data, typed)
    const agent = agents.find(a => a.id === chosen)

    if (agent) {
      const back = (
        <Box key="back-pill" flexDirection="row" alignItems="center" flexShrink={0} {...PILL} {...tinted(NEUTRAL)}>
          <Button key="back" label={Svg ? 'Indietro' : '‹ Indietro'} plain dimColor onPress={() => update($, picked, () => null)} />
        </Box>
      )
      sections.push(heading('agents', agent.nickname ? `Agenti · ${agent.nickname}, ${agent.name}` : `Agenti · ${agent.name}`, [back, agentsToggle]))
      sections.push(grid('jobs', agent.tasks.map((t, i) => (
        <Box key={`job-${t.id}`} flexDirection="row" alignItems="center" columnGap={1} {...PILL} {...tinted(agentTint(agent.color))}>
          {Svg && <Svg source={avatar(agent.avatar, agent.color, 20, false, agent.name)} alt={agent.name} width={20} height={20} />}
          <Box flexGrow={1} flexShrink={1}><Text bold wrap="truncate-end">{t.title}</Text></Box>
          <Button
            key={`t-${agent.id}-${t.id}`}
            label="Scegli"
            hotkey={i < 9 ? String(i + 1) : undefined}
            plain
            onPress={async () => {
              const box = await $.prompt.read()
              await $.prompt.fill({ text: jobRequest(agent, t, box.text), mode: 'replace' })
              await update($, picked, () => null)
            }}
          />
        </Box>
      ))))
      return wrap()
    }

    sections.push(heading('agents', 'Agenti', [agentsToggle]))
    sections.push(grid('agents', agents.map((a, i) => (
      <Box key={`agent-${a.id}`} flexDirection="row" alignItems="center" columnGap={1} {...PILL} {...tinted(agentTint(a.color, a.id === hint))}>
        {Svg && <Svg source={avatar(a.avatar, a.color, 24, a.id === hint, a.name)} alt={a.name} width={24} height={24} />}
        <Box flexDirection="row" columnGap={1} flexGrow={1} flexShrink={1}>
          <Text bold>{a.nickname || a.name}</Text>
          {a.nickname && <Text dimColor wrap="truncate-end">{a.name}</Text>}
        </Box>
        <Button key={`b-${a.id}`} label="Scegli" hotkey={String(i + 1)} plain variant={a.id === hint ? 'primary' : undefined} onPress={() => update($, picked, () => a.id)} />
      </Box>
    ))))
    return wrap()
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Link, Text } = els
    const Select = 'Select' in els ? els.Select : null
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : null
    const l = await read($, load)
    const data = await read($, panel)
    const again = <Button key="refresh" label="Aggiorna" dimColor onPress={() => refresh($)} />

    if (!data) {
      if (l.state === 'auto') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold color={'text'}>Un permesso per la modalità Auto</Text>
            <Text wrap="wrap" color={'subtle'}>In modalità Auto Claude Code blocca la lettura del pannello finché non la permetti. Si fa una volta sola:</Text>
            <Text wrap="wrap" color={'subtle'}>1. Premi «Prepara la richiesta», invia il messaggio e accetta se Claude chiede conferma.</Text>
            <Text wrap="wrap" color={'subtle'}>2. Se Claude risponde che la modalità Auto non glielo lascia fare, passa per un momento alla modalità normale (in basso, accanto al modello), invia di nuovo e poi torna ad Auto.</Text>
            <Text wrap="wrap" color={'subtle'}>3. Premi Aggiorna.</Text>
            <Button key="ask-allow" label="Prepara la richiesta" variant="primary" onPress={() => $.prompt.fill({ text: allowRequest(l.tools), mode: 'replace' })} />
            {again}
          </Box>
        )
      }
      if (l.state === 'missing') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold color={'text'}>Noosfera non è collegato qui</Text>
            <Text wrap="wrap" color={'subtle'}>Collega il connettore di Noosfera a Claude (Impostazioni, Connettori, indirizzo studio.maurodev.it/api/mcp), poi premi Aggiorna.</Text>
            {again}
          </Box>
        )
      }
      if (l.state === 'error') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold color={'text'}>Non riesco a leggere Noosfera</Text>
            <Text wrap="wrap" color={'subtle'}>{l.message}</Text>
            {again}
          </Box>
        )
      }
      return <Text color={'subtle'}>Leggo la tua dashboard di Noosfera…</Text>
    }

    const now = await $.clock.now()
    const list = await read($, runs)
    // The seconds move only while an agent works: otherwise the pane stays still.
    if (list.some(r => r.status === 'running')) await read($, tick)
    const current = await read($, tab)
    const chosen = await read($, client)
    const d = data.dashboard
    const tabs = TABS.filter(t => t.id === 'overview' || t.id === 'usage' || (d && (t.id !== 'social' || (d.social?.length ?? 0) > 0)))
    const shown = tabs.some(t => t.id === current) ? current : 'overview'
    // Charts grow when something new arrives (a reading, another tab or client); a redraw with
    // the same data draws them at rest, so they do not start over every second.
    const key = `${shown}|${chosen}|${l.state === 'ok' ? l.at : l.state}`
    const fresh = key !== drawn
    drawn = key
    const art = (svg: string) => (fresh ? svg : settle(svg))

    // The clients the Social and Sites tabs can show: those with social linked or a site.
    const clients = new Map<string, string>()
    for (const c of d?.social ?? []) if (c.key) clients.set(c.key, c.name)
    for (const s of d?.sites ?? []) if (s.client_key && s.client) clients.set(s.client_key, s.client)
    const who = clients.has(chosen) ? chosen : 'all'
    const picker = Select && clients.size > 1 && (shown === 'social' || shown === 'sites')
      ? (
          <Select
            key="client"
            label="Cliente"
            value={who}
            options={[{ value: 'all', label: 'Tutti i clienti' }, ...[...clients].sort((a, b) => a[1].localeCompare(b[1], 'it')).map(([value, label]) => ({ value, label }))]}
            onSelect={async (v: string) => {
              await update($, client, () => v)
              await $.store.set('client', v)
            }}
          />
        )
      : null

    const status = l.state === 'loading' ? 'aggiorno…' : l.state === 'ok' ? (now - l.at < 60_000 ? 'aggiornato ora' : `aggiornato ${Math.round((now - l.at) / 60_000)} min fa`) : ''

    const row = (key: string, href: string, left: string, right: string, accent?: string) => (
      <Box key={key} flexDirection="row" justifyContent="space-between" gap={1}>
        <Link href={href}>{left}</Link>
        <Text color={accent ?? 'subtle'}>{right}</Text>
      </Box>
    )

    const title = (text: string, count?: number) => (
      <Box key={`h-${text}`} flexDirection="row" gap={1} marginTop={1}>
        <Text bold color="success">▍</Text>
        <Text bold>{text}</Text>
        {count !== undefined && <Text color="subtle">{String(count)}</Text>}
      </Box>
    )

    const entries = (items: Entry[], prefix: string) =>
      items.map((u, i) => row(`${prefix}-${i}`, u.link, `${u.client}: ${u.title}`, u.flags[0] ? `${when(u)} · ${FLAG[u.flags[0]] ?? u.flags[0]}` : when(u), u.flags.includes('late') ? 'error' : u.days_left <= 1 ? 'warning' : 'subtle'))

    // Agents at work, above everything while they run.
    const runsView = list.slice(0, 2).map(r => {
      const a = data.agents?.find(x => x.id === r.agent)
      if (!a) return null
      return Svg
        ? <Svg key={`run-${r.id}`} source={runCard(r, a.name, a.nickname, a.color, a.avatar, now)} alt={`${a.name}: ${r.title}`} />
        : <Text key={`run-${r.id}`}>{a.name}: {r.title} ({r.steps.filter(s => s.done).length}/{r.steps.length})</Text>
    })

    let body: unknown = null
    if (shown === 'overview') {
      const k = d?.kpis
      const views = d?.chart ? d.chart.days.map((_, i) => Object.values(d.chart!.views).reduce((s, v) => s + (v[i] ?? 0), 0)) : undefined
      const inter = d?.chart ? d.chart.days.map((_, i) => Object.values(d.chart!.interactions).reduce((s, v) => s + (v[i] ?? 0), 0)) : undefined
      body = (
        <Box flexDirection="column" gap={1}>
          {k && Svg && (
            <Svg
              source={art(kpis([
                { label: 'Visualizzazioni', value: short(k.views.current), trend: trend(k.views), spark: views },
                { label: 'Interazioni', value: short(k.interactions.current), trend: trend(k.interactions), spark: inter, color: C.yellow },
                { label: 'Visite ai siti', value: short(k.sessions.current), trend: trend(k.sessions), sub: k.sessions.previous !== null ? `settimana prima ${short(k.sessions.previous)}` : 'ultimi 7 giorni' },
                { label: 'Contatti', value: short(k.contacts.current), trend: trend(k.contacts), sub: k.contacts.previous !== null ? `settimana prima ${short(k.contacts.previous)}` : 'dai moduli dei siti' },
              ]))}
              alt="Numeri degli ultimi 7 giorni"
            />
          )}
          {d && title('Da fare', d.urgent.length)}
          {d && d.urgent.length === 0 && <Text color={'subtle'}>Niente di urgente nei piani.</Text>}
          {d && entries(d.urgent.slice(0, 4), 'u')}
          {title('I tuoi progetti', data.projects.mine)}
          {data.projects.latest.length === 0 && <Text color={'subtle'}>Ancora nessun progetto tuo.</Text>}
          {data.projects.latest.map((p, i) => row(`p-${i}`, p.link, p.name, p.client && p.client !== p.name ? p.client : ''))}
        </Box>
      )
    } else if (shown === 'social' && d) {
      const one = who === 'all' ? null : d.social?.find(c => c.key === who) ?? null
      const chart = one ? one.chart ?? null : d.chart
      const sum = (rows?: Record<string, (number | null)[]>) => chart ? chart.days.map((_, i) => Object.values(rows ?? {}).reduce((n, v) => n + (v[i] ?? 0), 0)) : undefined
      body = one ? (
        <Box flexDirection="column" gap={1}>
          {Svg && (
            <Svg
              source={art(kpis([
                { label: 'Visualizzazioni', value: short(one.views.current), trend: trend(one.views), spark: sum(chart?.views) },
                { label: 'Interazioni', value: short(one.interactions.current), trend: trend(one.interactions), spark: sum(chart?.interactions), color: C.yellow },
                { label: 'Follower', value: one.followers !== null ? short(one.followers) : 'n.d.', sub: one.networks.map(n => (n === 'instagram' ? 'Instagram' : 'Facebook')).join(' e ') },
                { label: 'Nuovi follower', value: one.followers_change !== null ? `${one.followers_change > 0 ? '+' : ''}${short(one.followers_change)}` : 'n.d.', sub: 'ultimi 7 giorni' },
              ]))}
              alt={`Numeri di ${one.name}, ultimi 7 giorni`}
            />
          )}
          {chart && Svg && (
            <Svg
              source={art(dailyBars('Visualizzazioni, 14 giorni', chart.days, [
                { color: C.ig, values: chart.views.instagram ?? [] },
                { color: C.fb, values: chart.views.facebook ?? [] },
              ]))}
              alt={`Visualizzazioni di ${one.name} giorno per giorno`}
            />
          )}
          {!Svg && <Text>{`${one.name}: ${short(one.views.current)} viste ${trend(one.views).text}`.trim()}</Text>}
          <Link href={one.link}>{`Apri i social di ${one.name}`}</Link>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          {chart && Svg && (
            <Svg
              source={art(dailyBars('Visualizzazioni, 14 giorni', chart.days, [
                { color: C.ig, values: chart.views.instagram ?? [] },
                { color: C.fb, values: chart.views.facebook ?? [] },
              ]))}
              alt="Visualizzazioni giorno per giorno"
            />
          )}
          {title('Clienti', d.social?.length ?? 0)}
          {(d.social ?? []).map((c, i) => {
            const t = trend(c.views)
            return row(`c-${i}`, c.link, c.name, `${short(c.views.current)} viste ${t.text}`.trim(), t.up === false ? 'error' : t.up ? 'success' : 'subtle')
          })}
        </Box>
      )
    } else if (shown === 'sites' && d) {
      const sites = who === 'all' ? d.sites : d.sites.filter(s => s.client_key === who)
      const total = who === 'all' ? d.sites_total ?? d.sites.length : sites.length
      const red = sites.filter(s => s.red > 0).length
      const amber = sites.filter(s => s.red === 0 && s.amber > 0).length
      body = (
        <Box flexDirection="column" gap={1}>
          {Svg && (
            <Svg
              source={art(pills([
                { label: 'Siti', value: total, color: C.text },
                { label: 'Va tutto bene', value: Math.max(0, total - red - amber), color: C.success },
                { label: 'Da guardare', value: amber, color: C.warn },
                { label: 'Gravi', value: red, color: C.danger },
              ]))}
              alt="Stato dei siti"
            />
          )}
          {sites.length === 0 && <Text color={'subtle'}>Nessun sito per questo cliente.</Text>}
          {sites.map((s, i) =>
            row(`s-${i}`, s.url ?? data.studio_url + '/siti', s.name,
              s.red ? `${s.red} gravi` : s.amber ? `${s.amber} da guardare` : s.performance ? `PageSpeed ${Math.round(s.performance)}` : 'ok',
              s.red ? 'error' : s.amber ? 'warning' : 'success'))}
          <Link href={`${data.studio_url}/siti`}>Apri la tab Siti</Link>
        </Box>
      )
    } else if (shown === 'plans' && d) {
      const uc = d.urgent_counts
      body = (
        <Box flexDirection="column" gap={1}>
          {Svg && (
            <Svg
              source={art(pills([
                { label: 'In ritardo', value: uc.late ?? 0, color: C.danger },
                { label: 'In scadenza', value: uc.due_soon ?? 0, color: C.warn },
                { label: 'Da pubblicare', value: uc.ready_unpublished ?? 0, color: C.success },
                { label: 'Dal cliente', value: uc.awaiting_client ?? 0, color: C.t2 },
              ]))}
              alt="Scadenze dei piani"
            />
          )}
          {title('Da fare', d.urgent.length)}
          {d.urgent.length === 0 && <Text color={'subtle'}>Niente di urgente.</Text>}
          {entries(d.urgent, 'pu')}
          {title('Prossime uscite', d.upcoming.length)}
          {d.upcoming.length === 0 && <Text color={'subtle'}>Nessuna uscita nei prossimi 14 giorni.</Text>}
          {entries(d.upcoming, 'pn')}
          <Link href={`${data.studio_url}/piani?vista=calendario`}>Apri il calendario dei piani</Link>
        </Box>
      )
    } else {
      const u = data.usage
      const mine = d?.my_month
      const team = d?.team_month
      const acts = Object.entries(mine?.activities ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
      const people = (team?.people ?? []).filter(p => p.spent_usd > 0 || p.me)
      body = (
        <Box flexDirection="column" gap={1}>
          {u && Svg && (
            <Svg
              source={art(ring(
                u.percent,
                u.scope === 'personal' ? 'Il tuo limite del mese' : 'Budget del team',
                mine ? `${money(mine.spent_usd)} spesi da te` : `${u.percent}% usato`,
                team ? `Team: ${money(team.spent_usd)} su ${money(team.budget_usd)}` : `Si azzera il ${u.resets_at.slice(8, 10)}/${u.resets_at.slice(5, 7)}`,
              ))}
              alt="Consumi del mese"
            />
          )}
          {acts.length > 0 && Svg && <Svg source={art(hbars('Le tue spese per attività', acts.map(([k, v]) => ({ label: ACTIVITY[k] ?? k, value: v, text: money(v) }))))} alt="Spese per attività" />}
          {people.length > 0 && Svg && <Svg source={art(hbars('Il team questo mese', people.map(p => ({ label: p.name, value: p.spent_usd, text: money(p.spent_usd), strong: p.me, color: p.me ? C.lime : C.t3 }))))} alt="Spese del team" />}
          {!u && !mine && <Text color={'subtle'}>Nessun dato sui consumi.</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {Svg ? <Svg source={header(data.me.name, status, l.state === 'ok')} alt={`Noosfera, ciao ${data.me.name}`} /> : <Text bold>{`Noosfera · Ciao ${data.me.name}`}</Text>}
        {runsView}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {tabs.map(t => (
            <Button key={`tab-${t.id}`} label={t.label} variant={t.id === shown ? 'primary' : undefined} dimColor={t.id !== shown} onPress={() => update($, tab, () => t.id)} />
          ))}
        </Box>
        {picker}
        {body as never}
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Link href={`${data.studio_url}/dashboard`}>Apri Noosfera</Link>
          {l.state === 'loading' ? <Text color={'subtle'}>aggiorno…</Text> : again}
        </Box>
      </Box>
    )
  })
}
