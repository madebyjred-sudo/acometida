import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import boe from '../casos/boe.mjs';
import fr from '../casos/federal_register.mjs';
import { ayudas, errores } from '../src/ctx.mjs';

const fixture = (n) => readFileSync(new URL(`./fixtures/casos/${n}`, import.meta.url), 'utf8');
const crudo = (texto, url = 'https://x.test') => ({ texto: () => texto, url });
async function ctxDe(ahora = new Date('2026-11-04T12:00:00Z')) {
  const pruebas = [];
  return { ahora, ayudas: await ayudas(), errores, pruebas, probarSinPublicaciones: (m) => pruebas.push(m) };
}

test('BOE: el sumario real del 3-nov-2026 da registros con clave, título, fecha y enlace', async () => {
  const ctx = await ctxDe();
  const regs = boe.leer(crudo(fixture('boe-20261103.json')), ctx, { meta: { dia: '2026-11-03', pasado: true } });
  assert.ok(regs.length > 50, `solo ${regs.length}`);
  assert.equal(new Set(regs.map((r) => r.clave)).size, regs.length, 'claves únicas');
  for (const r of regs) {
    assert.match(r.clave, /^BOE-[A-Z]-2026-\d+$/);
    assert.ok(r.titulo && r.url);
    assert.equal(r.fecha, '20261103');
  }
});

test('BOE: un día pasado sin sumario prueba vacío; hoy sin sumario es todavía no', async () => {
  const ctx = await ctxDe();
  const pasado = { meta: { dia: '2026-11-01', pasado: true }, url: 'u' };
  const no404 = { traer: async () => { const e = new errores.FalloFuente('HTTP 404', 404); throw e; }, errores };
  const c = await boe.traer(pasado, { ...ctx, ...no404 });
  assert.deepEqual(boe.leer(c, ctx, pasado), []);
  assert.match(ctx.pruebas[0], /no hubo sumario el 2026-11-01/);
  await assert.rejects(boe.traer({ meta: { dia: '2026-11-04', pasado: false }, url: 'u' }, { ...ctx, ...no404 }), errores.TodaviaNo);
});

test('BOE: descubrir rellena 30 días la primera vez y hoy no mueve el cursor', async () => {
  const ctx = await ctxDe();
  const ps = [];
  for await (const p of boe.descubrir(null, ctx)) ps.push(p);
  assert.equal(ps.length, 31);
  assert.equal(ps.at(-1).cursor, undefined);
  assert.deepEqual(ps.at(-2).cursor, { dia: '2026-11-03' });
  const sig = [];
  for await (const p of boe.descubrir({ dia: '2026-11-03' }, ctx)) sig.push(p.id);
  assert.deepEqual(sig, ['2026-11-04']);
});

test('Federal Register: el día real del 3-nov-2026 y el día sin documentos', async () => {
  const ctx = await ctxDe();
  const regs = fr.leer(crudo(fixture('federal_register-2026-11-03.json')), ctx, { meta: { dia: '2026-11-03', pasado: true } });
  assert.equal(regs.length, 81);
  assert.ok(regs.every((r) => r.clave && r.titulo && r.fecha === '2026-11-03' && r.url.startsWith('https://www.federalregister.gov/')));
  assert.deepEqual(fr.leer(crudo('{"count":0}'), ctx, { meta: { dia: '2026-11-01', pasado: true } }), []);
  assert.match(ctx.pruebas[0], /count 0/);
  assert.throws(() => fr.leer(crudo('{"count":0}'), ctx, { meta: { dia: '2026-11-04', pasado: false } }), errores.TodaviaNo);
  assert.throws(() => fr.leer(crudo('{"count":1500,"total_pages":2}'), ctx, { meta: { dia: '2026-11-02', pasado: true } }), /paginar/);
});

test('legislation.gov.uk: la página real del feed da 20 registros con fecha de publicación', async () => {
  const uk = (await import('../casos/legislation_uk.mjs')).default;
  const ctx = await ctxDe();
  const regs = uk.leer(crudo(fixture('legislation_uk-p1.xml')), ctx);
  assert.equal(regs.length, 20);
  for (const r of regs) {
    assert.match(r.clave, /^[a-z]+\/\d{4}\/\d+/);
    assert.ok(r.titulo && r.url.includes('legislation.gov.uk'));
    assert.match(r.fecha, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('Ley Chile: la ventana real de 100 leyes, con fecha DD-MM-AAAA normalizable', async () => {
  const lc = (await import('../casos/ley_chile.mjs')).default;
  const { fecha } = await ayudas();
  const regs = lc.leer(crudo(fixture('ley_chile-ultimas-100.json')));
  assert.equal(regs.length, 100);
  assert.equal(new Set(regs.map((r) => r.clave)).size, 100);
  assert.ok(regs.every((r) => fecha(r.fecha) && r.titulo.startsWith('Ley ')));
});
