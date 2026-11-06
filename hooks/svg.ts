// The drawings of the pane and of the band, as SVG documents: Noosfera's identity (near-black
// ground, lime for the main action, yellow and halftone only as decoration, Geist), small
// animations in SMIL. Pure functions, no `$`: the hooks module hands the strings to <Svg>.

import type { Pair, Run } from '../types'

// Colours that change with the theme are CSS variables, set by `themed` for light and dark
// (the studio's two palettes); the lime, the networks' and the agents' colours stay the same.
export const C = {
  bg: 'var(--bg)',
  s1: 'var(--s1)',
  s2: 'var(--s2)',
  s3: 'var(--s3)',
  edge: 'var(--edge)',
  text: 'var(--tx)',
  t2: 'var(--t2)',
  t3: 'var(--t3)',
  lime: '#8fe35a',
  limeText: 'var(--acct)',
  mark: 'var(--mark)',
  yellow: 'var(--yl)',
  danger: 'var(--dg)',
  warn: 'var(--wn)',
  success: 'var(--ok)',
  ig: '#E1306C',
  fb: '#1877F2',
}

const LIGHT = '--bg:#f3f4f0;--s1:#fbfbf8;--s2:#ffffff;--s3:#e9ebe4;--edge:#dcdfd6;--tx:#101210;--t2:#424941;--t3:#596157;--acct:#2e6a12;--mark:#4f9f24;--yl:#d6c22e;--dg:#b8322c;--wn:#8a5a00;--ok:#186b45'
const DARK = '--bg:#0a0b0a;--s1:#111311;--s2:#171a17;--s3:#212521;--edge:#262a26;--tx:#f1f4ee;--t2:#b6bdb1;--t3:#8b9387;--acct:#a6ef77;--mark:#8fe35a;--yl:#f2e14c;--dg:#f28b8f;--wn:#ecc659;--ok:#5bc894'

/**
 * Gives a drawing both palettes: light by default, dark when the app is dark
 * (prefers-color-scheme), and turns var() colours into style properties, which SVG reads.
 */
export function themed(svg: string): string {
  const out = svg.replace(/<([a-zA-Z]+)((?:\s[^<>]*?)?)(\/?)>/g, (tag, name: string, attrs: string, close: string) => {
    const props: string[] = []
    const rest = attrs.replace(/\s(fill|stroke|stop-color)="(var\(--[a-z0-9]+\))"/g, (_m, k: string, v: string) => {
      props.push(`${k}:${v}`)
      return ''
    })
    return props.length ? `<${name}${rest} style="${props.join(';')}"${close}>` : tag
  })
  return out.replace(/^(<svg[^>]*>)/, `$1<style>svg{${LIGHT}}@media (prefers-color-scheme: dark){svg{${DARK}}}</style>`)
}

const FONT = `font-family="Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"`
export const W = 340

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cut(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}

export function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} mln`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`
  return String(Math.round(n))
}

export function money(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} $`
}

export function trend(p: Pair): { text: string; up: boolean | null } {
  if (p.previous === null || p.previous === 0) return { text: '', up: null }
  const d = Math.round(((p.current - p.previous) / p.previous) * 100)
  return { text: d > 0 ? `+${d}%` : `${d}%`, up: d === 0 ? null : d > 0 }
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`
}

/** A halftone field that fades to the left, the studio's decoration. */
function halftone(x0: number, y0: number, w: number, h: number, color: string, step = 7): string {
  let out = ''
  for (let y = y0 + step / 2; y < y0 + h; y += step) {
    for (let x = x0 + step / 2; x < x0 + w; x += step) {
      const k = (x - x0) / w
      const r = Math.max(0, (k * k) * (step / 2.1))
      if (r > 0.25) out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${color}"/>`
    }
  }
  return out
}

