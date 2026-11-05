import Orden from './escenas/orden'
import Linea from './escenas/linea'
import Medidor from './escenas/medidor'
import Chat from './escenas/chat'
import Factura from './escenas/factura'
import Volante from './volante'
import { Prompt } from './llevar'

// The essay in Spanish. ensayo.en.tsx is the same page in English: same
// sections, same figures, in the same order; a change here goes there too.

export const SECCIONES = [
  ['orden', 'La orden de servicio'],
  ['linea', 'La línea'],
  ['medidor', 'El medidor'],
  ['chat', 'En tu chat'],
  ['instalar', 'Instalar'],
  ['factura', 'La factura'],
  ['notas', 'Notas'],
] as const

export default function Ensayo() {
  return (
    <>
      <p>
        Acometida convierte cualquier fuente en línea (un boletín oficial, un sitio de normas, un portal con buscador, un PDF
        que se actualiza) en un conector que tu chat consulta y cita con la fecha real del dato. Traes tus fuentes, tu
        agente y, solo para leer PDF sin estructura, tu llave de OpenRouter.
      </p>

      <Volante />

      <h2 id="orden">La orden de servicio</h2>
      <p>
        Pegas un link y <code>acometida nuevo</code> lo sondea: cómo se entra (API, feed, sitemap, buscador o archivo), qué
        cabeceras pide, a qué ritmo responde, qué es una fila y de dónde sale su fecha. Escribe la ficha de la fuente y un
        reporte con lo que midió y lo que no pudo medir.
      </p>

      <figure className="demo" id="escena-orden">
        <Orden />
        <figcaption>
          El BOE responde 400 si no le pides XML. La sonda prueba cabeceras, no solo el navegador. Hecho con Stageshow
          <sup>
            <a href="#n1" id="r1">
              1
            </a>
          </sup>
          .
        </figcaption>
      </figure>

      <h2 id="linea">La línea</h2>
      <p>
        Una acometida es el tramo que une la red de la calle con tu edificio. Aquí une la fuente con tu chat.{' '}
        <code>acometida correr</code> trae lo nuevo, guarda el crudo con su huella y dice verde, amarillo o rojo, siempre con
        motivo. Si la fuente falla, el cursor no avanza: lo que no llegó se pide en la próxima corrida.
      </p>
      <p>
        <code>acometida instalar</code> lo deja programado a la hora que digas: launchd en Mac, cron en Linux, Programador de
        tareas en Windows.
      </p>

      <figure className="demo" id="escena-linea">
        <Linea />
        <figcaption>El técnico tiende la línea una vez. Después, cada corrida trae solo lo nuevo.</figcaption>
      </figure>

      <h2 id="medidor">El medidor</h2>
      <p>
        El conector no miente. Nunca fecha con «ahora»: si no puede leer la fecha, la deja vacía y la cuenta. Una corrida sin
        filas y sin prueba de que la fuente no publicó es amarillo. Lo que no se midió dice «sin medir». Y el umbral de
        frescura de cada fuente sale de su propio histórico, no de un número fijo.
      </p>
      <p>
        <code>acometida estado</code> lee el medidor de todas tus fuentes y sale con código 2 si algo está viejo, rojo o sin
        medir, así cualquier programador de tareas lo nota.
      </p>

      <figure className="demo" id="escena-medidor">
        <Medidor />
        <figcaption>Ley Chile todavía no junta 14 días de historia: sin medir, nunca verde.</figcaption>
      </figure>

      <h2 id="chat">En tu chat</h2>
      <p>
        <code>acometida servir</code> abre un servidor MCP donde cada fuente es una herramienta para tu chat: Claude, ChatGPT,
        Cursor o cualquiera que hable MCP. La herramienta sale de la ficha, con cuándo usarla y cuándo no.
      </p>
      <p>
        Cada respuesta dice de dónde y de cuándo es el dato: «copia guardada, datos al 3 nov 2026» o «consulta en vivo». Y un
        vacío dice «no consta en lo cargado», nunca «no existe».
      </p>

      <figure className="demo" id="escena-chat">
        <Chat />
        <figcaption>La fecha es la de la última corrida verde, no la hora de la pregunta.</figcaption>
      </figure>

      <h2 id="instalar">Instalar</h2>
      <p>Pégale esto a tu agente (Claude Code, Codex o Cursor) abierto en tu proyecto:</p>
      <Prompt />
      <p>O a mano, con la carpeta de Acometida en tu equipo:</p>
      <pre className="comando">
        <span className="n">
          1{'\n'}2
        </span>
        <code>
          <span className="c">cp</span> <span className="f">-r</span> ~/acometida/skills/acometida ~/.claude/skills/{'\n'}
          <span className="c">ln</span> <span className="f">-s</span> ~/acometida/bin/acometida ~/.local/bin/acometida
        </code>
      </pre>
      <p>Desde la carpeta de tu proyecto, los cinco comandos:</p>
      <pre className="comando">
        <span className="n">
          1{'\n'}2{'\n'}3{'\n'}4{'\n'}5
        </span>
        <code>
          <span className="c">acometida</span> nuevo <span className="f">&lt;url&gt;</span>
          {'\n'}
          <span className="c">acometida</span> correr <span className="f">[fuente]</span>
          {'\n'}
          <span className="c">acometida</span> estado{'\n'}
          <span className="c">acometida</span> servir{'\n'}
          <span className="c">acometida</span> instalar
        </code>
      </pre>
      <p>
        Todo queda en una carpeta <code>acometida/</code> dentro de tu proyecto: las fichas, el crudo de cada corrida y una
        base SQLite. Sin llave de OpenRouter corre todo menos la lectura de PDF sin estructura, que lleva tope de gasto diario.
      </p>

      <h2 id="factura">La factura</h2>
      <p>
        La instalación es gratis: la skill, el CLI y los casos, con tu agente y tus llaves. Después llega el servicio mensual:
        el medidor hospedado con avisos, la salida por otro país para fuentes con restricción geográfica y la reconexión
        cuando una fuente cambia de forma. Se cobra la factura, no la acometida.
      </p>

      <figure className="demo" id="escena-factura">
        <Factura />
        <figcaption>El servicio mensual llega después del lanzamiento. Su precio está por definir.</figcaption>
      </figure>

      <footer className="notas">
        <h2 id="notas">Notas</h2>
        <ol>
          <li id="n1">
            Las escenas están hechas con Stageshow, de Benji Taylor, usado tal cual. Licencia MIT.{' '}
            <a href="https://benji.org/stageshow">benji.org/stageshow</a>.{' '}
            <a href="#r1" aria-label="Volver al texto">
              ↩
            </a>
          </li>
          <li>
            Las fuentes de las escenas son públicas: BOE (España), Federal Register (EE. UU.), legislation.gov.uk (Reino
            Unido) y Ley Chile (BCN). Las corridas, los conteos y las respuestas son ilustrativos.
          </li>
          <li>Los teléfonos de la tarjeta son ficticios: cada uno copia la instrucción para ese agente.</li>
        </ol>
      </footer>
    </>
  )
}
