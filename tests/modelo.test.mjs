import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { crearAlmacen } from '../src/almacen.mjs';
import { abrirBase } from '../src/base.mjs';
import { TodaviaNo } from '../src/errores.mjs';
import { TOPE_TEXTO, TopeDeGasto, leerConModelo } from '../src/modelo.mjs';
import { correrConector } from '../src/motor.mjs';

const LLAVE = 'llave-de-prueba';
const AHORA = new Date('2026-11-04T12:00:00Z');
const DOC = '<html><body><h1>Resolución de 3 de noviembre de 2026, sobre agua potable</h1>'
  + '<p>Expediente 2026/0042. Publicado el 3 de noviembre de 2026 en el boletín.</p><script>var x = 1;</script></body></html>';
const CAMPOS = { clave: 'número de expediente', organismo: 'quién la dicta' };

let dir, env, pedidos;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'acometida-modelo-'));
  env = { OPENROUTER_API_KEY: LLAVE, ACOMETIDA_DIR: dir };
  pedidos = [];
});

/** fetch simulado: guarda el pedido y responde lo que diga `respuesta`. */
function simulado(respuesta) {
  return async (url, init) => {
    pedidos.push({ url, init, cuerpo: JSON.parse(init.body) });
    if (respuesta instanceof Error) throw respuesta;
    if (typeof respuesta === 'number') return new Response('{"error":{"message":"caído"}}', { status: respuesta });
    return new Response(JSON.stringify(respuesta), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}
const respuestaCon = (registros, extra = {}) => ({
  choices: [{ message: { role: 'assistant', content: JSON.stringify({ registros }), ...extra } }],
  usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, cost: 0.004 },
});
const reg = (o = {}) => ({ titulo: 'Resolución de 3 de noviembre de 2026, sobre agua potable', fecha: '3 de noviembre de 2026', texto: 'Expediente 2026/0042.', datos: { clave: '2026/0042', organismo: '' }, ...o });
const leer = (args, fetchImpl, e = env) => leerConModelo({ texto: DOC, contentType: 'text/html', campos: CAMPOS, url: 'https://x.test/r/1', ...args }, { env: e, fuente: 'prueba', fetchImpl, ahora: AHORA });

test('sin llave: SinLlave, no llama y lo dice claro', async () => {
  await assert.rejects(leer({}, simulado(respuestaCon([reg()])), { ACOMETIDA_DIR: dir }), (e) => e.name === 'SinLlave' && /falta OPENROUTER_API_KEY/.test(e.message) && !(e instanceof TodaviaNo));
  assert.equal(pedidos.length, 0);
});

test('fecha que sí está en el documento: normalizada, con clave, leidoCon y url', async () => {
  const [r] = await leer({}, simulado(respuestaCon([reg()])));
  assert.equal(r.fecha, '2026-11-03');
  assert.equal(r.clave, '2026/0042');
  assert.equal(r.leidoCon, 'prueba+google/gemini-2.5-flash');
  assert.equal(r.url, 'https://x.test/r/1');
  assert.equal(r.datos.organismo, null);
  assert.deepEqual(r.datos.motivos, []);
});

test('fecha que no está en el documento: nula con motivo', async () => {
  const [r] = await leer({}, simulado(respuestaCon([reg({ fecha: '5 de noviembre de 2026' })])));
  assert.equal(r.fecha, null);
  assert.ok(r.datos.motivos.includes('fecha no está en el documento'));
});

test('fecha en otra forma de la escrita también vale; ilegible queda nula con motivo', async () => {
  const [a, b] = await leer({}, simulado(respuestaCon([reg({ fecha: '2026-11-03' }), reg({ fecha: 'pronto' })])));
  assert.equal(a.fecha, '2026-11-03');
  assert.equal(b.fecha, null);
  assert.match(b.datos.motivos.join(), /fecha ilegible/);
});

test('título o identificador que no están en el documento se marcan', async () => {
  const [r] = await leer({}, simulado(respuestaCon([reg({ titulo: 'Decreto sobre minería submarina', datos: { clave: '2026/9999', organismo: '' } })])));
  assert.ok(r.datos.motivos.includes('título no está en el documento'));
  assert.ok(r.datos.motivos.includes('clave no está en el documento'));
});

test('HTML: se manda limpio, sin scripts ni etiquetas, con el modelo y el esquema pedidos', async () => {
  await leer({}, simulado(respuestaCon([reg()])), { ...env, ACOMETIDA_MODELO: 'otro/modelo' });
  const { url, init, cuerpo } = pedidos[0];
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(init.headers.Authorization, `Bearer ${LLAVE}`);
  assert.equal(cuerpo.model, 'otro/modelo');
  assert.equal(cuerpo.response_format.type, 'json_schema');
  assert.deepEqual(cuerpo.response_format.json_schema.schema.properties.registros.items.properties.datos.required, ['clave', 'organismo']);
  const texto = cuerpo.messages[1].content.map((p) => p.text ?? '').join('\n');
  assert.match(texto, /Expediente 2026\/0042/);
  assert.doesNotMatch(texto, /<h1>|var x/);
});

test('PDF: va como archivo en base64 con el formato de OpenRouter y se valida contra el texto que devuelve', async () => {
  const pdf = Buffer.from('%PDF-1.7\n% boletín de prueba\n');
  const anotacion = { annotations: [{ type: 'file', file: { hash: 'h', name: 'b.pdf', content: [{ type: 'text', text: 'Boletín. Lunes 3 de noviembre de 2026. Resolución de 3 de noviembre de 2026, sobre agua potable. Expediente 2026/0042.' }] } }] };
  const [r] = await leerConModelo({ bytes: pdf, contentType: 'application/pdf', campos: CAMPOS, url: 'https://x.test/pdfs/b.pdf' },
    { env, fuente: 'prueba', fetchImpl: simulado(respuestaCon([reg()], anotacion)), ahora: AHORA });
  const { cuerpo } = pedidos[0];
  const archivo = cuerpo.messages[1].content.find((p) => p.type === 'file');
  assert.equal(archivo.file.filename, 'b.pdf');
  assert.ok(archivo.file.file_data.startsWith('data:application/pdf;base64,'));
  assert.deepEqual(Buffer.from(archivo.file.file_data.split(',')[1], 'base64'), pdf);
  assert.deepEqual(cuerpo.plugins, [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }]);
  assert.equal(r.fecha, '2026-11-03');
  assert.deepEqual(r.datos.motivos, []);
});

