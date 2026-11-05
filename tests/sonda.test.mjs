import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { crearAlmacen } from '../src/almacen.mjs';
import { abrirBase } from '../src/base.mjs';
import { correrCanario, correrConector } from '../src/motor.mjs';
import { validarConector } from '../src/proyecto.mjs';
import { analizarRobots, clasificarError, filasJson, nombreDeFuente, nuevo, recorrer, sondear } from '../src/sonda.mjs';

// Un sitio de juguete con un caso por ruta.
const docs = [1, 2, 3].map((n) => ({ id: `D-${n}`, titulo: `Aviso ${n}`, fecha: `2026-10-0${n}` }));
let base;
const html = (cuerpo, cabeza = '') => `<!doctype html><html><head><title>Portal de avisos</title>${cabeza}</head><body>${cuerpo}</body></html>`;
const rutas = {
  '/cdn-cgi/trace': () => [200, 'text/plain', 'fl=1\nip=203.0.113.9\nloc=CO\nhttp=http/1.1\n'],
  '/robots.txt': () => [200, 'text/plain', `User-agent: *\nCrawl-delay: 10\nDisallow: /privado\n\nSitemap: ${base}/sitemap.xml\n`],
  '/api.json': () => [200, 'application/json', JSON.stringify({ count: 3, next_page_url: null, results: docs.map((d) => ({
    document_number: d.id, title: d.titulo, abstract: `Texto del ${d.titulo}`, publication_date: d.fecha, html_url: `${base}/doc/${d.id}.html`,
    agencies: [{ name: 'Agencia', url: `${base}/agencia` }, { name: 'Otra', url: `${base}/otra` }, { name: 'Tercera', url: `${base}/t` }, { name: 'Cuarta', url: `${base}/c` }],
  })) })],
  '/viejo': () => [301, 'text/plain', '', { location: '/api.json' }],
  '/feed.atom': () => [200, 'application/atom+xml', `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Avisos</title>${
    docs.map((d) => `<entry><id>${d.id}</id><title>${d.titulo}</title><link href="${base}/doc/${d.id}.html"/><published>${d.fecha}T09:00:00Z</published><summary>Texto del ${d.titulo}</summary></entry>`).join('')}</feed>`],
  '/rss.xml': () => [200, 'application/rss+xml', `<rss version="2.0"><channel><title>Avisos</title>${docs.map((d) => `<item><title>${d.titulo}</title><link>${base}/doc/${d.id}.html</link></item>`).join('')}</channel></rss>`],
  '/portal': () => [200, 'text/html; charset=utf-8', html(
    `<nav><ul><li><a href="/a">Inicio</a></li><li><a href="/b">Leyes</a></li><li><a href="/c">Contacto</a></li><li><a href="/d">Más</a></li></ul></nav>
     <form action="/buscar" method="get"><input type="search" name="q"><button>Buscar</button></form>
     <ul class="lista">${[...docs].reverse().map((d) => `<li class="aviso"><a href="/doc/${d.id}.html">${d.titulo}</a> <time datetime="${d.fecha}">${d.fecha}</time></li>`).join('')}</ul>`,
    '<link rel="alternate" type="application/rss+xml" title="Avisos" href="/rss.xml">')],
  '/lista.aspx': () => [200, 'text/html', html(
    `<form method="post" action="./lista.aspx" id="form1"><input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="dDwtMTA="/>
     <input type="hidden" name="__EVENTVALIDATION" value="abc"/><table id="Grid">${docs.map((d) => `<tr><td><a href="det.aspx?id=${d.id}">${d.titulo}</a></td><td>0${d.id.slice(-1)}/10/2026</td></tr>`).join('')}</table>
     <a href="javascript:__doPostBack('ctl00$Grid','Page$2')">2</a></form>`)],
  '/spa/main.abc123.js': () => [200, 'application/javascript', 'const API="https://datos.ejemplo.gob/api/v1";function c(n){return fetch("/api/v2/normas?pagina="+n)}var s="https://twitter.com/intent/tweet?url=";'],
  '/archivo.pdf': () => [200, 'application/pdf', '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF', { 'last-modified': 'Mon, 02 Nov 2026 10:00:00 GMT', etag: '"v1"' }],
  '/privado/lista.json': () => [200, 'application/json', JSON.stringify({ items: [{ id: 1, fecha: '2026-10-01' }] })],
  // el sumario del BOE tal como se midió el 4-nov, servido para probar el recorrido completo de la sonda
  '/boe-sumario.json': () => [200, 'application/json', readFileSync(new URL('./fixtures/casos/boe-20261103.json', import.meta.url), 'utf8')],
};
const servidor = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const accept = req.headers.accept ?? '';
  const ua = req.headers['user-agent'] ?? '';
  let r;
  if (u.pathname === '/lento') return; // nunca responde
  if (u.pathname === '/sumario') {
    if (accept.includes('application/json')) r = [200, 'application/json', JSON.stringify({ data: { fecha_publicacion: '20261103', items: docs.map((d) => ({ identificador: d.id, titulo: d.titulo, url_html: `${base}/doc/${d.id}.html` })) } })];
    else if (accept.includes('application/xml')) r = [200, 'application/xml', '<response><data><item><identificador>D-1</identificador></item></data></response>'];
    else r = [400, 'application/xml', '<response><status><code>400</code><text>No soportado ningún mime type de la cabecera Accept.</text></status></response>'];
  } else if (u.pathname === '/protegido') {
    r = ua.includes('Mozilla') ? rutas['/api.json']() : [403, 'text/html', html('<h1>Acceso denegado</h1>')];
  } else if (u.pathname.startsWith('/spa/') && !rutas[u.pathname]) {
    // SPA: toda ruta devuelve el mismo HTML chico; los bundles van relativos a <base href>
    r = [200, 'text/html', '<!doctype html><html><head><base href="/spa/"><title>App de normas</title></head><body><div id="root"></div><script src="main.abc123.js"></script></body></html>'];
  } else if (/^\/doc\/D-\d\.html$/.test(u.pathname)) {
    const d = docs.find((x) => u.pathname.includes(x.id));
    r = [200, 'text/html', html(`<h1>${d.titulo}</h1><p>Texto del ${d.titulo}</p>`)];
  } else r = rutas[u.pathname]?.() ?? [404, 'text/plain', 'no'];
  const [status, tipo, cuerpo, extra = {}] = r;
  res.writeHead(status, { 'content-type': tipo, ...extra });
  res.end(cuerpo);
});

