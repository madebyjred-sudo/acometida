import Orden from './escenas/orden'
import Linea from './escenas/linea'
import Medidor from './escenas/medidor'
import Chat from './escenas/chat'
import Factura from './escenas/factura'
import Volante from './volante'
import { Prompt } from './llevar'

// The essay in English: ensayo.es.tsx, same sections, same figures, same
// order and the same text-node structure for the language morph.

export const SECCIONES = [
  ['orden', 'The work order'],
  ['linea', 'The service line'],
  ['medidor', 'The meter'],
  ['chat', 'In your chat'],
  ['instalar', 'Install'],
  ['factura', 'The bill'],
  ['notas', 'Notes'],
] as const

export default function Ensayo() {
  return (
    <>
      <p>
        Acometida turns any online source (an official gazette, a statute site, a portal with a search box, a PDF that keeps
        changing) into a connector your chat queries and cites with the real date of the data. You bring your sources, your
        agent and, only to read PDFs with no structure, your OpenRouter key.
      </p>

      <Volante />

      <h2 id="orden">The work order</h2>
      <p>
        You paste a link and <code>acometida nuevo</code> probes it: the way in (API, feed, sitemap, search box or file), the
        headers it asks for, the pace it answers at, what a row is and where its date comes from. It writes the source's card
        and a report of what it measured and what it couldn't.
      </p>

      <figure className="demo" id="escena-orden">
        <Orden />
        <figcaption>
          The BOE answers 400 unless you ask for XML. The probe tries headers, not just the browser. Made with Stageshow
          <sup>
            <a href="#n1" id="r1">
              1
            </a>
          </sup>
          .
        </figcaption>
      </figure>

      <h2 id="linea">The service line</h2>
      <p>
        An acometida is the stretch that connects the street network to your building. Here it connects the source to your
        chat. <code>acometida correr</code> brings in what's new, keeps the raw file with its fingerprint and says green, yellow or
        red, always with a reason. If the source fails, the cursor doesn't move: whatever didn't arrive is asked for on the
        next run.
      </p>
      <p>
        <code>acometida instalar</code> schedules it at the hour you say: launchd on a Mac, cron on Linux, Task Scheduler on
        Windows.
      </p>

      <figure className="demo" id="escena-linea">
        <Linea />
        <figcaption>The technician runs the line once. After that, every run brings only what's new.</figcaption>
      </figure>

      <h2 id="medidor">The meter</h2>
      <p>
        The connector doesn't lie. It never dates anything «now»: if it can't read the date, it leaves it empty and counts it.
        A run with no rows and no proof the source published nothing is yellow. What wasn't measured says «not measured». And
        each source's freshness threshold comes from its own history, not a fixed number.
      </p>
      <p>
        <code>acometida estado</code> reads the meter of every source and exits with code 2 if anything is stale, red or not
        measured, so any scheduler notices.
      </p>

      <figure className="demo" id="escena-medidor">
        <Medidor />
        <figcaption>Ley Chile doesn't have 14 days of history yet: not measured, never green.</figcaption>
      </figure>

      <h2 id="chat">In your chat</h2>
      <p>
        <code>acometida servir</code> opens an MCP server where each source is a tool for your chat: Claude, ChatGPT, Cursor or
        anything that speaks MCP. The tool comes from the source's card, with when to use it and when not to.
      </p>
      <p>
        Every answer says where the data is from and how old it is: «saved copy, data as of Nov 3, 2026» or «live query». And
        a gap says «not in what's loaded», never «doesn't exist».
      </p>

      <figure className="demo" id="escena-chat">
        <Chat />
        <figcaption>The date is the last green run's, not the time of the question.</figcaption>
      </figure>

      <h2 id="instalar">Install</h2>
      <p>Paste this into your agent (Claude Code, Codex or Cursor), open in your project:</p>
      <Prompt />
      <p>Or by hand, with the Acometida folder on your machine:</p>
      <pre className="comando">
        <span className="n">
          1{'\n'}2
        </span>
        <code>
          <span className="c">cp</span> <span className="f">-r</span> ~/acometida/skills/acometida ~/.claude/skills/{'\n'}
          <span className="c">ln</span> <span className="f">-s</span> ~/acometida/bin/acometida ~/.local/bin/acometida
        </code>
      </pre>
      <p>From your project's folder, the five commands:</p>
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
        Everything stays in an <code>acometida/</code> folder inside your project: the source cards, the raw files of every
        run and a SQLite database. Without an OpenRouter key everything runs except reading PDFs with no structure, which has
        a daily spending cap.
      </p>

      <h2 id="factura">The bill</h2>
      <p>
        The installation is free: the skill, the CLI and the cases, with your agent and your keys. The monthly service comes
        later: the hosted meter with alerts, the exit through another country for geo-restricted sources, and the
        reconnection when a source changes shape. You pay for the bill, never for the hookup.
      </p>

      <figure className="demo" id="escena-factura">
        <Factura />
        <figcaption>The monthly service arrives after launch. Its price isn't set yet.</figcaption>
      </figure>

      <footer className="notas">
        <h2 id="notas">Notes</h2>
        <ol>
          <li id="n1">
            The scenes are made with Stageshow, by Benji Taylor, used as is. MIT license.{' '}
            <a href="https://benji.org/stageshow">benji.org/stageshow</a>.{' '}
            <a href="#r1" aria-label="Back to the text">
              ↩
            </a>
          </li>
          <li>
            The sources in the scenes are public: BOE (Spain), Federal Register (US), legislation.gov.uk (UK) and Ley Chile
            (BCN). The runs, counts and answers are illustrative.
          </li>
          <li>The phones on the card are fictional: each one copies the instruction for that agent.</li>
        </ol>
      </footer>
    </>
  )
}
