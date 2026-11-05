#!/usr/bin/env node
/**
 * Mide el lector con modelo contra una lectura a mano.
 *   node scripts/medir-lector.mjs [carpeta]      (por defecto tests/fixtures/lector)
 * La carpeta trae los PDFs y un esperado.json: { fuente, instrucciones, campos, documentos: [{ archivo, url, esperado: { campo: valor } }] }.
 * Si falta un archivo, lo baja de `url` sin guardarlo. Da el porcentaje por campo; el criterio de los planos es ≥90%.
 * Llama al modelo de verdad: gasta de la llave del usuario y respeta ACOMETIDA_TOPE_USD_DIA.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { leerConModelo, MODELO_POR_DEFECTO, normalizar } from '../src/modelo.mjs';

const carpeta = resolve(process.argv[2] ?? 'tests/fixtures/lector');
const plan = JSON.parse(readFileSync(join(carpeta, 'esperado.json'), 'utf8'));
const env = process.env;
const modelo = env.ACOMETIDA_MODELO || MODELO_POR_DEFECTO;

if (!env.OPENROUTER_API_KEY) {
  console.log(`sin medir: falta OPENROUTER_API_KEY (${plan.documentos.length} documentos de ${plan.fuente} listos en ${carpeta})`);
  process.exit(2);
}

const igual = {
  fecha: (a, b) => a === b,
  identificador: (a, b) => normalizar(a).replace(/ /g, '') === normalizar(b).replace(/ /g, ''),
};
const comparar = (campo, leido, esperado) => leido != null && (igual[campo] ?? ((a, b) => normalizar(a) === normalizar(b)))(String(leido), String(esperado));

const campos = Object.keys(plan.documentos[0].esperado);
const aciertos = Object.fromEntries(campos.map((c) => [c, 0]));
let fechasRechazadas = 0, errores = 0;

for (const d of plan.documentos) {
  const ruta = join(carpeta, d.archivo);
  let bytes;
  if (existsSync(ruta)) bytes = readFileSync(ruta);
  else {
    const r = await fetch(d.url, { headers: { Accept: 'application/pdf' } });
    if (!r.ok) { console.log(`${d.archivo}\tno se pudo bajar: HTTP ${r.status}`); errores++; continue; }
    bytes = Buffer.from(await r.arrayBuffer());
  }
  let regs;
  try {
    regs = await leerConModelo({ bytes, contentType: 'application/pdf', campos: plan.campos, instrucciones: plan.instrucciones, url: d.url }, { env, fuente: plan.fuente });
  } catch (e) {
    console.log(`${d.archivo}\t${e.name}: ${e.message}`);
    errores++;
    if (e.name === 'SinLlave' || e.name === 'TopeDeGasto') break;
    continue;
  }
  const r = regs[0] ?? {};
  const leido = { ...r.datos, titulo: r.titulo, fecha: r.fecha };
  if ((r.datos?.motivos ?? []).includes('fecha no está en el documento')) fechasRechazadas++;
  const fila = campos.map((c) => {
    const ok = comparar(c, leido[c], d.esperado[c]);
    if (ok) aciertos[c]++;
    return ok ? `${c} ok` : `${c} ✗ «${leido[c] ?? 'nulo'}»`;
  });
  console.log(`${d.archivo}\t${regs.length} reg\t${fila.join('\t')}${r.datos?.motivos?.length ? `\tmotivos: ${r.datos.motivos.join('; ')}` : ''}`);
}

const n = plan.documentos.length;
console.log(`\n${plan.fuente} · ${modelo} · ${n} documentos · ${errores} con error · ${fechasRechazadas} fecha(s) rechazadas por no estar en el texto`);
let cumple = errores === 0;
for (const c of campos) {
  const p = (100 * aciertos[c]) / n;
  if (p < 90) cumple = false;
  console.log(`${c.padEnd(14)} ${aciertos[c]}/${n}  ${p.toFixed(1)}%`);
}
console.log(cumple ? 'criterio ≥90% por campo: cumple' : 'criterio ≥90% por campo: no cumple');
process.exit(cumple ? 0 : 1);
