// Grounds for the demo stages, drawn in ASCII instead of gradients: a grid of
// monospace glyphs in the page's royal blue (PANTONE Reflex Blue C), a
// lighter tint of it on the grafito ground, whose density
// carries finder-glass's light (bright at the top left, gone at the bottom right). One SVG per color family, 550 × 440,
// deterministic (seeded), so the files only change when this script does.
// Usage: node herramientas/fondos-ascii.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const out = fileURLToPath(new URL('../src/escenas/fondos/', import.meta.url))
mkdirSync(out, { recursive: true })

const W = 550
const H = 440
const CW = 6.6 // cell width (Menlo 11px advances 6.6px)
const CH = 11
const RAMP = ' .·:-=+*#%'

// Ground, glyph color, glyph opacity, and where the glyphs gather
const FAMILIAS = {
  claro: { fondo: '#d9d9d6', tinta: '#001489', alfa: 0.5, hacia: 'arriba' },
  grafito: { fondo: '#53565a', tinta: '#8a9af2', alfa: 0.6, hacia: 'arriba' },
}

// Small seeded hash for the dither, so neighbouring cells don't band
function ruido(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const esc = (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c)

for (const [nombre, f] of Object.entries(FAMILIAS)) {
  const cols = Math.ceil(W / CW)
  const rows = Math.ceil(H / CH)
  const lineas = []
  for (let r = 0; r < rows; r++) {
    let s = ''
    for (let c = 0; c < cols; c++) {
      const u = c / cols
      const v = r / rows
      // Distance from the light corner, 0 at the top left, 1 at the bottom right
      const d = Math.min(1, Math.hypot(u * 0.9, v * 1.1) / 1.3)
      const t = f.hacia === 'abajo' ? d : 1 - d
      const k = Math.max(0, Math.min(RAMP.length - 1, Math.floor(Math.pow(t, 1.25) * (RAMP.length - 1) + (ruido(c, r) - 0.5) * 1.6)))
      s += esc(RAMP[k])
    }
    lineas.push(`<text x="0" y="${((r + 1) * CH - 2).toFixed(1)}">${s}</text>`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${f.fondo}"/><g fill="${f.tinta}" fill-opacity="${f.alfa}" font-family="Menlo, ui-monospace, monospace" font-size="11" xml:space="preserve">${lineas.join('')}</g></svg>\n`
  writeFileSync(`${out}${nombre}.svg`, svg)
  console.log(`${out}${nombre}.svg ${(svg.length / 1024).toFixed(1)} kB`)
}