/** The M of Mauro Dev at a given height. */
function mark(x: number, y: number, h: number): string {
  const s = h / 400
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M176 188 L296 34 L296 370" fill="none" stroke="${C.mark}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="28,30 28,370 164,198" fill="${C.text}" stroke="${C.text}" stroke-width="28" stroke-linejoin="round"/>
  </g>`
}

/** The pane's head: the mark, the name, the greeting and a live dot. */
export function header(name: string, status: string, live: boolean): string {
  return themed(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${W} 74" ${FONT}>
  <defs>
    <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.s2}"/><stop offset="1" stop-color="${C.bg}"/></linearGradient>
    <clipPath id="hc"><rect width="${W}" height="74" rx="16"/></clipPath>
  </defs>
  <g clip-path="url(#hc)">
    <rect width="${W}" height="74" fill="url(#hg)"/>
    <g opacity="0.32">${halftone(200, 0, 140, 74, C.yellow, 8)}</g>
    <rect x="-80" width="60" height="74" fill="${C.lime}" opacity="0.06" transform="skewX(-20)">
      <animate attributeName="x" from="-80" to="${W + 40}" dur="6s" repeatCount="indefinite"/>
    </rect>
  </g>
  <rect x="0.5" y="0.5" width="${W - 1}" height="73" rx="15.5" fill="none" stroke="${C.edge}"/>
  ${mark(16, 17, 40)}
  <text x="58" y="33" fill="${C.text}" font-size="18" font-weight="700" letter-spacing="-0.3">Noosfera</text>
  <text x="58" y="53" fill="${C.t2}" font-size="12.5">Ciao ${esc(cut(name, 22))}</text>
  <g transform="translate(${W - 18} 26)">
    <circle r="4" fill="${live ? C.lime : C.t3}"/>
    ${live ? `<circle r="4" fill="none" stroke="${C.lime}" stroke-width="1.5"><animate attributeName="r" values="4;10" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite"/></circle>` : ''}
  </g>
  <rect x="${W - 34 - status.length * 5.6}" y="44" width="${status.length * 5.6 + 18}" height="18" rx="9" fill="${C.bg}" opacity="0.85"/>
  <text x="${W - 25}" y="57" fill="${C.t2}" font-size="10.5" text-anchor="end">${esc(status)}</text>
</svg>`)
}

function sparkPath(values: number[], x: number, y: number, w: number, h: number): string {
  if (values.length < 2) return ''
  const max = Math.max(1, ...values)
  return values.map((v, i) => `${i ? 'L' : 'M'}${(x + (i * w) / (values.length - 1)).toFixed(1)} ${(y + h - (v / max) * h).toFixed(1)}`).join(' ')
}

/** Four numbers in tiles, two by two, each with its trend and a line that draws itself. */
export function kpis(tiles: { label: string; value: string; trend?: { text: string; up: boolean | null }; spark?: number[]; color?: string; sub?: string }[]): string {
  const tw = (W - 10) / 2
  const th = 86
  const rows = Math.ceil(tiles.length / 2)
  const height = rows * th + (rows - 1) * 10
  const body = tiles.map((t, i) => {
    const x = (i % 2) * (tw + 10)
    const y = Math.floor(i / 2) * (th + 10)
    const color = t.color ?? C.lime
    const path = t.spark ? sparkPath(t.spark, x + 12, y + 52, tw - 24, 22) : ''
    const sub = !path && t.sub ? `<text x="${x + 12}" y="${y + 70}" fill="${C.t3}" font-size="11">${esc(cut(t.sub, 24))}</text>` : ''
    const tr = t.trend?.text ? `<g transform="translate(${x + tw - 12} ${y + 22})">
        <rect x="${-8 - t.trend.text.length * 6.2}" y="-12" width="${t.trend.text.length * 6.2 + 8}" height="17" rx="8.5" fill="${t.trend.up === false ? C.danger : C.lime}" opacity="0.14"/>
        <text x="-4" y="1" text-anchor="end" font-size="10.5" font-weight="600" fill="${t.trend.up === false ? C.danger : C.limeText}">${esc(t.trend.text)}</text>
      </g>` : ''
    return `<g>
      <rect x="${x + 0.5}" y="${y + 0.5}" width="${tw - 1}" height="${th - 1}" rx="13" fill="${C.s2}" stroke="${C.edge}"/>
      <text x="${x + 12}" y="${y + 22}" fill="${C.t3}" font-size="10.5" letter-spacing="0.6">${esc(t.label.toUpperCase())}</text>
      ${tr}
      <text x="${x + 12}" y="${y + 47}" fill="${C.text}" font-size="22" font-weight="700" letter-spacing="-0.5">${esc(t.value)}
        <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="${(i * 0.08).toFixed(2)}s" fill="freeze"/>
      </text>
      ${sub}
      ${path ? `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1">
        <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.1s" begin="${(0.15 + i * 0.1).toFixed(2)}s" fill="freeze"/>
      </path>` : ''}
    </g>`
  }).join('')
  return themed(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${W} ${height}" ${FONT}>${body}</svg>`)
}

