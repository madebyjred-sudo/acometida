import { useEffect, useState } from 'react'

// The backdrop: the ASCII wordmark again, but drawn big with many small
// characters instead of with big ones. It's painted on a canvas at the width
// of the window, and each 11 px cell becomes a character by how much of it
// the wordmark covers, on the same ramp as the scene grounds (escenas/fondos).
// Only the top rows show: the window's bottom edge cuts the rest (sitio.css).

const LINEAS = [
  '                          __  _    __',
  ' ___ ________  __ _  ___ / /_(_)__/ /__ _',
  "/ _ `/ __/ _ \\/  ' \\/ -_) __/ / _  / _ `/",
  '\\_,_/\\__/\\___/_/_/_/\\__/\\__/_/\\_,_/\\_,_(_)',
]
const RAMPA = ' .·:-=+*#%'
const MONO = "'SF Mono', SFMono-Regular, Menlo, monospace"
const CELDA = 11 // px, the font size and the line height of the backdrop
const ANCHO = 0.94 // of the window the wordmark spans
const MINIMO = 760 // px: on a phone it runs off both sides instead of shrinking to noise
const VISIBLE = 0.56 // of its height that shows above the edge

function dibujar(ancho: number) {
  if (ancho < 1) return { arte: '', alto: 0 }
  const lienzo = document.createElement('canvas')
  const x = lienzo.getContext('2d', { willReadFrequently: true })
  if (!x) return { arte: '', alto: 0 }
  x.font = `${CELDA}px ${MONO}`
  const cw = x.measureText('M').width

  // The wordmark at the size that spans the window, inked a little heavier
  // than the font so its strokes are a few cells thick
  x.font = `700 100px ${MONO}`
  const marca = Math.max(ancho * ANCHO, MINIMO)
  const tam = (100 * marca) / Math.max(...LINEAS.map((l) => x.measureText(l).width))
  const interlinea = tam * 1.1
  lienzo.width = Math.ceil(ancho)
  lienzo.height = Math.ceil(LINEAS.length * interlinea)
  x.font = `700 ${tam}px ${MONO}`
  x.textBaseline = 'top'
  x.lineWidth = tam * 0.08
  x.lineJoin = 'round'
  const izq = (ancho - marca) / 2
  LINEAS.forEach((l, i) => {
    x.fillText(l, izq, i * interlinea)
    x.strokeText(l, izq, i * interlinea)
  })

  const { data, width } = x.getImageData(0, 0, lienzo.width, lienzo.height)
  const cols = Math.floor(ancho / cw)
  const filas = Math.ceil(lienzo.height / CELDA)
  let arte = ''
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < cols; c++) {
      let tinta = 0
      let n = 0
      for (let py = Math.floor(f * CELDA); py < Math.min((f + 1) * CELDA, lienzo.height); py += 2)
        for (let px = Math.floor(c * cw); px < (c + 1) * cw; px += 2) {
          tinta += data[(py * width + px) * 4 + 3]
          n++
        }
      const cubre = n ? tinta / n / 255 : 0
      arte += RAMPA[Math.min(RAMPA.length - 1, Math.floor(cubre * RAMPA.length * 1.4))]
    }
    arte += '\n'
  }
  return { arte, alto: Math.round(filas * CELDA * VISIBLE) }
}

export default function Telon() {
  const [dibujo, setDibujo] = useState({ arte: '', alto: 0 })
  useEffect(() => {
    const pintar = () => setDibujo(dibujar(document.documentElement.clientWidth))
    pintar()
    let espera = 0
    const cambio = () => {
      clearTimeout(espera)
      espera = window.setTimeout(pintar, 150)
    }
    window.addEventListener('resize', cambio)
    return () => {
      window.removeEventListener('resize', cambio)
      clearTimeout(espera)
    }
  }, [])
  return (
    <div className="telon" aria-hidden="true" style={{ height: dibujo.alto }}>
      <pre>{dibujo.arte}</pre>
    </div>
  )
}
