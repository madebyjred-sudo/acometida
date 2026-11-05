import { useState } from 'react'
import { t } from './lang'
import { AGENTES, PROMPT, copiar, type Agente } from './llevar'
import { CASCO, TECNICO, sello } from './arte'

// The flyer, after the ones taped to poles and slipped under doors across
// Latin America: the name of the service in red capitals, the trades in bold
// italic, «y mucho más», the mascot with his wrench, the round stamp and the
// phones, giant, stacked tight like the hand-painted
// signs of Mexico and the chicha posters of Peru. Here the phones are the way in: each one copies the
// instruction for that agent. The numbers are fictional on purpose (the
// 555-01XX block is reserved for fiction); 151 is the hard hat's Pantone.

const NUMEROS: Record<Agente, string> = {
  'Claude Code': '(555) 010-0151',
  Codex: '(555) 010-0152',
  Cursor: '(555) 010-0153',
}

const SERVICIOS = () =>
  t(
    [
      'Instalación de fuentes oficiales, boletines y portales',
      'Lectura de PDF que se actualiza',
      'Medidor de frescura con fecha real',
      'Programación a la hora que digas',
      'Reconexión cuando el sitio cambia',
      'Salida por otro país',
      'Conexión a Claude, ChatGPT y Cursor',
    ],
    [
      'Hookups for official sources, gazettes and portals',
      'Reading for PDFs that keep changing',
      'Freshness meter with the real date',
      'Scheduling at the hour you say',
      'Reconnection when the site changes',
      'Exit through another country',
      'Connection to Claude, ChatGPT and Cursor',
    ],
  )

function Telefono({ agente }: { agente: Agente }) {
  const [hecho, setHecho] = useState(false)
  return (
    <button
      type="button"
      className="telefono"
      aria-label={t(`Copiar la instrucción para ${agente}`, `Copy the instruction for ${agente}`)}
      onClick={async () => {
        if (!(await copiar(PROMPT(agente)))) return
        setHecho(true)
        setTimeout(() => setHecho(false), 1800)
      }}
    >
      <span className="telefono__agente">{agente}</span>
      <span className="telefono__numero pila" aria-live="polite">
        <span data-off={hecho || undefined} aria-hidden={hecho || undefined}>
          {NUMEROS[agente]}
        </span>
        <span data-off={!hecho || undefined} aria-hidden={!hecho || undefined}>
          {t('Copiado', 'Copied')}
        </span>
      </span>
    </button>
  )
}

export default function Volante() {
  return (
    <section className="volante" aria-label={t('Servicios', 'Services')}>
      <div className="volante__cinta" aria-hidden="true" />
      <div className="volante__cabeza">
        <div>
          <p className="volante__nombre">
            <span className="volante__nombre-pre">{t('Servicio integral de', 'Full service')}</span>
            <span className="volante__nombre-gran">{t('Acometidas', 'Hookups')}</span>
          </p>
          <p className="volante__alcance">{t('Boletines, normas, portales y PDF', 'Gazettes, statutes, portals and PDFs')}</p>
        </div>
        <pre className="arte volante__tecnico" aria-hidden="true">
          {CASCO.map(([a, b]) => (
            <span key={b}>
              {a}
              <span className="volante__casco">{b}</span>
              {'\n'}
            </span>
          ))}
          {TECNICO}
        </pre>
      </div>
      <ul className="volante__servicios">
        {SERVICIOS().map((s, i, todos) => (
          <li key={s}>
            {s}
            {i === todos.length - 1 && <span className="volante__mas">{t('y mucho más', 'and much more')}</span>}
          </li>
        ))}
      </ul>
      <div className="volante__pie">
        <pre className="arte volante__sello" aria-hidden="true">
          {t(sello(['SERVICIO', 'GARANTIZADO'], ['INSTALACIÓN', 'GRATIS']), sello(['SERVICE', 'GUARANTEED'], ['FREE', 'INSTALLATION']))}
        </pre>
        <div className="volante__llama">
          <p className="volante__llama-t">{t('Llama gratis', 'Call toll free')}</p>
          {AGENTES.map((a) => (
            <Telefono key={a} agente={a} />
          ))}
          <p className="volante__correo">taller@acometida.example</p>
        </div>
      </div>
    </section>
  )
}