test('PDF sin texto devuelto para validar: la fecha queda nula con motivo, nunca se cree a ciegas', async () => {
  const [r] = await leerConModelo({ bytes: Buffer.from('%PDF-1.7\n'), campos: CAMPOS },
    { env: { ...env, ACOMETIDA_PDF_MOTOR: 'native' }, fuente: 'prueba', fetchImpl: simulado(respuestaCon([reg()])), ahora: AHORA });
  assert.equal(pedidos[0].cuerpo.plugins[0].pdf.engine, 'native');
  assert.equal(r.fecha, null);
  assert.ok(r.datos.motivos.includes('sin texto del documento para validar la fecha'));
});

test('texto más largo que el tope: se recorta, se dice y el registro sale incompleto', async () => {
  const largo = `Resolución de 3 de noviembre de 2026, sobre agua potable. Expediente 2026/0042. ${'relleno '.repeat(TOPE_TEXTO / 4)}`;
  const [r] = await leer({ texto: largo, contentType: 'text/plain' }, simulado(respuestaCon([reg()])));
  const enviado = pedidos[0].cuerpo.messages[1].content.at(-1).text;
  assert.ok(enviado.length <= TOPE_TEXTO + 20);
  assert.equal(r.datos.incompleto, true);
  assert.match(r.datos.motivos.join(), /recortado a 100000 de \d+ caracteres/);
});