before(async () => { await new Promise((r) => servidor.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${servidor.address().port}`; });
after(() => { servidor.closeAllConnections(); servidor.close(); });

const opciones = (extra = {}) => ({ env: {}, trazaUrl: `${base}/cdn-cgi/trace`, timeoutMs: 3000, ...extra });

test('API JSON: fila, fecha, clave y enlace medidos; no gana el arreglo anidado', async () => {
  const inf = await sondear(`${base}/api.json`, opciones());
  assert.equal(inf.tipo, 'api_json');
  assert.equal(inf.desde, 'CO');
  assert.equal(inf.filas.ruta, 'results', 'las agencias anidadas (12) no le ganan a los documentos (3)');
  assert.equal(inf.filas.fecha.campo, 'publication_date');
  assert.equal(inf.filas.id, 'document_number');
  assert.equal(inf.filas.url, 'html_url');
  assert.equal(inf.acceso.esperado, 'json');
  assert.equal(inf.acceso.ritmo.porMinuto, 6, 'Crawl-delay 10 = 6 por minuto');
  assert.deepEqual(inf.canario, { id: `${base}/api.json`, url: `${base}/api.json` });
  assert.ok(!JSON.stringify(inf).includes('203.0.113.9'), 'la IP de salida no se guarda');
});

test('redirecciones: se registran y se mide el destino', async () => {
  const inf = await sondear(`${base}/viejo`, opciones());
  assert.equal(inf.respuesta.redirecciones.length, 1);
  assert.equal(inf.respuesta.redirecciones[0].status, 301);
  assert.equal(inf.respuesta.urlFinal, `${base}/api.json`);
  assert.equal(inf.tipo, 'api_json');
});

test('feed Atom: entradas y campo de fecha', async () => {
  const inf = await sondear(`${base}/feed.atom`, opciones());
  assert.equal(inf.tipo, 'feed_atom');
  assert.equal(inf.filas.cuantas, 3);
  assert.equal(inf.fecha.campo, 'published');
  assert.equal(inf.acceso.esperado, 'xml');
});

test('HTML con <link rel=alternate>, buscador, fila con <time> y robots con Sitemap', async () => {
  const inf = await sondear(`${base}/portal`, opciones());
  assert.equal(inf.tipo, 'html_buscador');
  assert.equal(inf.feeds[0].url, `${base}/rss.xml`);
  assert.ok(inf.medido.some((l) => l.includes('responde 200 con 3 entradas')), 'el feed declarado se mide');
  assert.equal(inf.filas.marca, '<li class="aviso"', 'el menú de <nav> no cuenta como fila');
  assert.equal(inf.fecha.campo, '<time datetime>');
  assert.deepEqual(inf.sitemaps, [`${base}/sitemap.xml`]);
  assert.equal(inf.robots.prohibe, false);
  assert.equal(inf.canario.url, `${base}/doc/D-3.html`);
});

test('ASP.NET WebForms: __VIEWSTATE y postbacks', async () => {
  const inf = await sondear(`${base}/lista.aspx`, opciones());
  assert.equal(inf.tipo, 'webforms');
  assert.deepEqual(inf.webforms.eventos, ['ctl00$Grid Page$2']);
  assert.equal(inf.filas.marca, '<tr');
  assert.match(inf.fecha.campo, /en el texto/);
});

test('SPA: HTML chico, bundle relativo a <base href> y candidatos a XHR', async () => {
  const inf = await sondear(`${base}/spa/consulta/lista?cadena=ley`, opciones());
  assert.equal(inf.tipo, 'spa');
  assert.ok(inf.xhr.includes('https://datos.ejemplo.gob/api/v1'));
  assert.ok(inf.xhr.includes('/api/v2/normas?pagina='));
  assert.ok(!inf.xhr.some((x) => x.includes('twitter')));
  assert.ok(inf.sinMedir.some((l) => l.startsWith('XHR reales')));
  assert.equal(inf.canario, null);
});

test('archivo PDF: tipo, Last-Modified y esperado archivo', async () => {
  const inf = await sondear(`${base}/archivo.pdf`, opciones());
  assert.equal(inf.tipo, 'archivo_pdf');
  assert.equal(inf.archivo.lastModified, 'Mon, 02 Nov 2026 10:00:00 GMT');
  assert.equal(inf.acceso.esperado, 'archivo');
  assert.ok(inf.sinMedir.some((l) => l.startsWith('si el archivo se actualiza')));
});

test('400 que se arregla con Accept (caso BOE)', async () => {
  const inf = await sondear(`${base}/sumario`, opciones());
  assert.equal(inf.variantes[0].status, 400);
  assert.deepEqual(inf.acceso.cabeceras, { Accept: 'application/json' });
  assert.equal(inf.acceso.uaNavegador, false);
  assert.ok(inf.variantes.some((v) => v.prueba.includes('application/xml') && v.status === 200), 'se miden las dos cabeceras');
  assert.equal(inf.tipo, 'api_json');
  assert.equal(inf.fecha.nivel, 'documento');
  assert.equal(inf.fecha.campo, 'data.fecha_publicacion');
});

test('403 que se arregla con UA de navegador', async () => {
  const inf = await sondear(`${base}/protegido`, opciones());
  assert.equal(inf.acceso.uaNavegador, true);
  assert.match(inf.uaCambia, /403 con UA propio, 200 con UA de navegador/);
  assert.equal(inf.tipo, 'api_json');
});

test('robots.txt que prohíbe la ruta se declara', async () => {
  const inf = await sondear(`${base}/privado/lista.json`, opciones());
  assert.equal(inf.robots.prohibe, true);
  assert.equal(inf.robots.regla, 'Disallow: /privado');
  assert.ok(inf.sinMedir.some((l) => l.startsWith('permiso: robots.txt prohíbe')));
});

test('sin respuesta: «sin medir desde CO», sin seguir pidiendo', async () => {
  const inf = await sondear(`${base}/lento`, opciones({ timeoutMs: 400 }));
  assert.equal(inf.falla.tipo, 'sin_respuesta');
  assert.ok(inf.medido.some((l) => l.startsWith('sin medir desde CO')));
  assert.equal(inf.variantes.length, 1);
  assert.equal(inf.tipo, null);
});

const conCausa = (code) => Object.assign(new TypeError('fetch failed'), { cause: { code, message: code } });
const fetchQueFalla = (code) => async (url, init) => (String(url).includes('/roto') ? Promise.reject(conCausa(code)) : fetch(url, init));

test('TLS: certificado que no corresponde = falla de la fuente declarada, sin apagar la verificación', async () => {
  const inf = await sondear(`${base.replace('http:', 'https:')}/roto`, opciones({ fetchImpl: fetchQueFalla('ERR_TLS_CERT_ALTNAME_INVALID') }));
  assert.equal(inf.falla.tipo, 'tls_fuente');
  assert.ok(inf.medido.some((l) => /falla de la fuente: no se apaga la verificación/.test(l)));
  assert.equal(inf.acceso.caIntermedios, undefined);
  assert.equal(inf.tipo, null);
});

test('TLS: intermedio faltante se clasifica aparte (propone caIntermedios cuando lo encuentra)', () => {
  assert.equal(clasificarError(conCausa('UNABLE_TO_VERIFY_LEAF_SIGNATURE')).tipo, 'tls_intermedio');
  assert.equal(clasificarError(conCausa('CERT_HAS_EXPIRED')).tipo, 'tls_fuente');
  assert.equal(clasificarError(conCausa('UND_ERR_CONNECT_TIMEOUT')).tipo, 'sin_respuesta');
  assert.equal(clasificarError(Object.assign(new Error('x'), { name: 'AbortError' })).tipo, 'sin_respuesta');
  assert.equal(clasificarError(conCausa('ENOTFOUND')).tipo, 'dns');
});

test('robots: regla más larga gana, comodines y grupo propio', () => {
  const txt = 'User-agent: *\nDisallow: /\nAllow: /datos/\nDisallow: /datos/*.pdf$\n\nUser-agent: acometida\nDisallow: /nada-para-acometida\nSitemap: https://x.test/s.xml';
  assert.equal(analizarRobots(txt, '/datos/a.json', 'otro').prohibe, false);
  assert.equal(analizarRobots(txt, '/datos/a.pdf', 'otro').prohibe, true);
  assert.equal(analizarRobots(txt, '/otra', 'otro').prohibe, true);
  assert.equal(analizarRobots(txt, '/otra').prohibe, false, 'acometida tiene su grupo');
  assert.deepEqual(analizarRobots(txt, '/').sitemaps, ['https://x.test/s.xml']);
});

test('JSON anidado: la misma clave a distintas profundidades se junta', () => {
  const j = { data: { sumario: { metadatos: { fecha_publicacion: '20261103' }, seccion: [
    { departamento: [{ item: [{ identificador: 'A', url_html: 'https://x.test/a' }, { identificador: 'B', url_html: 'https://x.test/b' }] }] },
    { departamento: [{ epigrafe: [{ item: [{ identificador: 'C', url_html: 'https://x.test/c' }, { identificador: 'D', url_html: 'https://x.test/d' }] }] }] },
    { departamento: [{ epigrafe: [{ item: { identificador: 'E', url_html: 'https://x.test/e' } }] }] },
  ] } } };
  const f = filasJson(j);
  assert.equal(f.ruta, '**.item');
  assert.equal(f.cuantas, 5, 'el `item` suelto de la tercera sección cuenta como una fila');
  assert.deepEqual(recorrer(j, f.ruta).map((x) => x.identificador), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(f.fechaDoc.campo, 'data.sumario.metadatos.fecha_publicacion');
});

test('sumario del BOE medido el 4-nov: 240 ítems, no 139', () => {
  const j = JSON.parse(readFileSync(new URL('./fixtures/casos/boe-20261103.json', import.meta.url), 'utf8'));
  const f = filasJson(j);
  assert.equal(f.ruta, '**.item');
  assert.equal(f.cuantas, 240, '194 en arreglos (55 bajo epigrafe, a 11 niveles) + 46 como objeto suelto');
  assert.equal(recorrer(j, f.ruta).length, 240);
  assert.equal(new Set(recorrer(j, f.ruta).map((x) => x.identificador)).size, 240, 'son 240 identificadores distintos');
  assert.equal(f.id, 'identificador');
  assert.equal(f.url, 'url_html');
  assert.equal(f.fechaDoc.campo, 'data.sumario.metadatos.fecha_publicacion');
});

test('la sonda sobre el sumario del BOE informa 240 ítems', async () => {
  const inf = await sondear(`${base}/boe-sumario.json`, opciones());
  assert.equal(inf.tipo, 'api_json');
  assert.equal(inf.filas.ruta, '**.item');
  assert.equal(inf.filas.cuantas, 240);
  assert.match(inf.medido.join('\n'), /fila: cada objeto `item`, a cualquier profundidad \(3 rutas\) · 240 en esta respuesta/);
  assert.equal(inf.fecha.nivel, 'documento');
  assert.equal(inf.fecha.campo, 'data.sumario.metadatos.fecha_publicacion');
});

test('nombreDeFuente: válido para el motor', () => {
  assert.equal(nombreDeFuente('www.boe.es'), 'boe_es');
  assert.equal(nombreDeFuente('Boletín Oficial'), 'boletin_oficial');
  assert.equal(nombreDeFuente('123.gob'), 'f_123_gob');
});

// --- nuevo: escribe, no sobrescribe, y el esqueleto corre en el motor ---

const deps = () => {
  const dir = mkdtempSync(join(tmpdir(), 'acometida-motor-'));
  return { base: abrirBase(join(dir, 'a.db')), almacen: crearAlmacen(join(dir, 'crudo')), retardoBaseMs: 1, dormir: async () => {}, env: {} };
};
const cargar = async (archivo) => validarConector((await import(`${pathToFileURL(archivo).href}?t=${Date.now()}`)).default, archivo);

test('nuevo: escribe ficha + informe y nunca sobrescribe', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acometida-nuevo-'));
  const salida = [];
  const r = await nuevo(`${base}/api.json`, opciones({ dir, nombre: 'Boletín de prueba', log: (s) => salida.push(s) }));
  assert.equal(r.archivo, join(dir, 'fuentes', 'boletin_de_prueba.mjs'));
  assert.ok(existsSync(r.rutaInforme));
  assert.match(salida.join('\n'), /^boletin_de_prueba · API JSON · HTTP 200/);
  const md = readFileSync(r.rutaInforme, 'utf8');
  for (const s of ['## Medido', '## Sin medir', '## Guía de lectura', 'desde CO']) assert.ok(md.includes(s), s);
  assert.ok(!md.includes('—') && !readFileSync(r.archivo, 'utf8').includes('—'), 'sin raya larga');

  const c = await cargar(r.archivo);
  assert.equal(c.fuente, 'boletin_de_prueba');
  assert.equal(c.acceso.esperado, 'json');

  writeFileSync(r.archivo, '// editado a mano\n' + readFileSync(r.archivo, 'utf8'));
  await assert.rejects(nuevo(`${base}/api.json`, opciones({ dir, nombre: 'Boletín de prueba', log: () => {} })), /ya existe/);
  assert.ok(readFileSync(r.archivo, 'utf8').startsWith('// editado a mano'), 'el archivo existente queda intacto');
});

test('el esqueleto de una API JSON corre verde, prueba el vacío y pasa el canario', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acometida-nuevo-'));
  const c = await cargar((await nuevo(`${base}/api.json`, opciones({ dir, nombre: 'api', log: () => {} }))).archivo);
  const d = deps();
  const c1 = await correrConector(c, d);
  assert.equal(c1.semaforo, 'verde', c1.motivo);
  assert.equal(c1.nuevos, 3);
  const c2 = await correrConector(c, d);
  assert.equal(c2.semaforo, 'verde', c2.motivo);
  assert.match(c2.motivo, /probado/);
  assert.equal((await correrCanario(c, d)).ok, true);
});

test('el esqueleto de un sumario con Accept y fecha del documento corre verde', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acometida-nuevo-'));
  const c = await cargar((await nuevo(`${base}/sumario`, opciones({ dir, nombre: 'sumario', log: () => {} }))).archivo);
  const d = deps();
  const c1 = await correrConector(c, d);
  assert.equal(c1.semaforo, 'verde', c1.motivo);
  assert.equal(c1.nuevos, 3);
  assert.deepEqual(d.base.vigentes('sumario').map((r) => r.fecha), ['2026-11-03', '2026-11-03', '2026-11-03']);
});

test('el esqueleto de un feed corre verde y el de una lista HTML trae los documentos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acometida-nuevo-'));
  const feed = await cargar((await nuevo(`${base}/feed.atom`, opciones({ dir, nombre: 'feed', log: () => {} }))).archivo);
  const d = deps();
  const c1 = await correrConector(feed, d);
  assert.equal(c1.semaforo, 'verde', c1.motivo);
  assert.equal(c1.nuevos, 3);
  assert.equal((await correrCanario(feed, d)).ok, true);

  const portal = await cargar((await nuevo(`${base}/portal`, opciones({ dir, nombre: 'portal', log: () => {} }))).archivo);
  const c2 = await correrConector(portal, d);
  assert.equal(c2.nuevos, 3, c2.motivo);
  assert.equal(c2.sin_fecha, 3, 'la fecha queda en COMPLETAR: nula y contada, nunca hoy');
  assert.equal((await correrCanario(portal, d)).ok, true);
});

test('fuente sin respuesta: el esqueleto se escribe y su descubrir dice «sin medir»', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acometida-nuevo-'));
  const r = await nuevo(`${base}/lento`, opciones({ dir, nombre: 'lenta', timeoutMs: 400, log: () => {} }));
  const c = await cargar(r.archivo);
  assert.equal(c.canario, undefined);
  const corrida = await correrConector(c, deps());
  assert.notEqual(corrida.semaforo, 'verde');
  assert.match(corrida.motivo, /sin medir: sin_respuesta/);
});