/** Bars day by day, Instagram and Facebook stacked, growing from the floor. */
export function dailyBars(title: string, days: string[], series: { color: string; values: (number | null)[] }[]): string {
  const h = 150
  const top = 34
  const bottom = 22
  const ch = h - top - bottom
  const n = days.length || 1
  const totals = days.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0))
  const max = Math.max(1, ...totals)
  const bw = (W - 24) / n
  let bars = ''
  days.forEach((d, i) => {
    let acc = 0
    series.forEach(s => {
      const v = s.values[i] ?? 0
      if (v <= 0) return
      const bh = (v / max) * ch
      const y = top + ch - acc - bh
      acc += bh
      const x = 12 + i * bw + bw * 0.18
      bars += `<rect x="${x.toFixed(1)}" y="${(top + ch).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="0" rx="2.5" fill="${s.color}">
        <animate attributeName="height" from="0" to="${bh.toFixed(1)}" dur="0.6s" begin="${(i * 0.03).toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/>
        <animate attributeName="y" from="${(top + ch).toFixed(1)}" to="${y.toFixed(1)}" dur="0.6s" begin="${(i * 0.03).toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/>
      </rect>`
    })
    if (i === 0 || i === n - 1 || i === Math.floor(n / 2)) {
      const [, m, dd] = d.split('-')
      bars += `<text x="${(12 + i * bw + bw / 2).toFixed(1)}" y="${h - 6}" fill="${C.t3}" font-size="9.5" text-anchor="middle">${dd}/${m}</text>`
    }
  })
  const legend = series.length > 1 ? series.map((s, i) => `<g transform="translate(${W - 12 - (series.length - i) * 74} 20)"><circle r="4" cx="4" cy="-3.5" fill="${s.color}"/><text x="12" y="0" fill="${C.t2}" font-size="10.5">${i === 0 ? 'Instagram' : 'Facebook'}</text></g>`).join('') : ''
  return themed(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${W} ${h}" ${FONT}>
    <rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="13" fill="${C.s2}" stroke="${C.edge}"/>
    <text x="12" y="20" fill="${C.t3}" font-size="10.5" letter-spacing="0.6">${esc(title.toUpperCase())}</text>
    ${legend}
    <line x1="12" x2="${W - 12}" y1="${top + ch + 0.5}" y2="${top + ch + 0.5}" stroke="${C.edge}"/>
    ${bars}
  </svg>`)
}

/** A ring that fills to a percent, with the figure in the middle and two lines beside it. */
export function ring(percent: number, title: string, line1: string, line2: string): string {
  const h = 116
  const r = 38
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, percent))
  const color = p >= 90 ? C.danger : p >= 70 ? C.warn : C.lime
  return themed(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${W} ${h}" ${FONT}>
    <rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="13" fill="${C.s2}" stroke="${C.edge}"/>
    <g opacity="0.35">${halftone(W - 120, 0, 120, h, C.yellow, 9)}</g>
    <g transform="translate(62 58) rotate(-90)">
      <circle r="${r}" fill="none" stroke="${C.s3}" stroke-width="10"/>
      <circle r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}">
        <animate attributeName="stroke-dashoffset" from="${c.toFixed(1)}" to="${(c * (1 - p / 100)).toFixed(1)}" dur="1.2s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/>
      </circle>
    </g>
    <text x="62" y="64" text-anchor="middle" fill="${C.text}" font-size="20" font-weight="700">${Math.round(p)}%</text>
    <text x="118" y="38" fill="${C.t3}" font-size="10.5" letter-spacing="0.6">${esc(title.toUpperCase())}</text>
    <text x="118" y="62" fill="${C.text}" font-size="15" font-weight="600">${esc(cut(line1, 26))}</text>
    <text x="118" y="82" fill="${C.t2}" font-size="11.5">${esc(cut(line2, 32))}</text>
  </svg>`)
}

