import { Collapse, Caret, Prompt, Stage, Window, type Act, ACENTO } from './ss'
import { Row, type Line } from './terminal'
import './marco.css'
import './medidor.css'
import { t } from '../lang'

// Scene 3 · the meter. `acometida estado` reads every source: each row says
// what date its data is as of, never «now». The BOE and the Federal Register
// are green; legislation.gov.uk ran with no rows and no proof it published
// nothing, so it's yellow, with the reason; Ley Chile has under 14 days of
// history, so it reads «sin medir», never green. The command exits 2. The
// meter card lands beside the BOE's row with its reading: the date of the
// data and the threshold its own history set. Holds, dips, starts again.

type S = { cmd: string; run: boolean; lines: number; card: boolean; dip: boolean }

const COMMAND = 'acometida estado'

const HISTORY = (): Line[] => [
  { k: 'cmd', a: 'acometida correr' },
  { k: 'ok', a: 'boe', b: t('38 filas nuevas', '38 new rows') },
  { k: 'ok', a: 'fedreg', b: t('21 filas nuevas', '21 new rows') },
  { k: 'warn', a: 'leg-gov-uk', b: t('0 filas', '0 rows') },
  { k: 'ok', a: 'ley-chile', b: t('3 filas nuevas', '3 new rows') },
]

type Fila = { k: Line['k']; a: string; fecha: string; estado: string }

const FILAS = (): Fila[] => [
  { k: 'ok', a: 'boe', fecha: t('3 nov 2026', 'Nov 3, 2026'), estado: t('verde', 'green') },
  { k: 'ok', a: 'fedreg', fecha: t('3 nov 2026', 'Nov 3, 2026'), estado: t('verde', 'green') },
  { k: 'warn', a: 'leg-gov-uk', fecha: t('31 oct 2026', 'Oct 31, 2026'), estado: t('amarillo', 'yellow') },
  { k: 'dim', a: 'ley-chile', fecha: t('sin medir', 'not measured'), estado: '' },
]

const NOTA = () => t('leg-gov-uk: sin filas ni prueba de vacío', 'leg-gov-uk: no rows, no proof of none')
const TOTAL = FILAS().length + 2

const initial: S = { cmd: '', run: false, lines: 0, card: false, dip: false }
const poster: S = { cmd: COMMAND, run: true, lines: TOTAL, card: true, dip: false }

async function script(a: Act<S>) {
  await a.wait(500)
  a.mark('type')
  await a.type('cmd', COMMAND)
  await a.wait(250)
  await a.key('enter')
  await a.set({ run: true })
  await a.wait(350)

  a.mark('read')
  for (let i = 1; i <= TOTAL; i++) {
    await a.set({ lines: i })
    await a.wait(i === 1 ? 300 : 420)
    if (i === 1) {
      await a.set({ card: true })
      await a.wait(300)
    }
  }
  await a.wait(3400)

  a.mark('reset')
  await a.set({ card: false, dip: true })
  await a.wait(320)
  await a.snap({ cmd: '', run: false, lines: 0 })
  await a.set({ dip: false })
  await a.wait(400)
}

function Medida({ f, wide }: { f: Fila; wide: boolean }) {
  return (
    <div className="ss-term__line med-fila" data-k={f.k}>
      <span className={f.k === 'ok' ? 'ok' : f.k === 'warn' ? 'warn' : 'dim'}>{f.k === 'ok' ? '✓' : f.k === 'warn' ? '!' : '·'}</span>
      <span className="term-a">{f.a}</span>
      <span className={f.k === 'dim' ? 'dim' : 'term-b'}>{f.fecha}</span>
      {wide && <span className={f.k === 'warn' ? 'warn' : f.k === 'ok' ? 'ok' : 'dim'}>{f.estado}</span>}
    </div>
  )
}

export default function Medidor() {
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
      className="marco med"
    >
      {(s, _rect, layout) => {
        const wide = layout === 'wide'
        return (
          <>
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
                  {FILAS().map((f, i) => (
                    <Collapse key={f.a} open={s.lines > i}>
                      <Medida f={f} wide={wide} />
                    </Collapse>
                  ))}
                  <Collapse open={s.lines > FILAS().length}>
                    <div className="ss-term__line med-nota">
                      <span />
                      <span className="dim">{wide ? NOTA() : t('sin filas ni prueba', 'no rows, no proof')}</span>
                    </div>
                  </Collapse>
                  <Collapse open={s.lines > FILAS().length + 1}>
                    <div className="ss-term__line med-nota">
                      <span />
                      <span className="med-salida">{t('salida 2', 'exit 2')}</span>
                    </div>
                  </Collapse>
                </div>
              </div>
            </Window>

            <div className="marco-sat sat-enter med-card" data-show={s.card || undefined}>
              <div className="med-confirmado">{t('Confirmado', 'Confirmed')}</div>
              <div className="sat-head">
                <span>boe</span>
                <span className="med-chip">{t('verde', 'green')}</span>
              </div>
              <div className="med-card__dato">{t('datos al', 'data as of')}</div>
              <time className="med-card__fecha" dateTime="2026-11-03">
                <span className="med-card__dia">03</span>
                <span className="med-card__mes">{t('nov', 'Nov')}</span>
                <span className="med-card__ano">2026</span>
              </time>
              <div className="sat-foot">{t('umbral 26 h', 'threshold 26 h')}</div>
            </div>
          </>
        )
      }}
    </Stage>
  )
}