test('el gasto real se acumula en gasto/<día>.json, sin la llave', async () => {
  await leer({}, simulado(respuestaCon([reg()])));
  await leer({}, simulado(respuestaCon([reg()])));
  const ruta = join(dir, 'gasto', '2026-11-04.json');
  const g = JSON.parse(readFileSync(ruta, 'utf8'));
  assert.equal(g.usd, 0.008);
  assert.equal(g.llamadas, 2);
  assert.doesNotMatch(readFileSync(ruta, 'utf8'), /\x73k-or/);
});

test('tope de gasto alcanzado: TopeDeGasto (todavía no) y no llama', async () => {
  mkdirSync(join(dir, 'gasto'), { recursive: true });
  writeFileSync(join(dir, 'gasto', '2026-11-04.json'), JSON.stringify({ dia: '2026-11-04', usd: 0.5, llamadas: 9, sin_costo: 0 }));
  await assert.rejects(leer({}, simulado(respuestaCon([reg()])), { ...env, ACOMETIDA_TOPE_USD_DIA: '0.5' }), (e) => e instanceof TopeDeGasto && e instanceof TodaviaNo);
  assert.equal(pedidos.length, 0);
  // otro día, gasto nuevo
  await leerConModelo({ texto: DOC, campos: CAMPOS }, { env: { ...env, ACOMETIDA_TOPE_USD_DIA: '0.5' }, fuente: 'prueba', fetchImpl: simulado(respuestaCon([reg()])), ahora: new Date('2026-11-05T01:00:00Z') });
  assert.equal(pedidos.length, 1);
});

test('503, 429 y red caída de OpenRouter son TodaviaNo; 401 es error del lector', async () => {
  for (const r of [503, 429, new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })]) {
    await assert.rejects(leer({}, simulado(r)), (e) => e instanceof TodaviaNo && !String(e.message).includes(LLAVE));
  }
  await assert.rejects(leer({}, simulado(401)), (e) => e.name === 'ErrorDelModelo' && !(e instanceof TodaviaNo));
  assert.equal(readdirSync(dir).includes('gasto'), false);
});

test('respuesta que no es JSON: error del lector, no registros inventados', async () => {
  const f = simulado({ choices: [{ message: { content: 'Lo siento, no puedo.' } }], usage: { cost: 0.001 } });
  await assert.rejects(leer({}, f), (e) => e.name === 'RespuestaInvalida');
});

test('en el motor: sin llave la corrida queda roja con el motivo; con tope, amarilla y el cursor no avanza', async () => {
  const conector = {
    fuente: 'pdfs', acceso: { ritmo: { porMinuto: 0 } },
    async *descubrir() { yield { id: '1', url: 'https://x.test/1.pdf', cursor: 1 }; },
    traer: async () => ({ url: 'https://x.test/1.pdf', contentType: 'text/html', bytes: Buffer.from(DOC) }),
    leer: (crudo, ctx) => ctx.leerConModelo({ bytes: crudo.bytes, contentType: crudo.contentType, campos: CAMPOS, url: crudo.url }),
  };
  const base = abrirBase(join(dir, 'a.db'));
  const deps = { base, almacen: crearAlmacen(join(dir, 'crudo')), env: { ACOMETIDA_DIR: dir }, fetchImpl: simulado(respuestaCon([reg()])) };
  const rojo = await correrConector(conector, deps);
  assert.equal(rojo.semaforo, 'rojo');
  assert.match(rojo.motivo, /falta OPENROUTER_API_KEY/);

  mkdirSync(join(dir, 'gasto'), { recursive: true });
  writeFileSync(join(dir, 'gasto', `${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify({ usd: 2, llamadas: 1, sin_costo: 0 }));
  const amarillo = await correrConector(conector, { ...deps, env });
  assert.equal(amarillo.semaforo, 'amarillo');
  assert.match(amarillo.motivo, /tope de gasto/);
  assert.equal(base.leerCursor('pdfs').valor, null);

  const verde = await correrConector(conector, { ...deps, env: { ...env, ACOMETIDA_TOPE_USD_DIA: '5' } });
  assert.equal(verde.semaforo, 'verde');
  assert.equal(base.leerCursor('pdfs').valor, 1);
  assert.equal(pedidos.length, 1);
});
