import { Collapse, Caret, Prompt, Stage, Window, type Act, ACENTO } from './ss'
import { Row, type Line } from './terminal'
import './marco.css'
import './orden.css'
import { t } from '../lang'

// Scene 1 · the work order. A terminal mid-session: Ley Chile was
// hooked up a moment ago. A link to the BOE is typed after `acometida nuevo`
// and the probe reports, one line at a time, what it measured: the way in,
// the header the API asks for (it answers 400 without it), what a row is, the
// date, the pace. The last line writes the source's card, and the work order
// lands on the terminal's empty right side with the source's name on it. It
// holds, then the feed dips out and back in at the start. Poster: the order
// filled in.

type S = { cmd: string; run: boolean; lines: number; card: boolean; dip: boolean }

const COMMAND = 'acometida nuevo https://www.boe.es'

const HISTORY = (): Line[] => [
  { k: 'cmd', a: 'acometida nuevo https://www.bcn.cl' },
  { k: 'ok', a: t('acceso', 'access'), b: t('buscador HTML', 'HTML search') },
  { k: 'ok', a: t('fila', 'row'), b: t('norma', 'statute') },
  { k: 'ok', a: t('ficha', 'card'), b: 'fuentes/ley-chile.ts' },
  { k: 'cmd', a: 'acometida correr ley-chile' },
  { k: 'ok', a: t('nuevas', 'new'), b: t('12 normas', '12 statutes') },
  { k: 'out', a: t('verde · datos al 3 nov 2026', 'green · data as of Nov 3, 2026') },
]

const LINES = (): Line[] => [
  { k: 'dim', a: t('sonda', 'probe'), b: 'www.boe.es', wideOnly: true },
  { k: 'ok', a: t('acceso', 'access'), b: t('API datos abiertos', 'open data API') },
  { k: 'dim', a: t('sin Accept', 'no Accept'), b: '400' },
  { k: 'ok', a: 'Accept', b: 'application/xml' },
  { k: 'ok', a: t('fila', 'row'), b: t('disposición', 'provision') },
  { k: 'ok', a: t('fecha', 'date'), b: t('publicación', 'publication') },
  { k: 'ok', a: t('ritmo', 'pace'), b: t('1 cada 2 s', '1 every 2 s'), wideOnly: true },
  { k: 'ok', a: t('ficha', 'card'), b: 'fuentes/boe.ts' },
]

const initial: S = { cmd: '', run: false, lines: 0, card: false, dip: false }
const poster: S = { cmd: COMMAND, run: true, lines: LINES().length, card: true, dip: false }

async function script(a: Act<S>) {
  await a.wait(500)
  a.mark('type')
  await a.type('cmd', COMMAND)
  await a.wait(250)
  await a.key('enter')
  await a.set({ run: true })
  await a.wait(400)

  a.mark('probe')
  for (let i = 1; i <= LINES().length; i++) {
    await a.set({ lines: i })
    await a.wait(i < 6 ? 420 : 320)
  }
  await a.wait(250)

  a.mark('order')
  await a.set({ card: true })
  await a.wait(3600)

  a.mark('reset')
  await a.set({ card: false, dip: true })
  await a.wait(320)
  await a.snap({ cmd: '', run: false, lines: 0 })
  await a.set({ dip: false })
  await a.wait(400)
}

export default function Orden() {
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
      className="marco ord"
    >
      {(s, _rect, layout) => {
        const wide = layout === 'wide'
        const keep = (l: Line) => wide || !l.wideOnly
        const shown = LINES().filter(keep)
        const count = wide ? s.lines : LINES().slice(0, s.lines).filter(keep).length
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
                  {shown.map((l, i) => (
                    <Collapse key={`n-${l.a}`} open={count > i}>
                      <Row l={l} />
                    </Collapse>
                  ))}
                </div>
              </div>
            </Window>

            <div className="marco-sat sat-enter ord-card" data-show={s.card || undefined}>
              <div className="sat-head">
                <span>{t('Orden 0151', 'Order 0151')}</span>
                <span className="ord-card__dia">{t('4 nov', 'Nov 4')}</span>
              </div>
              <div className="ord-card__fuente">BOE</div>
              <div className="sat-foot">{t('API · XML', 'API · XML')}</div>
            </div>
          </>
        )
      }}
    </Stage>
  )
}
