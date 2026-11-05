import { Count, Stage, Window, type Act, ACENTO } from './ss'
import './marco.css'
import './factura.css'
import { t } from '../lang'
import { sello } from '../arte'

// Scene 5 · the bill. What's charged is the service, never the hookup: the
// month's bill lists what was measured (alerts sent, a source routed through
// another country, a reader fixed after the site changed shape), the monthly
// price is honestly not set yet, and the installation line is free. The
// month's last readings roll in on the meter's row, then the round stamp
// lands beside the bill, the payoff. Holds, dips, starts again.

type S = { lecturas: number; stamp: boolean; dip: boolean }

const ANTES = 98
const LECTURAS = 124

const ROWS = () =>
  t(
    [
      ['Instalación de la acometida', 'Gratis'],
      ['Lecturas del medidor', ''],
      ['Medidor hospedado con avisos', '2 avisos'],
      ['Salida por otro país', '1 fuente'],
      ['Reconexión cuando la fuente cambia', '1 arreglo'],
    ],
    [
      ['Hookup installation', 'Free'],
      ['Meter readings', ''],
      ['Hosted meter with alerts', '2 alerts'],
      ['Exit through another country', '1 source'],
      ['Reconnection when a source changes', '1 fix'],
    ],
  )

const initial: S = { lecturas: ANTES, stamp: false, dip: false }
const poster: S = { lecturas: LECTURAS, stamp: true, dip: false }

async function script(a: Act<S>) {
  await a.wait(900)
  a.mark('readings')
  await a.set({ lecturas: LECTURAS })
  await a.wait(1600)
  a.mark('stamp')
  await a.set({ stamp: true })
  await a.wait(3800)

  a.mark('reset')
  await a.set({ dip: true })
  await a.wait(320)
  await a.snap({ lecturas: ANTES, stamp: false })
  await a.set({ dip: false })
  await a.wait(400)
}

export default function Factura() {
  return (
    <Stage<S>
      width={550}
      height={440}
      compact={{ below: 500, width: 400, height: 340 }}
      initial={initial}
      poster={poster}
      script={script}
      accent={ACENTO}
      className="marco fac"
    >
      {(s) => (
        <Window title={t('Factura', 'Bill')} className="marco-win fac-win">
          <Cuenta s={s} />
        </Window>
      )}
    </Stage>
  )
}

// The bill itself, one design that reflows for compact (factura.css)
function Cuenta({ s }: { s: S }) {
  return (
    <div className="fac-papel" data-dip={s.dip || undefined}>
      <div className="fac-mes">{t('Noviembre 2026', 'November 2026')}</div>
      <div className="fac-filas">
        {ROWS().map(([c, v], i) => (
          <div key={c} className="fac-fila" data-primera={i === 0 || undefined} data-fuera={i === 2 || undefined}>
            <span>{c}</span>
            {i === 1 ? (
              <span className="fac-valor fac-valor--lecturas">
                <Count className="fac-cuenta" value={s.lecturas} duration={1100} />
                <span className="fac-unidad">{t('corridas', 'runs')}</span>
              </span>
            ) : (
              <span className="fac-valor">{v}</span>
            )}
          </div>
        ))}
      </div>
      <div className="fac-total">
        <span>{t('Servicio mensual', 'Monthly service')}</span>
        <span className="fac-valor">{t('por definir', 'to be set')}</span>
      </div>
      <pre className="arte fac-sello" data-on={s.stamp || undefined} aria-hidden="true">
        {t(sello(['SERVICIO', 'GARANTIZADO'], ['INSTALACIÓN', 'GRATIS']), sello(['SERVICE', 'GUARANTEED'], ['FREE', 'INSTALLATION']))}
      </pre>
    </div>
  )
}
