import { flushSync } from 'react-dom'
import { cambiarIdioma, type Lang } from './lang'

// The language switch, in place. The text the reader can see turns into the
// other language one character at a time, left to right: each letter flickers
// through a couple of others and lands, the way a split-flap board settles.
// Text nodes are paired by section (the h2 before them) and order; a section
// with a different count in each language, text off screen, the wordmark, the
// scenes and reduced motion just swap.

const DURACION = 560 // ms for a whole run of text
const VENTANA = 70 // ms each character spends flickering
const PASO = 35 // ms between flicker glyphs
const GLIFOS = 'abcdefghijklmnopqrstuvwxyz'
const LETRA = /\p{L}/u

const raices = () => [document.querySelector('.indice'), document.querySelector('.ensayo')].filter(Boolean) as Element[]

function porSeccion(): Map<string, Text[]> {
  const por = new Map<string, Text[]>()
  for (const raiz of raices()) {
    let seccion = raiz.className
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n instanceof Element && n.matches('.ss-stage, .marca, .arte, .solo-lectores') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    })
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n instanceof Element) {
        if (n.tagName === 'H2') seccion = n.id
      } else if (n.nodeValue?.trim()) {
        if (!por.has(seccion)) por.set(seccion, [])
        por.get(seccion)!.push(n as Text)
      }
    }
  }
  return por
}

const enPantalla = (n: Text) => {
  const r = n.parentElement?.getBoundingClientRect()
  return !!r && r.bottom > -80 && r.top < window.innerHeight + 80
}

// The heading the reader is under, and where it sits, so the page doesn't jump
// when the other language is a few lines longer or shorter above it
function ancla() {
  let h: Element | null = null
  for (const el of document.querySelectorAll('.ensayo h2')) if (el.getBoundingClientRect().top <= 120) h = el
  return h ? { id: h.id, top: h.getBoundingClientRect().top } : null
}

function cuadro(a: string, b: string, e: number) {
  const largo = Math.max(a.length, b.length)
  const paso = Math.floor(e / PASO)
  let s = ''
  for (let i = 0; i < largo; i++) {
    const x = a[i] ?? ''
    const y = b[i] ?? ''
    const inicio = (i / largo) * (DURACION - VENTANA)
    if (e < inicio) s += x
    else if (e >= inicio + VENTANA || x === y || !LETRA.test(y)) s += y
    else {
      const g = GLIFOS[((Math.imul(i + 1, 2654435761) + paso * 40503) >>> 0) % GLIFOS.length]
      s += y === y.toLowerCase() ? g : g.toUpperCase()
    }
  }
  return s
}

let corrida = 0

export function cambiarConMorph(l: Lang) {
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const antes = new Map([...porSeccion()].map(([k, v]) => [k, v.map((n) => n.nodeValue ?? '')]))
  const a = ancla()

  // The scenes restart in the new language; they come in on a short fade
  // instead of cutting (sitio.css, html[data-morph])
  if (!quieto) document.documentElement.dataset.morph = ''
  flushSync(() => cambiarIdioma(l))

  // Once now and once on the next frame, after the scenes above have measured
  const fijar = () => {
    const h = a && document.getElementById(a.id)
    if (h) window.scrollBy(0, h.getBoundingClientRect().top - a.top)
  }
  fijar()
  requestAnimationFrame(fijar)
  if (quieto) return

  const vivos: { n: Text; a: string; b: string }[] = []
  for (const [seccion, nodos] of porSeccion()) {
    const viejos = antes.get(seccion)
    if (!viejos || viejos.length !== nodos.length) continue
    nodos.forEach((n, i) => {
      const b = n.nodeValue ?? ''
      if (viejos[i] !== b && enPantalla(n)) vivos.push({ n, a: viejos[i], b })
    })
  }
  // Before the first paint: the new nodes start out showing the old words
  for (const v of vivos) v.n.nodeValue = v.a

  const yo = ++corrida
  const t0 = performance.now()
  const cerrar = () => {
    if (yo !== corrida) return
    corrida++
    for (const v of vivos) v.n.nodeValue = v.b
    delete document.documentElement.dataset.morph
  }
  const tick = (ahora: number) => {
    if (yo !== corrida) return
    const e = ahora - t0
    if (e >= DURACION) return cerrar()
    for (const v of vivos) v.n.nodeValue = cuadro(v.a, v.b, e)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  // A hidden tab gets no frames: the text still lands, just without the flicker
  setTimeout(cerrar, DURACION + 100)
}
