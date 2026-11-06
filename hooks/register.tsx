import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entry, Load, Pair, Panel, Suggestion } from '../types'

// Noosfera beside the chat: the person's corner of the Dashboard in a pane, and above the
// prompt the agents and requests that fit what they are writing. Everything comes from the
// Noosfera connector the person already uses (feature claude_code_panel), with their own
// login: each one sees their own data. Nothing is kept outside this session but the
// connector's name and whether the box above the prompt is hidden.

const PANE = 'noosfera'
const TITLE = 'Noosfera'
const FEATURE = 'claude_code_panel'
const STALE_MS = 10 * 60 * 1000

const panel = atom({ plugin: 'noosfera', key: 'panel' } as const, null, { shape: 'panel-1' })
const load = atom({ plugin: 'noosfera', key: 'load' } as const, { state: 'idle' } as Load)
const matches = atom({ plugin: 'noosfera', key: 'matches' } as const, [], { shape: 'matches-1' })
const draft = atom({ plugin: 'noosfera', key: 'draft' } as const, '')
const bandHidden = atom({ plugin: 'noosfera', key: 'bandHidden' } as const, false)

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

const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} mln` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : String(Math.round(n))

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} $`

function trend(p: Pair): string {
  if (p.previous === null || p.previous === 0) return ''
  const d = Math.round(((p.current - p.previous) / p.previous) * 100)
  return d === 0 ? ' =' : d > 0 ? ` +${d}%` : ` ${d}%`
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

/** Turns the person's draft and a suggestion into the new draft. */
function filled(s: Suggestion, text: string): string {
  const typed = text.trim()
  if (!typed) return s.text
  if (s.agent) return `Usa l'agente «${s.label.split(':')[0]}» di Noosfera: ${typed}`
  return `${s.text.trimEnd()} ${typed}`
}

let server: string | null = null
let busy = false

/** The connector's name as /mcp lists it: the server whose studio_run knows our feature. */
async function call($: EngineInterface, name: string): Promise<Panel | null> {
  const res = await $.mcp.call(name, 'studio_run', { feature: FEATURE })
  // The connector may put other blocks first (the studio's news): take the one that is the pane.
  for (const block of res.content) {
    if (block.type !== 'text' || !block.text) continue
    try {
      const data = JSON.parse(block.text) as Panel
      if (data && data.me && Array.isArray(data.suggestions)) return data
    } catch {
      // not JSON: next block
    }
  }
  return null
}

async function refresh($: EngineInterface) {
  if (busy) return
  busy = true
  await update($, load, () => ({ state: 'loading' }) as Load)
  try {
    let found: Panel | null = null
    const saved = server ?? ((await $.store.get('server')) as string | undefined) ?? null
    if (saved) found = await call($, saved).catch(() => null)
    if (found) server = saved
    if (!found) {
      const usage = await $.session.usage({ breakdown: 'summary' })
      const names = [...new Set((usage.context.breakdown?.mcpTools ?? []).filter(t => t.name.endsWith('__studio_run')).map(t => t.serverName))]
      for (const name of names) {
        found = await call($, name).catch(() => null)
        if (found) {
          server = name
          await $.store.set('server', name)
          break
        }
      }
    }
    if (!found) {
      const tools = (await $.session.usage({ breakdown: 'summary' })).context.breakdown?.mcpTools ?? []
      const known = tools.some(t => t.name.endsWith('__studio_run'))
      const message = "Il connettore di Noosfera c'è, ma non ha ancora la funzione del pannello: arriva con il prossimo aggiornamento dello Studio. Poi premi Aggiorna."
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({ name: 'noosfera', description: 'Apre il pannello di Noosfera e lo aggiorna' })
    if ((await $.store.get('bandHidden')) === true) await update($, bandHidden, () => true)
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    return ran
  })

  on('command.run', { command: 'noosfera' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await update($, bandHidden, () => false)
    await $.store.set('bandHidden', false)
    await refresh($)
    return { text: 'Pannello di Noosfera aperto e aggiornato.' }
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.isWorking || (await read($, bandHidden))) return next(e)
    const data = await read($, panel)
    if (!data) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const typed = await read($, draft)
    let list = await read($, matches)
    let lead = 'Noosfera, per questo:'
    if (!typed.trim()) {
      const urgent = data.dashboard?.urgent.length ?? 0
      const ids = [urgent > 0 ? 'plans-today' : 'dashboard', 'agents', 'projects']
      list = ids.map(id => data.suggestions.find(s => s.id === id)).filter((s): s is Suggestion => Boolean(s)).slice(0, 3)
      lead = 'Noosfera:'
    }
    if (list.length === 0) return next(e)
    return (
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        <Text dimColor>{lead}</Text>
        {list.map((s, i) => (
          <Button
            key={`s-${s.id}`}
            label={s.label}
            hotkey={String(i + 1)}
            variant={i === 0 && typed.trim() ? 'primary' : undefined}
            onPress={async () => {
              const box = await $.prompt.read()
              await $.prompt.fill({ text: filled(s, box.text), mode: 'replace' })
            }}
          />
        ))}
        <Button
          key="hide"
          label="Nascondi"
          dimColor
          onPress={async () => {
            await update($, bandHidden, () => true)
            await $.store.set('bandHidden', true)
            $.ui.toast('Suggerimenti di Noosfera nascosti: /noosfera li rimette.')
          }}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const l = await read($, load)
    const data = await read($, panel)
    const again = <Button key="refresh" label="Aggiorna" dimColor onPress={() => refresh($)} />

    if (!data) {
      if (l.state === 'missing') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold>Noosfera non è collegato qui</Text>
            <Text>Collega il connettore di Noosfera a Claude (Impostazioni, Connettori, indirizzo studio.maurodev.it/api/mcp), poi premi Aggiorna.</Text>
            {again}
          </Box>
        )
      }
      if (l.state === 'error') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold>Non riesco a leggere Noosfera</Text>
            <Text dimColor wrap="wrap">{l.message}</Text>
            {again}
          </Box>
        )
      }
      return <Text dimColor>Leggo la tua dashboard di Noosfera…</Text>
    }

    const d = data.dashboard
    const usage = data.usage
    const k = d?.kpis
    const month = d?.my_month
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>Ciao {data.me.name}</Text>
          {l.state === 'loading' ? <Text dimColor>aggiorno…</Text> : again}
        </Box>

        {usage && (
          <Text>
            {usage.scope === 'personal' ? 'Il tuo limite del mese: ' : 'Budget del team: '}
            <Text bold color={usage.percent >= 85 ? 'red' : undefined}>{usage.percent}%</Text>
            {month ? <Text dimColor> ({euro(month.spent_usd)}{month.limit_usd !== null ? ` su ${euro(month.limit_usd)}` : ''})</Text> : null}
          </Text>
        )}

        {k && (
          <Box flexDirection="column">
            <Text bold>Ultimi 7 giorni</Text>
            <Text>Visualizzazioni {short(k.views.current)}<Text dimColor>{trend(k.views)}</Text></Text>
            <Text>Interazioni {short(k.interactions.current)}<Text dimColor>{trend(k.interactions)}</Text></Text>
            <Text>Visite ai siti {short(k.sessions.current)}<Text dimColor>{trend(k.sessions)}</Text>, contatti {short(k.contacts.current)}</Text>
          </Box>
        )}

        {d && (
          <Box flexDirection="column">
            <Text bold>Da fare {d.urgent.length > 0 ? `(${Object.values(d.urgent_counts).reduce((a, b) => a + b, 0)})` : ''}</Text>
            {d.urgent.length === 0 && <Text dimColor>Niente di urgente nei piani.</Text>}
            {d.urgent.map((u, i) => (
              <Link key={`u-${i}`} href={u.link}>
                {when(u)} · {u.client}: {u.title}
                {u.flags[0] ? ` (${FLAG[u.flags[0]] ?? u.flags[0]})` : ''}
              </Link>
            ))}
          </Box>
        )}

        {d && d.upcoming.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Prossime uscite</Text>
            {d.upcoming.map((u, i) => (
              <Link key={`n-${i}`} href={u.link}>
                {when(u)} · {u.client}: {u.title}
              </Link>
            ))}
          </Box>
        )}

        {d && d.sites.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Siti con avvisi</Text>
            {d.sites.map((s, i) => (
              <Text key={`w-${i}`}>
                {s.name} <Text color={s.red ? 'red' : 'yellow'}>{s.red ? `${s.red} gravi` : `${s.amber} da guardare`}</Text>
              </Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>I tuoi progetti ({data.projects.mine})</Text>
          {data.projects.latest.length === 0 && <Text dimColor>Ancora nessun progetto tuo.</Text>}
          {data.projects.latest.map((p, i) => (
            <Link key={`p-${i}`} href={p.link}>
              {p.name}{p.client ? ` · ${p.client}` : ''}
            </Link>
          ))}
        </Box>

        <Link href={`${data.studio_url}/dashboard`}>Apri Noosfera</Link>
      </Box>
    )
  })
}
