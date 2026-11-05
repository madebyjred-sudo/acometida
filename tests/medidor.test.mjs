import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { abrirBase } from '../src/base.mjs';
import { tomarCandado } from '../src/candado.mjs';
import { consultar } from '../src/consulta.mjs';
import { fecha } from '../src/fecha.mjs';
import { instalar, leerHorario, lineaCron } from '../src/instalar.mjs';
import { abrirProyecto } from '../src/proyecto.mjs';
import { herramientasDe, llamar } from '../src/servir.mjs';
import { calibrar, estadoFuente } from '../src/vigia.mjs';

const AHORA = new Date('2026-11-04T12:00:00Z');
const fuente = { fuente: 'boletin', nombre: 'Boletín de prueba', cuandoUsar: 'avisos del boletín', cuandoNo: 'leyes vigentes', frescura: { cadaHoras: 24 } };

function sembrar(db, { dias = 20, corrida = 'verde', canario = true, finCorrida = '2026-11-04T06:00:00Z' } = {}) {
  const filas = [];
  for (let i = 0; i < dias; i++) {
    const f = new Date(Date.UTC(2026, 10, 3 - i * 2)).toISOString().slice(0, 10);
    filas.push({ fuente: 'boletin', clave: `B-${i}`, version: 'v1', hash_crudo: 'h', url: `https://ejemplo.test/b/${i}`, titulo: `Aviso ${i}`, texto: i === 0 ? 'Licitación de tubería de agua potable' : `Texto ${i}`, fecha: f, traido_en: finCorrida, leido_con: 'b@1' });
  }
  db.persistir(filas);
  db.escribirCorrida({ fuente: 'boletin', inicio: finCorrida, fin: finCorrida, descubiertos: dias, nuevos: dias, versiones: 0, todavia_no: 0, fallos_fuente: 0, fallos_parser: 0, sin_fecha: 0, semaforo: corrida, motivo: 'x' });
  if (canario) db.escribirCanario('boletin', finCorrida, true, 'forma bien');
}

test('fecha: formas comunes, y nulo en vez de inventar', () => {
  const hoy = new Date('2026-11-04T00:00:00Z');
  assert.equal(fecha('2026-11-03', { hoy }), '2026-11-03');
  assert.equal(fecha('20261103', { hoy }), '2026-11-03');
  assert.equal(fecha('03/11/2026', { hoy }), '2026-11-03');
  assert.equal(fecha('3 de noviembre de 2026', { hoy }), '2026-11-03');
  assert.equal(fecha('Tue, 03 Nov 2026 10:00:00 GMT', { hoy }), '2026-11-03');
  assert.equal(fecha('November 3, 2026', { hoy }), '2026-11-03');
  assert.equal(fecha('31/02/2026', { hoy }), null);
  assert.equal(fecha('2323-01-01', { hoy }), null);
  assert.equal(fecha('ayer', { hoy }), null);
  assert.equal(fecha(undefined, { hoy }), null);
});

test('calibrar: sin 14 fechas no hay umbral; con historia, queda sobre el mayor hueco', () => {
  assert.equal(calibrar(['2026-11-01', '2026-11-02']).umbralDias, null);
  const fechas = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i * 2)).toISOString().slice(0, 10));
  fechas.push('2026-11-15'); // un hueco de 7 días
  const c = calibrar(fechas);
  assert.equal(c.mayorHueco, 7);
  assert.equal(c.umbralDias, 11);
});

test('medidor: al día es verde; sin canario es «sin medir»; rojo si el canario falla', () => {
  const db = abrirBase(':memory:');
  sembrar(db);
  assert.equal(estadoFuente(db, fuente, AHORA).semaforo, 'verde');
  const db2 = abrirBase(':memory:');
  sembrar(db2, { canario: false });
  assert.equal(estadoFuente(db2, fuente, AHORA).semaforo, 'sin medir');
  db.escribirCanario('boletin', '2026-11-04T07:00:00Z', false, 'el lector ya no saca: titulo');
  const e = estadoFuente(db, fuente, AHORA);
  assert.equal(e.semaforo, 'rojo');
  assert.match(e.lineas.join(' '), /titulo/);
});

test('medidor: poca historia es «sin medir», nunca verde', () => {
  const db = abrirBase(':memory:');
  sembrar(db, { dias: 5 });
  const e = estadoFuente(db, fuente, AHORA);
  assert.equal(e.semaforo, 'sin medir');
  assert.match(e.lineas.join(' '), /hacen falta 14/);
});

test('medidor: no corre hace días es rojo, y datos al es la última corrida verde', () => {
  const db = abrirBase(':memory:');
  sembrar(db, { finCorrida: '2026-10-30T06:00:00Z' });
  const e = estadoFuente(db, fuente, AHORA);
  assert.equal(e.semaforo, 'rojo');
  assert.equal(e.datosAl, '2026-10-30T06:00:00Z');
});

