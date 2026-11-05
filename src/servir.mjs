/**
 * MCP por stdio. Cada fuente es una herramienta (`consultar_<fuente>`) armada desde su ficha, más
 * `estado_de_las_fuentes`. Sin SDK: JSON-RPC de una línea por mensaje.
 */
import { createInterface } from 'node:readline';
import { consultar } from './consulta.mjs';
import { ayudas, errores } from './ctx.mjs';
import { crearTraer } from './traer.mjs';
import { estadoFuente } from './vigia.mjs';

const VERSION = '0.1.0';

export function herramientasDe(fuentes) {
  const props = {
    consulta: { type: 'string', description: 'Palabras a buscar en el texto y el título' },
    desde: { type: 'string', description: 'Fecha de publicación mínima, AAAA-MM-DD' },
    hasta: { type: 'string', description: 'Fecha de publicación máxima, AAAA-MM-DD' },
    clave: { type: 'string', description: 'Identificador exacto del documento en esta fuente' },
  };
  return [
    ...fuentes.map((c) => ({
      name: `consultar_${c.fuente}`,
      description: [
        `${c.nombre ?? c.fuente}.`,
        c.cuandoUsar ? `Úsala para: ${c.cuandoUsar}` : null,
        c.cuandoNo ? `No la uses para: ${c.cuandoNo}` : null,
        'Responde desde la copia guardada (o en vivo si la fuente lo permite y la copia no alcanza) y dice siempre origen, «datos al» y cobertura.',
      ].filter(Boolean).join(' '),
      inputSchema: { type: 'object', properties: props },
    })),
    {
      name: 'estado_de_las_fuentes',
      description: 'El medidor: por fuente, si está al día, desde cuándo son sus datos y qué no se pudo medir.',
      inputSchema: { type: 'object', properties: {} },
    },
  ];
}

export async function llamar(proyecto, nombre, args = {}, ahora = new Date()) {
  if (nombre === 'estado_de_las_fuentes') {
    const t = proyecto.fuentes.map((c) => {
      const e = estadoFuente(proyecto.base, c, ahora);
      return `${e.nombre} (${c.fuente}): ${e.semaforo.toUpperCase()} · datos al ${e.datosAl?.slice(0, 10) ?? 'sin corrida verde'}\n  ${e.lineas.join('\n  ')}`;
    });
    return { texto: t.join('\n') || 'No hay fuentes instaladas.', error: false };
  }
  const c = proyecto.fuentes.find((f) => `consultar_${f.fuente}` === nombre);
  if (!c) return { texto: `No existe la herramienta ${nombre}.`, error: true };
  const env = proyecto.env ?? process.env;
  const { traer } = crearTraer(c, { env });
  const ctx = { fuente: c.fuente, env, ahora, traer, ayudas: await ayudas(), errores, log: (m) => process.stderr.write(`[acometida] ${m}\n`) };
  const r = await consultar(proyecto.base, c, args, { ahora, ctx });
  return { texto: r.texto, error: false };
}

export function servir(proyecto, { entrada = process.stdin, salida = process.stdout } = {}) {
  const enviar = (m) => salida.write(`${JSON.stringify(m)}\n`);
  const rl = createInterface({ input: entrada });
  rl.on('line', async (linea) => {
    if (!linea.trim()) return;
    let m;
    try { m = JSON.parse(linea); } catch { return enviar({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }); }
    const responder = (result) => m.id !== undefined && enviar({ jsonrpc: '2.0', id: m.id, result });
    try {
      switch (m.method) {
        case 'initialize':
          return responder({ protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'acometida', version: VERSION } });
        case 'tools/list':
          return responder({ tools: herramientasDe(proyecto.fuentes) });
        case 'tools/call': {
          const r = await llamar(proyecto, m.params?.name, m.params?.arguments ?? {});
          return responder({ content: [{ type: 'text', text: r.texto }], isError: r.error });
        }
        case 'ping':
          return responder({});
        default:
          if (m.id !== undefined && !String(m.method).startsWith('notifications/')) enviar({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `método desconocido: ${m.method}` } });
      }
    } catch (e) {
      if (m.id !== undefined) enviar({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true } });
    }
  });
  return rl;
}
