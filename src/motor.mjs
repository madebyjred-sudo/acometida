/**
 * El motor: descubrir → traer → guardar crudo → leer → versionar → guardar → cursor → corrida.
 * Igual para toda fuente. Reglas que hace cumplir:
 *  - «todavía no» y fallas de la fuente no se saltan: el cursor no pasa por encima de ellas.
 *  - El cursor avanza solo después de guardar y solo hasta el último pendiente seguido que salió bien.
 *  - Verde exige filas nuevas o una prueba de que la fuente no publicó (ctx.probarSinPublicaciones).
 *  - Una fecha que no se lee queda nula y se cuenta. Nunca se usa «ahora».
 *  - El lote se deduplica por clave antes de guardar.
 */
import { createHash } from 'node:crypto';
import { sha256 } from './almacen.mjs';
import { FalloFuente, TodaviaNo } from './errores.mjs';
import { fecha as normalizarFecha } from './fecha.mjs';
import { crearTraer } from './traer.mjs';
import { ayudas, errores } from './ctx.mjs';

/** JSON con claves ordenadas, para que la versión no dependa del orden. */
export function jsonEstable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(jsonEstable).join(',')}]`;
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${jsonEstable(v[k])}`).join(',')}}`;
}

export function deduparPorClave(filas) {
  const m = new Map();
  for (const f of filas) m.set(f.clave, f);
  return { filas: [...m.values()], repetidas: filas.length - m.size };
}

export function semaforoDeCorrida(c, { pruebaVacia, errorGuardar, avisos }) {
  const motivos = [...avisos];
  if (errorGuardar) return { semaforo: 'rojo', motivo: [`no se pudo guardar: ${errorGuardar}; el cursor no avanzó`, ...motivos].join('; ') };
  if (c.fallos_parser > 0) return { semaforo: 'rojo', motivo: [`${c.fallos_parser} documento(s) que el lector no pudo leer${c.primerFallo ? ` (${c.primerFallo})` : ''}`, ...motivos].join('; ') };
  let semaforo = 'verde';
  if (c.todavia_no > 0) { semaforo = 'amarillo'; motivos.push(`${c.todavia_no} todavía no (5xx, 429, timeout o red): vuelven en la próxima`); }
  if (c.fallos_fuente > 0) { semaforo = 'amarillo'; motivos.push(`${c.fallos_fuente} falla(s) de la fuente`); }
  if (c.sin_fecha > 0) motivos.push(`${c.sin_fecha} sin fecha legible: quedaron sin fecha, no se inventó`);
  if (c.nuevos + c.versiones === 0) {
    // leer la fuente y encontrar solo lo ya guardado también prueba que no hubo nada nuevo
    if (!pruebaVacia && c.leidos > 0) pruebaVacia = `se leyeron ${c.leidos} registro(s) y ya estaban guardados`;
    if (pruebaVacia && semaforo === 'verde') motivos.splice(0, 0, `sin publicaciones nuevas (probado: ${pruebaVacia})`);
    else if (!pruebaVacia) { semaforo = 'amarillo'; motivos.splice(0, 0, 'sin filas nuevas y sin prueba de que la fuente no publicó'); }
  } else motivos.splice(0, 0, `${c.nuevos} nuevas, ${c.versiones} versiones`);
  return { semaforo, motivo: motivos.join('; ') };
}

const diaDe = (d) => d.toISOString().slice(0, 10);

/**
 * @param {object} c conector: ficha + descubrir + leer (+ traer opcional)
 * @param {{ base: object, almacen: object, env?: object, ahora?: () => Date, log?: (m:string)=>void, fetchImpl?: typeof fetch, retardoBaseMs?: number, dormir?: Function }} deps
 */
export async function correrConector(c, deps) {
  const ahora = deps.ahora ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const env = deps.env ?? process.env;
  const inicio = ahora();
  const { traer, avisos } = crearTraer(c, { env, fetchImpl: deps.fetchImpl, retardoBaseMs: deps.retardoBaseMs, dormir: deps.dormir });
  let pruebaVacia = null;
  const ctx = {
    fuente: c.fuente, env, log, ahora: inicio, traer, ayudas: await ayudas(), errores,
    probarSinPublicaciones: (motivo) => { pruebaVacia = motivo || 'listado leído y vacío'; },
    leerConModelo: async (args) => (await import('./modelo.mjs')).leerConModelo(args, { env, fuente: c.fuente, fetchImpl: deps.fetchImpl, ahora: inicio }),
  };

  const cursor = deps.base.leerCursor(c.fuente);
  const cuenta = { descubiertos: 0, nuevos: 0, versiones: 0, todavia_no: 0, fallos_fuente: 0, fallos_parser: 0, sin_fecha: 0 };
  const filas = [];
  const detalle = [];
  let cursorNuevo = cursor?.valor ?? null;
  let prefijoOk = true;
  let primerFallo = null;

  try {
    for await (const p of c.descubrir(cursor?.valor ?? null, ctx)) {
      cuenta.descubiertos++;
      let ok = false;
      try {
        const crudo = await (c.traer ? c.traer(p, ctx) : traer(p.url, { esperado: c.acceso?.esperado }));
        const bytes = typeof crudo.bytes === 'string' ? Buffer.from(crudo.bytes, 'utf8') : crudo.bytes;
        if (!crudo.texto) crudo.texto = () => Buffer.from(bytes).toString('utf8');
        const hash = deps.almacen.guardar(c.fuente, diaDe(inicio), bytes);
        const traidoEn = ahora().toISOString();
        let registros;
        try { registros = await c.leer(crudo, ctx, p); } catch (e) {
          if (e instanceof TodaviaNo || e instanceof FalloFuente) throw e;
          cuenta.fallos_parser++; detalle.push(`lector ${p.id ?? p.url}: ${e.message}`); primerFallo ??= `${e.name === 'Error' ? '' : `${e.name}: `}${e.message}`; prefijoOk = false; continue;
        }
        for (const r of registros ?? []) {
          if (!r?.clave) { cuenta.fallos_parser++; detalle.push(`registro sin clave en ${p.id ?? p.url}`); continue; }
          const f = normalizarFecha(r.fecha, { hoy: inicio });
          if (!f) cuenta.sin_fecha++;
          const cuerpo = { titulo: r.titulo ?? null, texto: r.texto ?? null, fecha: f, url: r.url ?? crudo.url, datos: r.datos ?? null };
          filas.push({
            fuente: c.fuente, clave: String(r.clave),
            version: r.version ? String(r.version) : createHash('sha256').update(jsonEstable(cuerpo)).digest('hex').slice(0, 16),
            hash_crudo: hash, traido_en: traidoEn, leido_con: r.leidoCon ?? c.leidoCon ?? `${c.fuente}@1`, ...cuerpo,
          });
        }
        ok = true;
      } catch (e) {
        if (e instanceof TodaviaNo) { cuenta.todavia_no++; detalle.push(`todavía no ${p.id ?? p.url}: ${e.message}`); }
        else if (e instanceof FalloFuente) { cuenta.fallos_fuente++; detalle.push(`fuente ${p.id ?? p.url}: ${e.message}`); }
        else throw e;
      }
      if (ok && prefijoOk && p.cursor !== undefined) cursorNuevo = p.cursor;
      if (!ok) prefijoOk = false;
    }
  } catch (e) {
    // descubrir() cortó: es de la fuente, no del lector
    if (e instanceof TodaviaNo) cuenta.todavia_no++; else cuenta.fallos_fuente++;
    detalle.push(`corte al descubrir: ${e.message}`);
  }

  const { filas: unicas, repetidas } = deduparPorClave(filas);
  if (repetidas) detalle.push(`${repetidas} clave(s) repetidas en el lote, deduplicadas`);
  let errorGuardar = null;
  try {
    if (unicas.length) Object.assign(cuenta, deps.base.persistir(unicas));
  } catch (e) { errorGuardar = e.message; }

  const fin = ahora().toISOString();
  const { semaforo, motivo } = semaforoDeCorrida({ ...cuenta, leidos: filas.length, primerFallo }, { pruebaVacia, errorGuardar, avisos });
  if (!errorGuardar) {
    deps.base.guardarCursor({
      fuente: c.fuente, valor: cursorNuevo, avanzado_en: fin,
      ultima_fila_nueva_en: cuenta.nuevos + cuenta.versiones > 0 ? fin : cursor?.ultima_fila_nueva_en ?? null,
      estado: semaforo,
    });
  }
  const corrida = { fuente: c.fuente, inicio: inicio.toISOString(), fin, ...cuenta, semaforo,
    motivo: [motivo, ...detalle.slice(0, 10)].filter(Boolean).join(' · ').slice(0, 2000) };
  deps.base.escribirCorrida(corrida);
  log(`${c.fuente}: ${semaforo} · ${corrida.motivo}`);
  return corrida;
}

const vacio = (v) => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
const campo = (r, ruta) => ruta.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), r);

/** Canario de forma: trae el documento conocido y exige que el lector saque los campos. No guarda registros. */
export async function correrCanario(c, deps) {
  const ahora = (deps.ahora ?? (() => new Date()))();
  const env = deps.env ?? process.env;
  const { traer } = crearTraer(c, { env, fetchImpl: deps.fetchImpl, retardoBaseMs: deps.retardoBaseMs, dormir: deps.dormir });
  const ctx = { fuente: c.fuente, env, log: () => {}, ahora, traer, ayudas: await ayudas(), errores, probarSinPublicaciones: () => {},
    leerConModelo: async (args) => (await import('./modelo.mjs')).leerConModelo(args, { env, fuente: c.fuente, fetchImpl: deps.fetchImpl, ahora }) };
  let ok = false, motivo;
  if (!c.canario?.pendiente) motivo = 'sin canario en la ficha: forma sin medir';
  else {
    try {
      const p = c.canario.pendiente;
      const crudo = await (c.traer ? c.traer(p, ctx) : traer(p.url, { esperado: c.acceso?.esperado }));
      if (!crudo.texto) { const b = crudo.bytes; crudo.texto = () => (typeof b === 'string' ? b : Buffer.from(b).toString('utf8')); }
      const regs = (await c.leer(crudo, ctx, p)) ?? [];
      const campos = c.canario.campos ?? ['clave', 'titulo', 'fecha'];
      const min = c.canario.minRegistros ?? 1;
      const faltan = regs.length < min ? [`al menos ${min} registro(s)`] : campos.filter((k) => regs.some((r) => vacio(campo(r, k))));
      ok = faltan.length === 0;
      motivo = ok ? `forma bien (${regs.length} registro/s)` : `el lector ya no saca: ${faltan.join(', ')}`;
    } catch (e) { motivo = `${e.name}: ${e.message}`; }
  }
  deps.base?.escribirCanario(c.fuente, ahora.toISOString(), ok, motivo);
  return { fuente: c.fuente, ok, motivo };
}

export { sha256 };
