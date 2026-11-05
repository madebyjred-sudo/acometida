import { useState } from 'react'
import { t } from './lang'

// Taking Acometida to someone's own agent. Clone the public repo, copy the
// skill into the agent's own skills, put the command on the PATH and stop at
// the first source. One line changes per agent: where `acometida servir` is
// registered as an MCP server.

export const AGENTES = ['Claude Code', 'Codex', 'Cursor'] as const
export type Agente = (typeof AGENTES)[number]

export const PROMPT = (agente?: Agente) =>
  t(
    [
      'Instala Acometida en este equipo. Clona https://github.com/madebyjred-sudo/acometida.git, copia skills/acometida a tu carpeta de skills y deja el comando acometida (bin/acometida) en el PATH.',
      agente
        ? `Registra acometida servir como servidor MCP de ${agente}.`
        : 'Registra acometida servir como servidor MCP de este agente.',
      'Después pídeme el link de la primera fuente, corre acometida nuevo con él y muéstrame la ficha y el reporte de la sonda.',
      'No programes corridas con acometida instalar sin preguntarme.',
    ],
    [
      'Install Acometida on this machine. Clone https://github.com/madebyjred-sudo/acometida.git, copy skills/acometida into your skills folder and put the acometida command (bin/acometida) on the PATH.',
      agente ? `Register acometida servir as an MCP server in ${agente}.` : 'Register acometida servir as an MCP server in this agent.',
      'Then ask me for the link of the first source, run acometida nuevo with it and show me the source card and the probe report, in English.',
      "Don't schedule runs with acometida instalar without asking me.",
    ],
  ).join(' ')

// The Clipboard API first; where a browser or an embed blocks it, the old
// selection copy, which still works inside the click
export async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const campo = document.createElement('textarea')
    campo.value = texto
    campo.setAttribute('readonly', '')
    campo.style.position = 'fixed'
    campo.style.opacity = '0'
    document.body.appendChild(campo)
    campo.select()
    const ok = document.execCommand('copy')
    campo.remove()
    return ok
  }
}

/** The instruction itself, shown whole at the install step, with its copy. */
export function Prompt() {
  const [hecho, setHecho] = useState(false)
  return (
    <div className="prompt">
      <p className="prompt__texto">{PROMPT()}</p>
      <button
        type="button"
        className="boton boton--chico"
        onClick={async () => {
          if (!(await copiar(PROMPT()))) return
          setHecho(true)
          setTimeout(() => setHecho(false), 1600)
        }}
      >
        <span className="pila">
          <span aria-hidden={hecho || undefined} data-off={hecho || undefined}>
            {t('Copiar', 'Copy')}
          </span>
          <span aria-hidden={!hecho || undefined} data-off={!hecho || undefined}>
            {t('Copiado', 'Copied')}
          </span>
        </span>
      </button>
    </div>
  )
}
