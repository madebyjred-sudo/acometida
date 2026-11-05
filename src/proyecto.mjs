/** Un proyecto es una carpeta: fuentes/*.mjs, acometida.db y crudo/. */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crearAlmacen } from './almacen.mjs';
import { abrirBase } from './base.mjs';

export function carpetaDe(dir, env = process.env) {
  return resolve(dir ?? env.ACOMETIDA_DIR ?? 'acometida');
}

export function validarConector(c, archivo) {
  const faltas = [];
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(c?.fuente ?? '')) faltas.push('`fuente` en minúsculas, letras, números o _');
  if (typeof c?.descubrir !== 'function') faltas.push('`descubrir(cursor, ctx)`');
  if (typeof c?.leer !== 'function') faltas.push('`leer(crudo, ctx)`');
  if (faltas.length) throw new Error(`${archivo}: le falta ${faltas.join(', ')}`);
  return c;
}

export async function cargarFuentes(carpeta) {
  const dir = join(carpeta, 'fuentes');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()) {
    const m = await import(pathToFileURL(join(dir, f)).href);
    out.push(validarConector(m.default, f));
  }
  return out;
}

export async function abrirProyecto(dir, env = process.env) {
  const carpeta = carpetaDe(dir, env);
  return {
    carpeta,
    base: abrirBase(join(carpeta, 'acometida.db')),
    almacen: crearAlmacen(join(carpeta, 'crudo')),
    fuentes: await cargarFuentes(carpeta),
  };
}
