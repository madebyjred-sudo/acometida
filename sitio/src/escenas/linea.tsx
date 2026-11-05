import { Collapse, Caret, Prompt, Stage, Window, type Act, ACENTO } from './ss'
import { Row, type Line } from './terminal'
import './marco.css'
import './linea.css'
import { t } from '../lang'

// Scene 2 · the line. The BOE was probed a moment ago (its card is in the
// history). `acometida correr boe` is typed and the CLI draws what a run is:
// the street's pole with the source on it, a house at the far end, and the
// technician walking the cable from one to the other, the line paying out
// behind him in blue. When he reaches the house its window lights, and the
// run reports: what it found, fetched, kept, and where the cursor stands,
// closing on green with the real date. Holds, dips, starts again.

type S = { cmd: string; run: boolean; dibujo: boolean; tendida: boolean; luz: boolean; lines: number; dip: boolean }

const COMMAND = 'acometida correr boe'
const LARGO = 29 // ch of cable, pole to roof

const HISTORY = (): Line[] => [
  { k: 'cmd', a: 'acometida nuevo https://www.boe.es' },
  { k: 'ok', a: 'Accept', b: 'application/xml' },
  { k: 'ok', a: t('ficha', 'card'), b: 'fuentes/boe.ts' },
]

const LINES = (): Line[] => [
  { k: 'ok', a: t('descubrir', 'discover'), b: t('38 pendientes', '38 pending') },
  { k: 'ok', a: t('traer', 'fetch'), b: t('38 de 38', '38 of 38') },
  { k: 'ok', a: t('crudo', 'raw'), b: 'sha256 9f2c41e0', wideOnly: true },
  { k: 'ok', a: t('guardar', 'store'), b: t('38 filas nuevas', '38 new rows') },
  { k: 'ok', a: 'cursor', b: t('3 nov 2026', 'Nov 3, 2026'), wideOnly: true },
  { k: 'out', a: t('verde · datos al 3 nov 2026', 'green · data as of Nov 3, 2026') },
]

// The fixed part of the drawing: the pole with its source, the house, the ground
const POSTE = ['.-----.', '| BOE |', "'--+--'", '   |', '   |']
const CASA = ['   /\\', '  /  \\', ' /____\\', ' | ', ' |____|']
const ANCHO = 44
function base() {
  const filas: string[] = []
  for (let i = 0; i < 5; i++) filas.push((POSTE[i] ?? '').padEnd(35) + (CASA[i] ?? ''))
  filas.push('-'.repeat(ANCHO))
  return filas
}

const initial: S = { cmd: '', run: false, dibujo: false, tendida: false, luz: false, lines: 0, dip: false }
const poster: S = { cmd: COMMAND, run: true, dibujo: true, tendida: true, luz: true, lines: LINES().length, dip: false }

async function script(a: Act<S>) {
  await a.wait(500)
  a.mark('type')
  await a.type('cmd', COMMAND)
  await a.wait(250)
  await a.key('enter')
  await a.set({ run: true })
  await a.wait(300)
  await a.set({ dibujo: true })
  await a.wait(500)

  a.mark('line')
  await a.set({ tendida: true })
  await a.wait(2500)
  await a.set({ luz: true })
  await a.wait(500)

  a.mark('run')
  for (let i = 1; i <= LINES().length; i++) {
    await a.set({ lines: i })
    await a.wait(360)
  }
  await a.wait(3200)

  a.mark('reset')
  await a.set({ dip: true })
  await a.wait(320)
  await a.snap({ cmd: '', run: false, dibujo: false, tendida: false, luz: false, lines: 0 })
  await a.set({ dip: false })
  await a.wait(400)
}

function Dibujo({ tendida, luz }: { tendida: boolean; luz: boolean }) {
  const filas = base()
  return (
    <div className="lin-dibujo" aria-hidden="true">
      <pre className="lin-base">
        {filas.map((f, i) =>
          i === 3 ? (
            <span key={i}>
              {f}
              <span className="lin-ventana" data-on={luz || undefined}>
                []
              </span>
              {' |\n'}
            </span>
          ) : (
            <span key={i}>{f + '\n'}</span>
          ),
        )}
      </pre>
      <span className="lin-cable" style={{ width: tendida ? `${LARGO}ch` : '0ch' }}>
        {'='.repeat(LARGO)}
      </span>
      <pre className="lin-tecnico" style={{ left: tendida ? `${7 + LARGO - 4}ch` : '8ch' }}>
        {' o/\n/|\n/ \\'}
      </pre>
    </div>
  )
}

export default function Linea() {
  return (
    <Stage<S>
      width={550}
      height={440}
      compact={{ below: 500, width: 400, height: 340 }}
      initial={initial}
      poster={poster}
      script={script}
      accent={ACENTO}
      keys={{ wide: 'bottom-left', compact: 'top' }}
      className="marco lin oscuro"
    >
      {(s, _rect, layout) => {
        const wide = layout === 'wide'
        const keep = (l: Line) => wide || !l.wideOnly
        const shown = LINES().filter(keep)
        const count = wide ? s.lines : LINES().slice(0, s.lines).filter(keep).length
        return (
          <Window chrome="terminal" title="leyes · zsh" className="marco-win">
            <div className="term-body">
              <div className="term-feed" data-dip={s.dip || undefined}>
                {HISTORY().map((l, i) => (
                  <Row key={`h-${i}`} l={l} />
                ))}
                <Prompt path="~/leyes">
                  {s.cmd}
                  {!s.run && <Caret still={s.cmd.length > 0 && s.cmd.length < COMMAND.length} />}
                </Prompt>
                <Collapse open={s.dibujo}>
                  <Dibujo tendida={s.tendida} luz={s.luz} />
                </Collapse>
                {shown.map((l, i) => (
                  <Collapse key={`n-${l.a}`} open={count > i}>
                    <Row l={l} />
                  </Collapse>
                ))}
              </div>
            </div>
          </Window>
        )
      }}
    </Stage>
  )
}
