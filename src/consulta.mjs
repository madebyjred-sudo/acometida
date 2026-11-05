/**
 * Lo que el chat recibe. Lee primero la copia guardada; va en vivo solo si la fuente lo permite y la copia
 * no alcanza. Toda salida dice su origen, «datos al» y la cobertura. Un vacío dice «no consta en lo cargado».
 */
import { estadoFuente } from './vigia.mjs';

/** Consulta FTS segura: cada palabra entre comillas, unidas por AND. */
export function aFts(consulta) {
  const ws = String(consulta ?? '').normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
  return ws.map((w) => `"${w}"`).join(' ');
}

export function buscar(base, fuente, { consulta, desde, hasta, clave, limite = 8 } = {}) {
  const where = ['r.fuente = ?', 'r.vigente = 1'];
  const params = [fuente];
  if (clave) { where.push('r.clave = ?'); params.push(String(clave)); }
  if (desde) { where.push('r.fecha >= ?'); params.push(desde); }
  if (hasta) { where.push('r.fecha <= ?'); params.push(hasta); }
  const fts = aFts(consulta);
  const sql = fts
    ? `select r.*, snippet(busqueda, 1, '', '', ' … ', 40) extracto from busqueda join registro r on r.id = busqueda.rowid
       where busqueda match ? and ${where.join(' and ')} order by rank limit ?`
    : `select r.*, substr(r.texto, 1, 300) extracto from registro r where ${where.join(' and ')} order by r.fecha desc, r.id desc limit ?`;
  return base.db.prepare(sql).all(...(fts ? [fts, ...params] : params), Math.min(Number(limite) || 8, 25));
}

const corto = (iso) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : null);

function lineaCobertura(cob) {
  if (!cob?.n) return 'cobertura: la copia está vacía';
  return `cobertura: ${cob.n} registros con fecha del ${cob.desde ?? 's/f'} al ${cob.hasta ?? 's/f'}${cob.sin_fecha ? ` y ${cob.sin_fecha} sin fecha` : ''}`;
}

function lineasRegistros(filas) {
  return filas.map((f) => `- ${f.titulo ?? f.clave} · ${f.fecha ?? 'sin fecha'} · ${f.url ?? 'sin enlace'}${f.extracto ? `\n  ${String(f.extracto).replace(/\s+/g, ' ').slice(0, 500)}` : ''}`);
}

/**
 * @param {object} base @param {object} c conector @param {object} args { consulta, desde, hasta, clave }
 * @param {{ ahora?: Date, traer?: Function, ctx?: object }} [o]
 */
export async function consultar(base, c, args, o = {}) {
  const ahora = o.ahora ?? new Date();
  const est = estadoFuente(base, c, ahora);
  const atrasada = est.semaforo === 'rojo' || est.semaforo === 'amarillo';
  const filas = buscar(base, c.fuente, args);
  const nombre = c.nombre ?? c.fuente;
  const reglas = 'Al citar: di la fuente, la fecha de cada dato y si viene de la copia guardada o de la consulta en vivo. No digas que algo no existe: di que no consta en lo cargado.';

  const enVivo = typeof c.enVivo === 'function' && o.ctx && (filas.length === 0 || atrasada) && (args.consulta || args.clave);
  if (enVivo) {
    try {
      const vivas = (await c.enVivo(args, o.ctx)) ?? [];
      if (vivas.length) {
        return {
          origen: 'consulta_en_vivo', vacio: false,
          texto: [`FUENTE: ${nombre} · consulta en vivo, hecha el ${corto(ahora.toISOString())}`,
            ...lineasRegistros(vivas.map((r) => ({ ...r, extracto: r.texto }))), reglas].join('\n'),
        };
      }
    } catch (e) {
      o.ctx.log?.(`en vivo falló: ${e.message}`);
    }
  }

  const cab = `FUENTE: ${nombre} · copia guardada · datos al ${corto(est.datosAl) ?? 'sin corrida verde'} · ${lineaCobertura(est.cobertura)}`;
  const aviso = atrasada ? `AVISO: la copia no está al día (${est.lineas.join('; ')}). Dilo al responder.` : null;
  if (!filas.length) {
    const que = [args.consulta && `«${args.consulta}»`, args.clave && `clave ${args.clave}`, args.desde && `desde ${args.desde}`, args.hasta && `hasta ${args.hasta}`].filter(Boolean).join(', ') || 'la consulta';
    return { origen: 'copia_guardada', vacio: true,
      texto: [cab, aviso, `NO CONSTA en lo cargado: ${que}. No significa que no exista fuera de la cobertura.`, reglas].filter(Boolean).join('\n') };
  }
  return { origen: 'copia_guardada', vacio: false, texto: [cab, aviso, ...lineasRegistros(filas), reglas].filter(Boolean).join('\n') };
}
