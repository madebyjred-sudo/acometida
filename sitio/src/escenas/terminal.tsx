import { Prompt } from './ss'

// One line of Acometida's output, as the CLI prints it: a mark in its own
// cell (✓ done, ! yellow, · quiet), a key and a value. `out` is the closing
// line, bold, across the key and value columns.

export type Line = {
  k: 'ok' | 'warn' | 'dim' | 'out' | 'cmd'
  a: string
  b?: string
  /** Only in the wide design */
  wideOnly?: boolean
}

const MARCA = { ok: '✓', warn: '!', dim: '·', out: '', cmd: '' }

export function Row({ l, path = '~/leyes' }: { l: Line; path?: string }) {
  if (l.k === 'cmd') return <Prompt path={path}>{l.a}</Prompt>
  return (
    <div className="ss-term__line term-line" data-k={l.k}>
      <span className={l.k === 'ok' ? 'ok' : l.k === 'warn' ? 'warn' : 'dim'}>{MARCA[l.k]}</span>
      <span className="term-a">{l.a}</span>
      {l.b && <span className={l.k === 'dim' ? 'dim term-b' : 'term-b'}>{l.b}</span>}
    </div>
  )
}
