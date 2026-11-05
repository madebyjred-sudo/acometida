import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { crearAlmacen } from '../src/almacen.mjs';
import { abrirBase } from '../src/base.mjs';
import { correrCanario, correrConector } from '../src/motor.mjs';
import { buscar } from '../src/consulta.mjs';

// Un boletín de juguete: /lista.json con ítems y /item/<n>.html con el texto.
let estado;
const reiniciar = () => {
  estado = {
    items: [
      { id: '1', titulo: 'Aviso uno', fecha: '2026-10-01', cuerpo: 'Primer aviso sobre agua potable' },
      { id: '2', titulo: 'Aviso dos', fecha: '2026-10-02', cuerpo: 'Segundo aviso sobre drenaje' },
      { id: '3', titulo: 'Aviso tres', fecha: '2026-10-03', cuerpo: 'Tercer aviso sobre gas natural' },
    ],
    falla: {}, // id → código HTTP
    vacio: false,
  };
};
const servidor = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/lista.json') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ sinPublicaciones: estado.vacio, items: estado.vacio ? [] : estado.items.map(({ id, fecha }) => ({ id, fecha })) }));
  }
  const m = /^\/item\/(\w+)\.(html|pdf)$/.exec(u.pathname);
  const it = m && estado.items.find((i) => i.id === m[1]);
  if (!it) { res.statusCode = 404; return res.end('no'); }
  if (estado.falla[it.id]) { res.statusCode = estado.falla[it.id]; return res.end('<html>error</html>'); }
  res.setHeader('content-type', 'text/html');
  res.end(`<article data-id="${it.id}"><h1>${it.titulo}</h1><time>${it.fecha}</time><p>${it.cuerpo}</p></article>`);
});
let base;
before(async () => { await new Promise((r) => servidor.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${servidor.address().port}`; });
after(() => servidor.close());

function juguete(extra = {}) {
  return {
    fuente: 'juguete', nombre: 'Boletín de juguete', leidoCon: 'juguete@1',
    acceso: { salida: 'directa', ritmo: { porMinuto: 0 }, intentos: 2, timeoutMs: 2000 },
    canario: { pendiente: { id: '1', url: `${base}/item/1.html` }, campos: ['clave', 'titulo', 'fecha'] },
    async *descubrir(cursor, ctx) {
      const desde = cursor?.marca ?? '';
      const l = JSON.parse((await ctx.traer(`${base}/lista.json`, { esperado: 'json' })).texto());
      if (l.sinPublicaciones) ctx.probarSinPublicaciones('la lista dice que no hay publicaciones');
      for (const i of l.items.filter((i) => i.fecha > desde)) yield { id: i.id, url: `${base}/item/${i.id}.html`, cursor: { marca: i.fecha } };
    },
    leer(crudo) {
      const h = crudo.texto();
      const id = /data-id="(\w+)"/.exec(h)?.[1];
      if (!id) throw new Error('forma desconocida');
      return [{ clave: `J-${id}`, titulo: /<h1>(.*?)<\/h1>/.exec(h)?.[1], fecha: /<time>(.*?)<\/time>/.exec(h)?.[1], texto: /<p>(.*?)<\/p>/.exec(h)?.[1], url: crudo.url }];
    },
    ...extra,
  };
}

let db, deps;
beforeEach(() => {
  reiniciar();
  const dir = mkdtempSync(join(tmpdir(), 'acometida-'));
  db = abrirBase(join(dir, 'a.db'));
  deps = { base: db, almacen: crearAlmacen(join(dir, 'crudo')), retardoBaseMs: 1, env: {} };
});

test('corrida normal: tres nuevas, verde, cursor al último', async () => {
  const c = await correrConector(juguete(), deps);
  assert.equal(c.semaforo, 'verde');
  assert.equal(c.nuevos, 3);
  assert.deepEqual(db.leerCursor('juguete').valor, { marca: '2026-10-03' });
});

test('un 5xx no salta el cursor y la próxima corrida retoma sin duplicar', async () => {
  estado.falla['2'] = 503;
  const c1 = await correrConector(juguete(), deps);
  assert.equal(c1.semaforo, 'amarillo');
  assert.equal(c1.todavia_no, 1);
  assert.deepEqual(db.leerCursor('juguete').valor, { marca: '2026-10-01' });
  delete estado.falla['2'];
  const c2 = await correrConector(juguete(), deps);
  assert.equal(c2.nuevos, 1, 'el 3 ya estaba guardado; solo entra el 2');
  assert.equal(db.cobertura('juguete').n, 3);
  assert.deepEqual(db.leerCursor('juguete').valor, { marca: '2026-10-03' });
});

test('un 4xx es falla de la fuente y tampoco se salta', async () => {
  estado.falla['1'] = 403;
  const c = await correrConector(juguete(), deps);
  assert.equal(c.fallos_fuente, 1);
  assert.equal(db.leerCursor('juguete').valor, null);
});

test('HTML donde iba un archivo es falla de la fuente', async () => {
  const c = await correrConector(juguete({ acceso: { ...juguete().acceso, esperado: 'archivo' } }), deps);
  assert.equal(c.fallos_fuente, 3);
  assert.equal(c.nuevos, 0);
});

test('clave repetida en el lote no tumba la corrida', async () => {
  const j = juguete();
  const c = await correrConector({ ...j, leer: (crudo) => [...j.leer(crudo), ...j.leer(crudo)] }, deps);
  assert.equal(c.semaforo, 'verde');
  assert.equal(c.nuevos, 3);
  assert.match(c.motivo, /repetidas/);
});

test('si descubrir muere a la mitad, lo guardado queda y la próxima retoma', async () => {
  const j = juguete();
  let cortar = true;
  const c1 = await correrConector({ ...j, async *descubrir(cur, ctx) {
    let n = 0;
    for await (const p of j.descubrir(cur, ctx)) { if (cortar && ++n === 3) throw new Error('se cayó la conexión'); yield p; }
  } }, deps);
  assert.equal(c1.nuevos, 2);
  assert.equal(c1.semaforo, 'amarillo');
  cortar = false;
  const c2 = await correrConector(j, deps);
  assert.equal(c2.nuevos, 1);
  assert.equal(db.cobertura('juguete').n, 3);
});

test('releer lo ya guardado es verde; sin filas y sin prueba es amarillo; con prueba es verde', async () => {
  await correrConector(juguete(), deps);
  const j = juguete();
  const c0 = await correrConector({ ...j, async *descubrir(_c, ctx) { yield* j.descubrir(null, ctx); } }, deps);
  assert.equal(c0.semaforo, 'verde');
  assert.match(c0.motivo, /ya estaban guardados/);
  const c1 = await correrConector(juguete(), deps);
  assert.equal(c1.semaforo, 'amarillo');
  assert.match(c1.motivo, /sin prueba/);
  estado.vacio = true;
  const c2 = await correrConector(juguete(), deps);
  assert.equal(c2.semaforo, 'verde');
  assert.match(c2.motivo, /probado/);
});

test('fecha que no se lee queda nula y contada, nunca hoy', async () => {
  estado.items[0].fecha = 'el martes pasado';
  estado.items[1].fecha = '2323-01-01';
  const c = await correrConector(juguete(), deps);
  assert.equal(c.sin_fecha, 2);
  const hoy = new Date().toISOString().slice(0, 10);
  for (const r of db.vigentes('juguete')) assert.notEqual(r.fecha, hoy);
  assert.equal(db.cobertura('juguete').sin_fecha, 2);
});

test('contenido nuevo en una clave es versión nueva y la búsqueda ve solo la vigente', async () => {
  await correrConector(juguete(), deps);
  estado.items[2].cuerpo = 'Tercer aviso corregido sobre electricidad';
  const j = juguete();
  const c = await correrConector({ ...j, async *descubrir(_c, ctx) { yield* j.descubrir(null, ctx); } }, deps);
  assert.equal(c.versiones, 1);
  assert.equal(c.nuevos, 0);
  assert.equal(db.cobertura('juguete').n, 3);
  assert.equal(buscar(db, 'juguete', { consulta: 'gas' }).length, 0);
  assert.equal(buscar(db, 'juguete', { consulta: 'electricidad' }).length, 1);
});

test('un lector que revienta deja la corrida en rojo', async () => {
  const c = await correrConector(juguete({ leer: () => { throw new Error('no encontré el artículo'); } }), deps);
  assert.equal(c.semaforo, 'rojo');
  assert.equal(c.fallos_parser, 3);
});

test('salida por país sin proxy falla con motivo y no sale directo', async () => {
  let pedidos = 0;
  const c = await correrConector(juguete({ acceso: { ...juguete().acceso, salida: 'mx' } }), { ...deps, fetchImpl: async () => { pedidos++; throw new Error('no debía salir'); } });
  assert.equal(pedidos, 0);
  assert.match(c.motivo, /ACOMETIDA_PROXY_MX/);
  assert.notEqual(c.semaforo, 'verde');
});

test('canario: forma bien con el sitio sano, falla con el sitio cambiado', async () => {
  assert.equal((await correrCanario(juguete(), deps)).ok, true);
  estado.items[0].titulo = '';
  const r = await correrCanario(juguete(), deps);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /titulo/);
});