test('consulta: cita con origen, datos al y cobertura; el vacío dice «no consta»', async () => {
  const db = abrirBase(':memory:');
  sembrar(db);
  const r = await consultar(db, fuente, { consulta: 'tuberia agua' }, { ahora: AHORA });
  assert.equal(r.origen, 'copia_guardada');
  assert.match(r.texto, /datos al 2026-11-04 06:00 UTC/);
  assert.match(r.texto, /cobertura: 20 registros con fecha del 2026-09-26 al 2026-11-03/);
  assert.match(r.texto, /https:\/\/ejemplo\.test\/b\/0/);
  assert.doesNotMatch(r.texto, /AVISO/);
  const v = await consultar(db, fuente, { consulta: 'electricidad' }, { ahora: AHORA });
  assert.equal(v.vacio, true);
  assert.match(v.texto, /NO CONSTA en lo cargado: «electricidad»/);
});

test('consulta: copia atrasada lo avisa; con enVivo, va en vivo y lo dice', async () => {
  const db = abrirBase(':memory:');
  sembrar(db, { finCorrida: '2026-10-30T06:00:00Z' });
  const r = await consultar(db, fuente, { consulta: 'tuberia' }, { ahora: AHORA });
  assert.match(r.texto, /AVISO: la copia no está al día/);
  const conVivo = { ...fuente, enVivo: async () => [{ clave: 'B-99', titulo: 'Aviso de hoy', fecha: '2026-11-04', url: 'https://ejemplo.test/b/99', texto: 'tubería' }] };
  const v = await consultar(db, conVivo, { consulta: 'tuberia' }, { ahora: AHORA, ctx: {} });
  assert.equal(v.origen, 'consulta_en_vivo');
  assert.match(v.texto, /consulta en vivo, hecha el 2026-11-04 12:00 UTC/);
});

test('MCP: una herramienta por fuente desde la ficha, más el medidor', async () => {
  const hs = herramientasDe([fuente]);
  assert.deepEqual(hs.map((h) => h.name), ['consultar_boletin', 'estado_de_las_fuentes']);
  assert.match(hs[0].description, /No la uses para: leyes vigentes/);
  const db = abrirBase(':memory:');
  sembrar(db);
  const r = await llamar({ base: db, fuentes: [fuente], env: {} }, 'estado_de_las_fuentes', {}, AHORA);
  assert.match(r.texto, /VERDE · datos al 2026-11-04/);
});

test('MCP por stdio: initialize, tools/list y tools/call de punta a punta', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acometida-mcp-'));
  mkdirSync(join(dir, 'fuentes'));
  writeFileSync(join(dir, 'fuentes', 'boletin.mjs'), `export default { ...${JSON.stringify(fuente)}, async *descubrir() {}, leer() { return []; } };`);
  const p = await abrirProyecto(dir);
  sembrar(p.base);
  p.base.cerrar();
  const hijo = spawn(process.execPath, ['bin/acometida.mjs', 'servir', '--dir', dir], { cwd: new URL('..', import.meta.url).pathname });
  const respuestas = [];
  let buf = '';
  hijo.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { respuestas.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const enviar = (m) => hijo.stdin.write(`${JSON.stringify(m)}\n`);
  enviar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  enviar({ jsonrpc: '2.0', method: 'notifications/initialized' });
  enviar({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  enviar({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'consultar_boletin', arguments: { consulta: 'agua potable' } } });
  for (let i = 0; i < 100 && respuestas.length < 3; i++) await new Promise((r) => setTimeout(r, 30));
  hijo.kill();
  assert.equal(respuestas[0].result.serverInfo.name, 'acometida');
  assert.equal(respuestas[1].result.tools.length, 2);
  assert.match(respuestas[2].result.content[0].text, /Licitación de tubería de agua potable/);
});

test('candado: la segunda corrida de la misma fuente no entra; uno huérfano se toma', () => {
  const dir = mkdtempSync(join(tmpdir(), 'acometida-candado-'));
  const a = tomarCandado(dir, 'boe');
  assert.ok(a);
  assert.equal(tomarCandado(dir, 'boe'), null);
  a.soltar();
  mkdirSync(join(dir, '.candados'), { recursive: true });
  writeFileSync(join(dir, '.candados', 'boe.lock'), '999999');
  assert.ok(tomarCandado(dir, 'boe'));
});

test('instalar: horario, línea de cron y plist en seco', () => {
  assert.deepEqual(leerHorario('06:30'), { h: 6, m: 30 });
  assert.deepEqual(leerHorario(undefined, '6h'), { cadaSeg: 21600 });
  assert.throws(() => leerHorario('25:00'));
  assert.match(lineaCron({ carpeta: '/x', horario: { h: 6, m: 0 } }), /^0 6 \* \* \* .* correr --dir \/x .*# acometida \/x$/);
  assert.match(instalar({ carpeta: '/tmp/x', hora: '06:00', seco: true, plataforma: 'darwin' }).detalle, /StartCalendarInterval/);
  assert.match(instalar({ carpeta: '/tmp/x', cada: '30m', seco: true, plataforma: 'win32' }).detalle, /\/SC MINUTE \/MO 30/);
});
