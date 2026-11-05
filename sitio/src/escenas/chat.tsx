import { Bar, Collapse, Field, Stage, Stream, Text, Window, type Act, ACENTO } from './ss'
import './marco.css'
import './chat.css'
import { t } from '../lang'

// Scene 4 · in your chat. Stageshow's ai-chat, in the page's frame: a
// question about the Federal Register is typed and sent; the chat checks the
// source's tool (that line is the only sign of the plumbing); the answer
// streams in with the date of the data and says plainly what isn't loaded;
// last, its origin: saved copy, data as of the last green run. Holds, the
// thread dips, starts again. Poster: the whole answer with its origin.

type S = { draft: string; sent: boolean; phase: 'idle' | 'tool' | 'answer'; words: number; source: boolean; dip: boolean }

const Q = () => t('¿Qué publicó el Federal Register sobre drones?', 'What did the Federal Register publish on drones?')
const A = () =>
  t(
    'Tres documentos de la FAA, el último del 3 nov 2026. Lo anterior al 1 sep 2026 no consta en lo cargado.',
    'Three FAA documents, the latest from Nov 3, 2026. Anything before Sep 1, 2026 is not in what’s loaded.',
  )
const WORDS = () => A().split(' ').length

const initial: S = { draft: '', sent: false, phase: 'idle', words: 0, source: false, dip: false }
const poster = (): S => ({ draft: '', sent: true, phase: 'answer', words: WORDS(), source: true, dip: false })

async function script(a: Act<S>) {
  await a.wait(600)
  a.mark('type')
  await a.type('draft', Q(), { interval: 34 })
  await a.wait(350)
  a.mark('send')
  await a.set({ sent: true, draft: '' })
  await a.wait(400)
  await a.set({ phase: 'tool' })
  await a.wait(1100)
  a.mark('stream')
  await a.set({ phase: 'answer' })
  for (let i = 1; i <= WORDS(); i++) {
    a.put({ words: i })
    await a.wait(55)
  }
  await a.wait(300)
  a.mark('source')
  await a.set({ source: true })
  await a.wait(3400)

  a.mark('reset')
  await a.set({ dip: true })
  await a.wait(320)
  await a.snap({ sent: false, phase: 'idle', words: 0, source: false })
  await a.set({ dip: false })
  await a.wait(300)
}

export default function Chat() {
  return (
    <Stage<S>
      width={550}
      height={440}
      compact={{ below: 500, width: 400, height: 340 }}
      initial={initial}
      poster={poster()}
      script={script}
      accent={ACENTO}
      className="marco cht oscuro"
    >
      {(s) => (
        <Window title="Chat" className="marco-win cht-win">
          <div className="cht-body">
            <div className="cht-thread" data-dip={s.dip || undefined}>
              <div className="cht-past">
                <Bar w="84%" h={7} r={4} tone={2} />
                <Bar w="58%" h={7} r={4} tone={2} />
              </div>
              <Collapse open={s.sent} reveal="drop" from="below">
                <div className="cht-q">
                  <Text>{Q()}</Text>
                </div>
              </Collapse>
              <Collapse open={s.phase === 'tool'}>
                <div className="cht-tool">{t('Consultando federal-register', 'Checking federal-register')}</div>
              </Collapse>
              <Collapse open={s.phase === 'answer'}>
                <div className="cht-a">
                  <Stream className="cht-stream" text={A()} count={s.words} />
                  <div className="cht-origen" data-on={s.source || undefined}>
                    <span className="cht-origen__fuente">Federal Register</span>
                    <span>{t('copia guardada, datos al 3 nov 2026', 'saved copy, data as of Nov 3, 2026')}</span>
                  </div>
                </div>
              </Collapse>
            </div>
            <Field className="cht-composer" value={s.draft} placeholder={t('Pregunta a tus fuentes', 'Ask your sources')} focused={!s.sent} />
          </div>
        </Window>
      )}
    </Stage>
  )
}
