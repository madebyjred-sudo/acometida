#!/usr/bin/env node
// Banco de preguntas: hace cada pregunta a Claude Code con el MCP de acometida y revisa que la respuesta
// cite enlace, fecha y origen. Uso: node scripts/banco.mjs <carpeta-del-proyecto> <banco.json> [salida.json]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [carpeta, archivo, salida = 'banco-resultado.json'] = process.argv.slice(2);
const bin = resolve(new URL('../bin/acometida.mjs', import.meta.url).pathname);
const config = JSON.stringify({ mcpServers: { acometida: { command: process.execPath, args: ['--no-warnings', bin, 'servir', '--dir', resolve(carpeta)] } } });
const banco = JSON.parse(readFileSync(archivo, 'utf8'));
const out = [];
for (const q of banco) {
  const t0 = Date.now();
  let r;
  try {
    r = execFileSync('claude', ['-p', q.pregunta, '--mcp-config', config, '--strict-mcp-config', '--allowedTools', 'mcp__acometida', '--model', process.env.BANCO_MODELO ?? 'sonnet'],
      { encoding: 'utf8', timeout: 240_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { r = `ERROR: ${e.message}`; }
  const chequeo = {
    enlace: /https?:\/\/\S+/.test(r),
    fecha: /\b20\d\d-\d\d-\d\d\b|\b\d{1,2} de [a-záéíóú]+ de 20\d\d\b|[A-Z][a-z]+ \d{1,2}, 20\d\d/i.test(r),
    origen: /copia guardada|datos al|en vivo|consulta en vivo|saved copy|live/i.test(r),
    noConsta: /no consta|not in the loaded|no está en lo cargado/i.test(r),
  };
  const ok = q.fuera ? (chequeo.noConsta || (/en vivo|live/i.test(r) && chequeo.enlace)) : chequeo.enlace && chequeo.fecha && chequeo.origen;
  out.push({ ...q, ok, chequeo, segundos: Math.round((Date.now() - t0) / 1000), respuesta: r.trim() });
  console.log(`${ok ? 'ok ' : 'NO '} ${q.pregunta.slice(0, 80)} (${out.at(-1).segundos} s)`);
}
writeFileSync(salida, JSON.stringify(out, null, 2));
console.log(`${out.filter((x) => x.ok).length} de ${out.length}`);