/** Horizontal bars that grow, one row each: who or what spent how much. */
export function hbars(title: string, rows: { label: string; value: number; text: string; color?: string; strong?: boolean }[]): string {
  const rh = 30
  const h = 34 + rows.length * rh + 6
  const max = Math.max(0.0001, ...rows.map(r => r.value))
  const bx = 112
  const bw = W - bx - 70
  const body = rows.map((r, i) => {
    const y = 34 + i * rh
    const w = Math.max(3, (r.value / max) * bw)
    return `<text x="12" y="${y + 13}" fill="${r.strong ? C.text : C.t2}" font-size="11.5" font-weight="${r.strong ? 600 : 400}">${esc(cut(r.label, 15))}</text>
      <rect x="${bx}" y="${y + 3}" width="${bw}" height="12" rx="6" fill="${C.s3}"/>
      <rect x="${bx}" y="${y + 3}" width="0" height="12" rx="6" fill="${r.color ?? C.lime}">
        <animate attributeName="width" from="0" to="${w.toFixed(1)}" dur="0.8s" begin="${(i * 0.07).toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/>
      </rect>
      <text x="${W - 12}" y="${y + 13}" text-anchor="end" fill="${C.t2}" font-size="11">${esc(r.text)}</text>`
  }).join('')
  return themed(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${W} ${h}" ${FONT}>
    <rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="13" fill="${C.s2}" stroke="${C.edge}"/>
    <text x="12" y="20" fill="${C.t3}" font-size="10.5" letter-spacing="0.6">${esc(title.toUpperCase())}</text>
    ${body}
  </svg>`)
}

/** A row of counters in pills (what is due in the plans, the state of the sites). */
export function pills(items: { label: string; value: number; color: string }[]): string {
  const h = 58
  const pw = (W - (items.length - 1) * 8) / Math.max(1, items.length)
  const body = items.map((it, i) => {
    const x = i * (pw + 8)
    return `<g>
      <rect x="${x + 0.5}" y="0.5" width="${pw - 1}" height="${h - 1}" rx="12" fill="${C.s2}" stroke="${it.value > 0 ? it.color : C.edge}" stroke-opacity="${it.value > 0 ? 0.55 : 1}"/>
      <text x="${x + pw / 2}" y="27" text-anchor="middle" fill="${it.value > 0 ? it.color : C.t3}" font-size="20" font-weight="700">${it.value}</text>
      <text x="${x + pw / 2}" y="45" text-anchor="middle" fill="${C.t3}" font-size="10">${esc(cut(it.label, 16))}</text>
    </g>`
  }).join('')
  return themed(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${W} ${h}" ${FONT}>${body}</svg>`)
}

/** An agent's picture, with its colour behind; moving and ringed while it works. */
export function avatar(svg: string | null, color: string, size: number, active = false, label = ''): string {
  const inner = svg
    ? svg.replace(/<svg[^>]*>/, `<svg x="${size * 0.06}" y="${size * 0.08}" width="${size * 0.88}" height="${size * 0.88}" viewBox="0 0 160 160">`)
    : `<text x="${size / 2}" y="${size * 0.62}" text-anchor="middle" font-size="${size * 0.4}" fill="${C.text}">${esc(label.slice(0, 1))}</text>`
  const bob = active ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.6;0 0" dur="1.4s" repeatCount="indefinite"/>` : ''
  return themed(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ${FONT}>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" opacity="0.22"/>
    ${active ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1.5}" fill="none" stroke="${C.lime}" stroke-width="2"><animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite"/></circle>` : ''}
    <g>${bob}${inner}</g>
  </svg>`)
}

