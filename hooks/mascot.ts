// One spiky-haired head per form, from calm to raw power, each its own SVG document with its own
// motion: base (black hair, no aura), charged (golden, slow aura), super (blue, bolts) and
// ultimate (red, flames, streaks, a flushing face). Drawn on a 100 x 100 grid. Pure strings: no
// engine, so a preview script can import it as is.

export type Form = 'base' | 'charged' | 'super' | 'ultimate'

export const FORMS: readonly Form[] = ['base', 'charged', 'super', 'ultimate']

const INK = '#2B2522'
const TEETH = '#FFFFFF'
const TONGUE = '#E86A6A'
const Y = 72 // the eyes' height
const M = 85 // the mouth's

type Palette = { light: string; hair: string; dark: string; edge: string }

type Look = {
  skin: string
  hair: Palette
  aura: string | null
  iris: string
  eyeHeight: number
  brows: string
  mouth: string
  hasShine: boolean
  // Effect classes the CSS below animates while the agent runs.
  effects: string[]
}

const st = (c: string, w: number): string => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`

const rgb = (h: string): number[] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const hex = (c: number[]): string => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const mix = (a: string, b: string, t: number): string => {
  const to = rgb(b)
  return hex(rgb(a).map((v, i) => v + ((to[i] ?? v) - v) * t))
}
const shade = (c: string, t: number): string => (t >= 0 ? mix(c, '#ffffff', t) : mix(c, '#000000', -t))

const SHOUT = `<path d="M42 ${M - 3} Q50 ${M - 5} 58 ${M - 3} Q58 ${M + 9} 50 ${M + 10} Q42 ${M + 9} 42 ${M - 3} Z" fill="${INK}"/><path d="M43 ${M - 2.6} Q50 ${M - 4.4} 57 ${M - 2.6} L56.5 ${M} Q50 ${M - 1.5} 43.5 ${M} Z" fill="${TEETH}"/><path d="M45 ${M + 7} Q50 ${M + 3.5} 55 ${M + 7} Q50 ${M + 10} 45 ${M + 7} Z" fill="${TONGUE}"/>`

const LOOKS: Record<Form, Look> = {
  base: {
    skin: '#F6D2B0',
    hair: { light: '#6A5C56', hair: '#2B2522', dark: '#0E0A09', edge: '#8A7A72' },
    aura: null,
    iris: '#3B2F2B',
    eyeHeight: 5.4,
    // One brow frowning, the other raised.
    brows: `<path d="M32 ${Y - 9} L46 ${Y - 5}" ${st(INK, 3.6)}/><path d="M54 ${Y - 9} Q61 ${Y - 14} 67 ${Y - 9}" ${st(INK, 3.4)}/>`,
    mouth: `<path d="M43 ${M} Q50 ${M + 6} 57 ${M}" ${st(INK, 2.8)}/>`,
    hasShine: false,
    effects: ['respire', 'cligne'],
  },
  charged: {
    skin: '#F6D2B0',
    hair: { light: '#FFF5B0', hair: '#FFD93B', dark: '#EE9F0A', edge: '#EE9F0A' },
    aura: '#FFD54A',
    iris: '#1FA37A',
    eyeHeight: 5.4,
    brows: `<path d="M32 ${Y - 9} L46 ${Y - 5} M68 ${Y - 9} L54 ${Y - 5}" ${st(INK, 3.6)}/>`,
    mouth: `<path d="M44 ${M + 1} Q52 ${M + 3} 57 ${M - 1}" ${st(INK, 2.8)}/>`,
    hasShine: true,
    effects: ['cligne', 'auraLente', 'respire', 'reflet'],
  },
  super: {
    skin: '#F6D2B0',
    hair: { light: '#BDF2FF', hair: '#3FC8F5', dark: '#1574C4', edge: '#1574C4' },
    aura: '#4FD1FF',
    iris: '#1E7FD8',
    eyeHeight: 7,
    brows: `<path d="M32 ${Y - 11} L46 ${Y - 4.5} M68 ${Y - 11} L54 ${Y - 4.5}" ${st(INK, 3.6)}/>`,
    // The cry at 70 %.
    mouth: `<g transform="translate(50 ${M + 3}) scale(.7) translate(-50 ${-(M + 3)})">${SHOUT}</g>`,
    hasShine: true,
    effects: ['reflet', 'aura', 'eclairs', 'tremble'],
  },
  ultimate: {
    skin: '#F59A86',
    hair: { light: '#FF9A8A', hair: '#E8302A', dark: '#8E1212', edge: '#6E0C0C' },
    aura: '#FF3B30',
    iris: '#3B2F2B',
    eyeHeight: 7,
    brows: `<path d="M33 ${Y - 13} L46 ${Y - 4} M67 ${Y - 13} L54 ${Y - 4}" ${st(INK, 3.6)}/>`,
    // The wide cry.
    mouth: `<path d="M39 ${M - 4} Q50 ${M - 6} 61 ${M - 4} Q61 ${M + 11} 50 ${M + 12} Q39 ${M + 11} 39 ${M - 4} Z" fill="${INK}"/><path d="M40.4 ${M - 3.5} Q50 ${M - 5.4} 59.6 ${M - 3.5} L59.2 ${M - 0.6} Q50 ${M - 2.4} 40.8 ${M - 0.6} Z" fill="${TEETH}"/><path d="M44 ${M + 8.5} Q50 ${M + 4} 56 ${M + 8.5} Q50 ${M + 12} 44 ${M + 8.5} Z" fill="${TONGUE}"/>`,
    hasShine: false,
    effects: ['tremble', 'cheveux', 'flammes', 'traits', 'peauRouge', 'cheveuxFeu', 'auraFeu'],
  },
}

// What a form's agent draws its progress bar in: its hair.
export const FORM_COLOR: Record<Form, string> = { base: '#8A7A72', charged: '#F2B33D', super: '#3FC8F5', ultimate: '#E8302A' }

const HEAD = 'M23 68 A27 27 0 1 0 77 68 A27 27 0 1 0 23 68 Z'
// Raised hair, in its own grid (head centre at (50,60)), drawn 8 lower.
const HAIR = 'M24 64 L12 46 L24 44 L10 22 L32 34 L26 6 L42 28 L50 0 L58 28 L74 6 L68 34 L90 22 L76 44 L88 46 L76 64 L74 50 L58 48 L51 62 L48 48 L40 50 L30 48 Z'
// The flame-shaped aura, its foot at the chin.
const AURA = 'M50 -4 C58 14 64 10 68 24 C78 14 92 36 94 56 C96 72 88 86 74 90 L26 90 C12 86 4 72 6 56 C8 36 22 14 32 24 C36 10 42 14 50 -4 Z'
const AURA_INNER = 'translate(12 22) scale(.76)'
const FIRE_AURA = '#FF8A1F'
const FIRE_HAIR: Palette = { light: '#FFD27A', hair: '#FF5A2A', dark: '#B3140F', edge: '#7E0D0A' }

// Shine down the three tallest locks, at mid-height of the hair.
const shineFor = (d: string): string => {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  const pts: [number, number][] = []
  for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i] ?? 0, n[i + 1] ?? 0])
  const at = (i: number): [number, number] => pts[(i + pts.length) % pts.length] ?? [0, 0]
  return pts
    .map((p, i) => [p, at(i - 1), at(i + 1)] as const)
    .filter(([p, a, b]) => p[1] < a[1] && p[1] < b[1] && p[1] < 26)
    .sort((x, y) => x[0][1] - y[0][1])
    .slice(0, 3)
    .map(([t, a, b]) => {
      const bx = (a[0] + b[0]) / 2, by = (a[1] + b[1]) / 2
      const along = (k: number): string => `${(bx + (t[0] - bx) * k).toFixed(1)} ${(by + (t[1] - by) * k).toFixed(1)}`
      return `M${along(-0.32)} L${along(0.3)}`
    })
    .join(' ')
}
const SHINE = shineFor(HAIR)

// Super's bolts, clear of the hair: a coloured glow under a white core.
const BOLTS = ['M5 38 L11 49 L6 52 L12.5 64 L7.5 67 L13 79', 'M95 34 L89 46 L94 49 L87.5 61 L92.5 64 L87 77', 'M30 8 L36 17 L31.5 19 L38 28']

// Ultimate's streaks ring the head like a halo, behind it from one cheek to the other: upright
// on top, a little slanted on the sides, longest on top. A fixed seed keeps the same scatter.
const STREAKS = (() => {
  let seed = 11
  const rng = (): number => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const between = (a: number, b: number): number => a + (b - a) * rng()
  const reach = (100 * Math.PI) / 180, count = 18
  let out = ''
  for (let i = 0; i < count; i++) {
    const at = -reach + (i + between(0.25, 0.75)) * ((2 * reach) / count)
    const side = Math.abs(at) / reach
    const r = 25 + 17 * Math.pow(side, 1.4) + between(-2, 2)
    const fx = 50 + r * Math.sin(at), fy = 66 - r * Math.cos(at)
    const dx = Math.sin(at * 0.3), dy = -Math.cos(at * 0.3)
    const room = Math.min(dx > 0 ? (106 - fx) / dx : dx < 0 ? (-6 - fx) / dx : Infinity, (-11 - fy) / dy)
    const len = Math.min(room, 24 + 26 * Math.pow(1 - side, 1.2) + between(-4, 6))
    const w = between(0.8, 1.4), dur = between(0.7, 2.2), delay = -between(0, 2.2), peak = between(0.55, 1)
    const kind = Math.floor(between(0, 3))
    out += `<path class="tw${kind}" d="M${fx.toFixed(1)} ${fy.toFixed(1)} L${(fx + dx * len).toFixed(1)} ${(fy + dy * len).toFixed(1)}" stroke-width="${w.toFixed(2)}" style="--peak:${peak.toFixed(2)};animation-duration:${dur.toFixed(2)}s;animation-delay:${delay.toFixed(2)}s"/>`
  }
  return out
})()

// Pure CSS, run by the compositor. Only the groups an effect moves measure their origin on
// themselves: a group with its own transform attribute (Super's smaller cry) keeps it in place.
const CSS = `<style>
.bd,.br,.sk,.ey,.hr,.au{transform-box:fill-box}
.br,.hr,.au{transform-origin:50% 100%}.ey{transform-origin:50% 50%}
.bo,.st,.cf{opacity:0}
.run.respire .br{animation:br 2s ease-in-out infinite}
.run.tremble .sk{animation:sk .18s linear infinite}
.run.cligne .ey{animation:bl 3.2s ease-in-out infinite}
.run.reflet .sh{animation:sh 1.4s ease-in-out infinite}
.run.cheveux .hr{animation:sw 1s ease-in-out infinite}
.run.aura .au{animation:pu 1.4s ease-in-out infinite}
.run.auraLente .au{animation:pu 3s ease-in-out infinite}
.run.flammes .au{animation:fl .36s ease-in-out infinite alternate}
.run.eclairs .bo{opacity:1}.run.eclairs .bo>g{opacity:0;animation:bo 1.2s steps(1) infinite}
.run.eclairs .bo>g:nth-child(2){animation-delay:-.4s}.run.eclairs .bo>g:nth-child(3){animation-delay:-.8s}
.run.traits .st{opacity:1}.run.traits .st>*{opacity:0;animation-timing-function:ease-in-out;animation-iteration-count:infinite}
.run.traits .st>.tw0{animation-name:t0}.run.traits .st>.tw1{animation-name:t1}.run.traits .st>.tw2{animation-name:t2}
.run.peauRouge .cf-skin{animation:fs 1.1s ease-in-out infinite}
.run.cheveuxFeu .cf-hair{animation:cx 1.6s ease-in-out infinite alternate}
.run.auraFeu .cf-aura{animation:cx 1.2s ease-in-out infinite alternate}
.done .au{opacity:.45}
@keyframes br{50%{transform:scale(1.04)}}
@keyframes sk{0%,100%{transform:translate(0,0)}25%{transform:translate(-.9px,.5px)}50%{transform:translate(.8px,-.5px)}75%{transform:translate(-.5px,-.7px)}}
@keyframes bl{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}
@keyframes sh{0%,100%{opacity:.2}50%{opacity:1}}
@keyframes sw{0%,100%{transform:skewX(0)}25%{transform:skewX(-2.5deg)}75%{transform:skewX(2.5deg)}}
@keyframes pu{0%,100%{transform:scale(.94);opacity:.75}50%{transform:scale(1.06);opacity:1}}
@keyframes fl{0%{transform:scale(.96,.92) skewX(-3deg);opacity:.8}100%{transform:scale(1.04,1.1) skewX(3deg);opacity:1}}
@keyframes bo{0%{opacity:1}10%{opacity:.2}16%{opacity:1}34%,100%{opacity:0}}
@keyframes t0{0%,100%{opacity:0}30%,70%{opacity:var(--peak,1)}}
@keyframes t1{0%,100%{opacity:0}10%{opacity:var(--peak,1)}22%{opacity:.1}34%{opacity:var(--peak,1)}50%{opacity:0}}
@keyframes t2{0%,100%{opacity:.15}55%{opacity:var(--peak,1)}}
@keyframes fs{0%,100%{opacity:0}15%{opacity:.38}30%{opacity:.06}45%{opacity:.3}70%{opacity:0}}
@keyframes cx{0%{opacity:0}100%{opacity:1}}
@media (prefers-reduced-motion: reduce){.run *{animation:none!important}}
</style>`

/**
 * The form's mascot as a whole SVG document, `size` pixels square: animated while its agent
 * runs, still with a dimmed aura once it is done. `id` keeps its gradients apart from another
 * mascot's should a surface inline both in one page.
 */
export const mascotSvg = (form: Form, size: number, isRunning: boolean, id = 'm'): string => {
  const look = LOOKS[form]
  const fx = look.effects
  const has = (e: string): boolean => isRunning && fx.includes(e)
  const { skin, hair } = look
  const aura = !look.aura
    ? ''
    : `<g class="au"><filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter><path d="${AURA}" fill="${look.aura}" opacity=".55" filter="url(#${id}b)"/><path d="${AURA}" transform="${AURA_INNER}" fill="${shade(look.aura, 0.45)}" opacity=".55" filter="url(#${id}b)"/>${
        has('auraFeu') ? `<g class="cf cf-aura"><path d="${AURA}" fill="${FIRE_AURA}" opacity=".55" filter="url(#${id}b)"/><path d="${AURA}" transform="${AURA_INNER}" fill="${shade(FIRE_AURA, 0.45)}" opacity=".55" filter="url(#${id}b)"/></g>` : ''
      }</g>`
  const bolts = !has('eclairs')
    ? ''
    : `<g class="bo"><filter id="${id}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>${BOLTS.map(d => `<g><path d="${d}" ${st(look.aura ?? '#9BD7FF', 6)} filter="url(#${id}g)"/><path d="${d}" ${st('#fff', 2.4)}/></g>`).join('')}</g>`
  const streaks = !has('traits') ? '' : `<g class="st" stroke="#FFD9CF" stroke-linecap="round">${STREAKS}</g>`
  const flush = !has('peauRouge') ? '' : `<g class="cf cf-skin" fill="#FF2A1F"><ellipse cx="23" cy="72" rx="4.5" ry="7"/><ellipse cx="77" cy="72" rx="4.5" ry="7"/><path d="${HEAD}"/></g>`
  const fireHair = !has('cheveuxFeu') ? '' : `<path class="cf cf-hair" d="${HAIR}" fill="url(#${id}f)" stroke="${FIRE_HAIR.edge}" stroke-width="1.6" stroke-linejoin="round"/>`
  const shine = !look.hasShine ? '' : `<g class="sh"><path d="${SHINE}" clip-path="url(#${id}k)" ${st('#fff', 2.4)} opacity=".6"/></g>`
  const eyes = [-1, 1]
    .map(k => {
      const cx = 50 + k * 10, ix = cx - k
      return `<ellipse cx="${cx}" cy="${Y}" rx="6" ry="${look.eyeHeight}" fill="#fff"/><circle cx="${ix}" cy="${Y + 0.5}" r="3.6" fill="url(#${id}i)"/><circle cx="${ix}" cy="${Y + 0.5}" r="1.6" fill="${INK}"/><circle cx="${ix + 1.2}" cy="${Y - 1}" r="1.1" fill="#fff"/>`
    })
    .join('')
  const gradient = (gid: string, p: Palette): string =>
    `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.light}"/><stop offset=".55" stop-color="${p.hair}"/><stop offset="1" stop-color="${p.dark}"/></linearGradient>`
  const classes = isRunning ? `run ${fx.join(' ')}` : 'done'
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${classes}" width="${size}" height="${size}" viewBox="-8 -12 116 116">${CSS}<defs>
<radialGradient id="${id}s" cx="40%" cy="34%" r="72%"><stop offset="0" stop-color="${shade(skin, 0.35)}"/><stop offset=".7" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, -0.18)}"/></radialGradient>
${gradient(`${id}h`, hair)}${fireHair ? gradient(`${id}f`, FIRE_HAIR) : ''}
<clipPath id="${id}c"><path d="${HEAD}"/></clipPath><clipPath id="${id}k"><path d="${HAIR}"/></clipPath>
<radialGradient id="${id}i" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${shade(look.iris, 0.4)}"/><stop offset="1" stop-color="${shade(look.iris, -0.2)}"/></radialGradient></defs>
${aura}${streaks}${bolts}<g class="bd"><g class="br"><g class="sk">
<ellipse cx="23" cy="72" rx="4.5" ry="7" fill="url(#${id}s)"/><ellipse cx="77" cy="72" rx="4.5" ry="7" fill="url(#${id}s)"/><path d="${HEAD}" fill="url(#${id}s)"/>
<path d="${HAIR}" transform="translate(0 14)" fill="${shade(skin, -0.3)}" opacity=".45" clip-path="url(#${id}c)"/>${flush}
<g class="ey">${eyes}</g>${look.brows}${look.mouth}
<g class="hr"><g transform="translate(0 8)"><path d="${HAIR}" fill="url(#${id}h)" stroke="${hair.edge}" stroke-width="1.6" stroke-linejoin="round"/>${fireHair}${shine}</g></g>
</g></g></g></svg>`
}
