#!/usr/bin/env node
// Banco a nivel de herramienta: llama al MCP real por stdio con los argumentos de cada pregunta y revisa la salida.
// Uso: node scripts/banco-herramienta.mjs <carpeta-del-proyecto> <banco.json>
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [carpeta, archivo] = process.argv.slice(2);
const banco = JSON.parse(readFileSync(archivo, 'utf8')).filter((q) => q.args);
const hijo = spawn(process.execPath, ['--no-warnings', resolve(new URL('../bin/acometida.mjs', import.meta.url).pathname), 'servir', '--dir', resolve(carpeta)]);
const pendientes = new Map();
let buf = '';
hijo.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pendientes.get(m.id)?.(m); }
});
let id = 0;
const pedir = (method, params) => new Promise((r) => { pendientes.set(++id, r); hijo.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
await pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'banco', version: '1' } });
let ok = 0;
for (const q of banco) {
  const r = await pedir('tools/call', { name: `consultar_${q.fuente}`, arguments: q.args });
  const t = r.result.content[0].text;
  const lineas = t.split('\n').filter((l) => l.startsWith('- '));
  const c = {
    origen: /copia guardada|consulta en vivo/.test(t),
    datosAl: /datos al 20\d\d-\d\d-\d\d|consulta en vivo, hecha el 20\d\d/.test(t),
    cobertura: /cobertura:|consulta en vivo/.test(t),
    filasConFechaYEnlace: lineas.length > 0 && lineas.every((l) => / · (20\d\d-\d\d-\d\d|sin fecha) · https?:\/\//.test(l)),
    noConsta: /NO CONSTA en lo cargado/.test(t),
    esperado: q.debeContener ? new RegExp(q.debeContener, 'i').test(t) : true,
  };
  const bien = q.fuera
    ? c.origen && (c.noConsta || (/consulta en vivo/.test(t) && c.filasConFechaYEnlace))
    : c.origen && c.datosAl && c.cobertura && c.filasConFechaYEnlace && c.esperado;
  if (bien) ok++;
  console.log(`${bien ? 'ok ' : 'NO '} ${q.pregunta}\n     ${t.split('\n')[0].slice(0, 150)}\n     ${lineas[0]?.slice(0, 150) ?? t.split('\n').find((l) => l.startsWith('NO CONSTA'))?.slice(0, 150) ?? ''}`);
  if (!bien) console.log('     ', JSON.stringify(c));
}
console.log(`${ok} de ${banco.length}`);
hijo.kill();