/** An agent at work: picture, job, real progress by its steps, time, tokens and spend. */
export function runCard(run: Run, name: string, nickname: string, color: string, picture: string | null, now: number): string {
  const h = 136
  const total = run.steps.length || 1
  const done = run.steps.filter(s => s.done).length
  const p = run.status === 'done' && done === total ? 1 : done / total
  const bx = 14
  const bw = W - 28
  const by = 84
  const live = run.status === 'running'
  const elapsed = (run.endedAt ?? now) - run.startedAt
  const state = run.status === 'running' ? (run.now ? `sta usando ${run.now}` : 'sta lavorando') : run.status === 'waiting' ? 'aspetta la tua risposta' : 'ha finito'
  const stateColor = run.status === 'running' ? C.limeText : run.status === 'waiting' ? C.yellow : C.t2
  const dots = run.steps.map((s, i) => {
    const x = bx + (bw * (i + 0.5)) / total
    return `<circle cx="${x.toFixed(1)}" cy="${by + 26}" r="3" fill="${s.done ? C.lime : C.s3}"/>`
  }).join('')
  const pic = avatar(picture, color, 52, live, name).replace(/^<svg[^>]*>/, '<svg x="14" y="14" width="52" height="52" viewBox="0 0 52 52">')
  return themed(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${W} ${h}" ${FONT}>
    <defs>
      <pattern id="st${esc(run.id)}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <rect width="12" height="12" fill="${C.lime}"/><rect width="5" height="12" fill="#b4f08a" opacity="0.55"/>
        ${live ? `<animateTransform attributeName="patternTransform" type="translate" additive="sum" from="0 0" to="12 0" dur="0.8s" repeatCount="indefinite"/>` : ''}
      </pattern>
      <clipPath id="cl${esc(run.id)}"><rect x="${bx}" y="${by}" width="${bw}" height="10" rx="5"/></clipPath>
    </defs>
    <rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="14" fill="${C.s2}" stroke="${live ? C.lime : C.edge}" stroke-opacity="${live ? 0.6 : 1}"/>
    <rect x="0" y="14" width="3" height="52" rx="1.5" fill="${color}"/>
    ${pic}
    <text x="78" y="32" fill="${C.text}" font-size="14" font-weight="700">${esc(cut(nickname || name, 14))}<tspan fill="${C.t3}" font-weight="400" font-size="11.5">  ${esc(cut(name, 24))}</tspan></text>
    <text x="78" y="50" fill="${C.t2}" font-size="12">${esc(cut(run.title, 38))}</text>
    <text x="78" y="68" fill="${stateColor}" font-size="11">${esc(cut(state, 40))}</text>
    <rect x="${bx}" y="${by}" width="${bw}" height="10" rx="5" fill="${C.s3}"/>
    <g clip-path="url(#cl${esc(run.id)})">
      <rect x="${bx}" y="${by}" width="${(bw * p).toFixed(1)}" height="10" fill="url(#st${esc(run.id)})"/>
    </g>
    ${dots}
    <text x="${bx}" y="${by + 46}" fill="${C.t3}" font-size="10.5">Passo ${Math.min(done + (live ? 1 : 0), total)} di ${total}  ·  ${clock(elapsed)}  ·  ${short(Math.max(0, run.tokens - run.startTokens))} token  ·  ${money(Math.max(0, run.cost - run.startCost))}</text>
    <text x="${W - 14}" y="${by - 6}" text-anchor="end" fill="${C.text}" font-size="11" font-weight="600">${Math.round(p * 100)}%</text>
  </svg>`)
}

/** A small section title with a lime tick, between the drawings. */
export function sectionTitle(text: string, count?: number): string {
  return themed(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${W} 22" ${FONT}>
    <rect x="0" y="6" width="3" height="12" rx="1.5" fill="${C.lime}"/>
    <text x="10" y="16" fill="${C.text}" font-size="12.5" font-weight="700">${esc(text)}${count !== undefined ? `<tspan fill="${C.t3}" font-weight="400">  ${count}</tspan>` : ''}</text>
  </svg>`)
}

/**
 * The same drawing at its last frame: every one-shot animation (fill="freeze") lands on its end value.
 * A redraw that brings no new data uses it, so the charts do not grow again at every redraw.
 */
export function settle(svg: string): string {
  return svg
    .replace(/<([a-zA-Z]+)(\s[^<>]*?)>((?:\s*<animate\b[^>]*fill="freeze"[^>]*\/>)+)/g, (_all, tag: string, attrs: string, anims: string) => {
      let out = attrs
      for (const a of anims.match(/<animate\b[^>]*\/>/g) ?? []) {
        const name = /attributeName="([^"]+)"/.exec(a)?.[1]
        const to = /\sto="([^"]*)"/.exec(a)?.[1]
        if (!name || to === undefined) continue
        const at = new RegExp(`(\\s${name}=")[^"]*"`)
        out = at.test(out) ? out.replace(at, `$1${to}"`) : `${out} ${name}="${to}"`
      }
      return `<${tag}${out}>`
    })
    .replace(/<animate\b[^>]*fill="freeze"[^>]*\/>/g, '')
}
