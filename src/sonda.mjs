/**
 * La sonda: mide un link antes de escribir su conector. Mide, no supone: lo que no pudo medir lo dice («sin medir: …»).
 * Nunca apaga la verificación TLS. Un certificado roto es falla de la fuente, declarada; para encontrar el intermedio
 * que falta solo se LEE el certificado del sitio, nunca se piden datos sin verificar.
 */
import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import tls from 'node:tls';
import { atributos, bloques, leerFeed, leerSitemap, textoDeHtml, textoXml, valor } from './ayudas.mjs';
import { fecha as normalizarFecha } from './fecha.mjs';
import { DESCRIPCION, conectorDe, informeDe } from './plantillas.mjs';
import { carpetaDe } from './proyecto.mjs';
import { UA_ACOMETIDA, UA_NAVEGADOR, causaDeRed, pareceHtml, proxyDe } from './traer.mjs';

export const TRAZA = 'https://1.1.1.1/cdn-cgi/trace';
const TOPE = 8 * 1024 * 1024;
const utf8 = (b) => Buffer.from(b).toString('utf8');
const mime = (ct) => String(ct ?? '').split(';')[0].trim().toLowerCase();
const es2xx = (r) => r?.ok && r.status >= 200 && r.status < 300;
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1).replace('.', ',')} KB`);
const seg = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

/** Clasifica un error de red: sin_respuesta, tls_fuente, tls_intermedio, dns o red. */
export function clasificarError(e) {
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return { tipo: 'sin_respuesta', codigo: 'timeout', detalle: 'se agotó el plazo' };
  const codigo = String(causaDeRed(e));
  const detalle = e?.cause?.message ?? e?.message ?? codigo;
  if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT/i.test(codigo)) return { tipo: 'tls_intermedio', codigo, detalle };
  if (/CERT|SSL|TLS|ALTNAME|SELF_SIGNED|DEPTH_ZERO/i.test(codigo)) return { tipo: 'tls_fuente', codigo, detalle };
  if (/TIMEOUT|ETIMEDOUT/i.test(codigo)) return { tipo: 'sin_respuesta', codigo, detalle };
  if (/ENOTFOUND|EAI_AGAIN/i.test(codigo)) return { tipo: 'dns', codigo, detalle };
  return { tipo: 'red', codigo, detalle };
}

async function leerCuerpo(r, tope) {
  if (!r.body) return { bytes: Buffer.alloc(0), truncado: false };
  const partes = [];
  let n = 0, truncado = false;
  for await (const p of r.body) {
    partes.push(p); n += p.length;
    if (n >= tope) { truncado = true; break; }
  }
  return { bytes: Buffer.concat(partes).subarray(0, tope), truncado };
}

/**
 * Un GET medido: sigue redirecciones a mano para registrarlas. Undici corta la conexión a los 10 s,
 * así que «sin respuesta» insiste hasta agotar el plazo completo.
 */
export async function pedir(url, { fetchImpl = fetch, dispatcher, timeoutMs = 25_000, ua = UA_ACOMETIDA, cabeceras = {}, tope = TOPE } = {}) {
  const t0 = Date.now();
  const limite = t0 + timeoutMs;
  const cadena = [];
  let actual = url;
  for (;;) {
    const ctl = new AbortController();
    const reloj = setTimeout(() => ctl.abort(), Math.max(1, limite - Date.now()));
    try {
      const init = { method: 'GET', headers: { 'User-Agent': ua, ...cabeceras }, redirect: 'manual', signal: ctl.signal };
      if (dispatcher) init.dispatcher = dispatcher;
      const r = await fetchImpl(actual, init);
      const destino = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && destino && cadena.length < 10) {
        await r.body?.cancel().catch(() => {});
        cadena.push({ status: r.status, url: actual });
        actual = new URL(destino, actual).href;
        continue;
      }
      const { bytes, truncado } = await leerCuerpo(r, tope);
      return { ok: true, status: r.status, url: actual, cadena, contentType: r.headers.get('content-type') ?? '',
        cabeceras: Object.fromEntries(r.headers), bytes, tamano: bytes.length, truncado, ms: Date.now() - t0, texto: () => utf8(bytes) };
    } catch (e) {
      const falla = clasificarError(e);
      if (falla.tipo === 'sin_respuesta' && falla.codigo !== 'timeout' && limite - Date.now() > 1000) continue;
      return { ok: false, url: actual, cadena, falla, ms: Date.now() - t0 };
    } finally {
      clearTimeout(reloj);
    }
  }
}

/** País de salida medido con la traza de Cloudflare (`loc=`). No guarda la IP. */
export async function paisDeSalida(o) {
  const r = await pedir(o.trazaUrl ?? TRAZA, { ...o, timeoutMs: 8_000, tope: 4096 });
  if (!r.ok) return { pais: null, motivo: `la traza no respondió (${r.falla.codigo})` };
  if (r.status !== 200) return { pais: null, motivo: `la traza dio HTTP ${r.status}` };
  const pais = /^loc=([A-Z]{2})\s*$/m.exec(r.texto())?.[1] ?? null;
  return { pais, motivo: pais ? null : 'la traza no trae loc=' };
}

// ---------- robots.txt ----------

const escaparRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const coincide = (patron, ruta) => new RegExp(`^${patron.split('*').map(escaparRe).join('.*').replace(/\\\$$/, '$')}`).test(ruta);

/** Lee un robots.txt: líneas Sitemap, Crawl-delay y si la ruta queda prohibida para `agente` (regla más larga gana). */
export function analizarRobots(txt, ruta, agente = 'acometida') {
  const sitemaps = [], grupos = [];
  let g = null, previaUA = false;
  for (const linea of String(txt).split(/\r?\n/)) {
    const m = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(linea.replace(/#.*/, ''));
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2];
    if (k === 'sitemap') { if (v) sitemaps.push(v); continue; }
    if (k === 'user-agent') {
      if (!g || !previaUA) { g = { agentes: [], reglas: [], crawl: null }; grupos.push(g); }
      g.agentes.push(v.toLowerCase()); previaUA = true; continue;
    }
    previaUA = false;
    if (!g) continue;
    if ((k === 'allow' || k === 'disallow') && v) g.reglas.push({ permite: k === 'allow', patron: v });
    if (k === 'crawl-delay' && Number(v) > 0) g.crawl = Number(v);
  }
  const grupo = grupos.find((x) => x.agentes.some((a) => a !== '*' && agente.toLowerCase().includes(a))) ?? grupos.find((x) => x.agentes.includes('*'));
  let mejor = null;
  for (const r of grupo?.reglas ?? []) {
    if (!coincide(r.patron, ruta)) continue;
    if (!mejor || r.patron.length > mejor.patron.length || (r.patron.length === mejor.patron.length && r.permite)) mejor = r;
  }
  return { sitemaps, prohibe: Boolean(mejor && !mejor.permite), regla: mejor ? `${mejor.permite ? 'Allow' : 'Disallow'}: ${mejor.patron}` : null, crawlDelay: grupo?.crawl ?? null };
}

// ---------- tipo y filas ----------

const scriptsDe = (html) => [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => atributos(m[1]).src).filter(Boolean);
const cuerpoDe = (html) => /<body\b[^>]*>([\s\S]*)/i.exec(html)?.[1] ?? html;

/** Feeds declarados en el HTML con `<link rel="alternate" type="application/rss+xml|atom+xml">`. */
export function feedsDe(html, base) {
  return [...String(html).matchAll(/<link\b([^>]*)>/gi)].map((m) => atributos(m[1]))
    .filter((a) => /\balternate\b/i.test(a.rel ?? '') && /(rss|atom)\+xml|application\/(rss|atom)/i.test(a.type ?? '') && a.href)
    .map((a) => ({ url: new URL(a.href, base).href, tipo: a.type, titulo: a.title ?? null }));
}

/** Tipo de fuente por content-type y contenido. */
export function tipoDe(resp) {
  const ct = mime(resp.contentType);
  const b = resp.bytes;
  const cab = utf8(b.subarray(0, 4096)).replace(/^﻿/, '').trimStart();
  if (cab.startsWith('%PDF') || ct === 'application/pdf') return 'archivo_pdf';
  if ((b[0] === 0x50 && b[1] === 0x4b) || /spreadsheetml|ms-excel|zip/.test(ct)) {
    return /spreadsheetml|ms-excel/.test(ct) || /\.xlsx?($|\?)/i.test(resp.url) ? 'archivo_xlsx' : 'archivo_zip';
  }
  if (ct === 'text/csv' || /\.csv($|\?)/i.test(resp.url)) return 'archivo_csv';
  if (/json/.test(ct) || /^[{[]/.test(cab)) { try { JSON.parse(resp.texto()); return 'api_json'; } catch { /* no es JSON */ } }
  const prologo = '^(?:<\\?[^>]*\\?>\\s*|<!--[\\s\\S]*?-->\\s*)*';
  if (new RegExp(`${prologo}<(?:[\\w-]+:)?feed[\\s>]`).test(cab)) return 'feed_atom';
  if (new RegExp(`${prologo}<(?:rss|rdf:RDF)[\\s>]`).test(cab)) return 'feed_rss';
  if (/<(?:[\w-]+:)?(urlset|sitemapindex)[\s>]/.test(cab)) return 'sitemap';
  if (/html/.test(ct) || pareceHtml(b) || /<html[\s>]/i.test(cab)) {
    const html = resp.texto();
    if (/name=["']?__VIEWSTATE\b/i.test(html)) return 'webforms';
    const visible = textoDeHtml(cuerpoDe(html)).length;
    const marca = /<app-root\b|\bng-version=|<div[^>]+id=["'](?:root|app|__nuxt|svelte)["'][^>]*>\s*<\/div>|data-reactroot/i.test(html);
    if (scriptsDe(html).length && ((marca && visible < 1500) || visible < 250)) return 'spa';
    return formularioDeBusqueda(html) ? 'html_buscador' : 'html';
  }
  if (/xml/.test(ct) || cab.startsWith('<')) return 'api_xml';
  if (/^text\//.test(ct)) return 'texto';
  return 'desconocido';
}

function formularioDeBusqueda(html) {
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const entradas = [...m[2].matchAll(/<input\b([^>]*)>/gi)].map((x) => atributos(x[1]));
    const busca = entradas.find((a) => a.type === 'search' || /^(q|query|buscar|busqueda|search|cadena|texto|term|s|keywords?)$/i.test(a.name ?? ''));
    if (busca) return { accion: atributos(m[1]).action ?? '', metodo: (atributos(m[1]).method ?? 'get').toUpperCase(), campo: busca.name ?? null };
  }
  return null;
}

const PATRON_FECHA = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\b|\b\d{1,2}\s+de\s+[a-záéíóú]+\s+(?:de|del)\s+\d{4}\b|\b[A-Z][a-z]+\.? \d{1,2}, \d{4}\b|\b\d{1,2} [A-Z][a-z]+ \d{4}\b/i;
const NOMBRES_FECHA = [/publica/i, /published|pubdate|issued/i, /fecha/i, /date/i, /updated|modified|lastmod/i, /created|creado/i];
const NOMBRES_ID = /^(id|identificador|document_number|documentnumber|numero|number|uuid|guid|slug|codigo|code|key|clave)$/i;
const NOMBRES_URL = ['html_url', 'url', 'link', 'href', 'permalink', 'url_html', 'web_url', 'pdf_url', 'url_pdf', 'json_url', 'url_xml'];
const NOMBRES_TITULO = /^(title|titulo|name|nombre|headline|asunto|subject)$/i;
const NOMBRES_TEXTO = /^(abstract|summary|resumen|description|descripcion|texto|text|body|content|contenido|sumilla|extracto)$/i;

function elegirFecha(claves, valorDe) {
  for (const re of NOMBRES_FECHA) {
    for (const k of claves.filter((k) => re.test(k))) {
      const v = valorDe(k);
      if (typeof v === 'string' && normalizarFecha(v)) return { campo: k, ejemplo: v };
    }
  }
  return null;
}

function elegirCampos(claves, valorDe) {
  const url = NOMBRES_URL.find((k) => claves.includes(k) && /^(https?:)?\//.test(String(valorDe(k) ?? '')))
    ?? claves.find((k) => /^https?:\/\//.test(String(valorDe(k) ?? '')));
  return {
    id: claves.find((k) => NOMBRES_ID.test(k)) ?? claves.find((k) => /(_id|Id|_number|_numero)$/.test(k)) ?? null,
    url: url ?? null,
    titulo: claves.find((k) => NOMBRES_TITULO.test(k)) ?? null,
    texto: claves.find((k) => NOMBRES_TEXTO.test(k)) ?? null,
    fecha: elegirFecha(claves, valorDe),
  };
}

/**
 * Recorre una ruta con puntos; los arreglos del camino se aplanan (un objeto suelto cuenta como arreglo de uno).
 * `**.item` junta todo lo que cuelga de una clave `item` a cualquier profundidad.
 */
export function recorrer(v, ruta) {
  const plano = (xs) => xs.flatMap((x) => (Array.isArray(x) ? x : [x]));
  if (ruta?.startsWith('**.')) {
    const k = ruta.slice(3), out = [];
    const ir = (x) => { if (Array.isArray(x)) return x.forEach(ir); if (!x || typeof x !== 'object') return; if (x[k] != null) out.push(x[k]); Object.entries(x).forEach(([c, y]) => c !== k && ir(y)); };
    ir(v);
    return plano(out).filter((x) => x && typeof x === 'object');
  }
  let actual = [v];
  for (const k of ruta ? ruta.split('.') : []) actual = plano(actual).map((x) => x?.[k]).filter((x) => x != null);
  return plano(actual).filter((x) => x && typeof x === 'object');
}

/**
 * Filas de una API JSON: de todos los arreglos de objetos (los del camino se aplanan), gana el que más filas
 * tiene, pesando por si sus objetos traen fecha y enlace. Así un sumario anidado encuentra sus ítems y una lista
 * de documentos no pierde contra las agencias de cada documento.
 * Un objeto suelto cuenta como una fila cuando su clave también es arreglo en otra parte: el sumario del BOE
 * cuelga `item` a veces como lista y a veces como uno solo, y contarlo solo como lista perdía 46 de sus 240.
 */
export function filasJson(j) {
  const rutas = new Map();
  const clavesLista = new Set();
  const sueltos = [];
  const ultima = (ruta) => ruta.split('.').pop();
  const registrar = (ruta, objs) => {
    const r = rutas.get(ruta) ?? { ruta, n: 0, muestras: [] };
    r.n += objs.length;
    if (r.muestras.length < 5) r.muestras.push(...objs.slice(0, 5 - r.muestras.length));
    rutas.set(ruta, r);
  };
  // El corte de profundidad va en 20: los ítems del BOE cuelgan a 11 (sumario · diario · seccion ·
  // departamento · epigrafe · item) y con 10 se perdían los de todos los epígrafes.
  const visitar = (v, ruta, prof) => {
    if (prof > 20 || v == null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      const objs = v.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
      if (objs.length && objs.length === v.length) { registrar(ruta, objs); if (ruta) clavesLista.add(ultima(ruta)); }
      for (const x of v.slice(0, 500)) visitar(x, ruta, prof + 1);
      return;
    }
    for (const [k, x] of Object.entries(v)) {
      const r = ruta ? `${ruta}.${k}` : k;
      // los hijos de un arreglo entran por el ramal de arriba, con la ruta del arreglo: no se cuentan dos veces
      if (x && typeof x === 'object' && !Array.isArray(x)) sueltos.push([r, x]);
      visitar(x, r, prof + 1);
    }
  };
  visitar(j, '', 0);
  for (const [r, x] of sueltos) if (clavesLista.has(ultima(r))) registrar(r, [x]);
  const porClave = new Map();
  for (const r of rutas.values()) {
    const k = r.ruta.split('.').pop();
    const g = porClave.get(k) ?? { ruta: `**.${k}`, n: 0, muestras: [], rutas: 0 };
    g.n += r.n; g.rutas++;
    if (g.muestras.length < 5) g.muestras.push(...r.muestras.slice(0, 5 - g.muestras.length));
    porClave.set(k, g);
  }
  const candidatas = [...rutas.values(), ...[...porClave.values()].filter((g) => g.rutas > 1 && g.ruta !== '**.')];
  const medidas = candidatas.map((r) => {
    const claves = [...new Set(r.muestras.flatMap((f) => Object.keys(f)))];
    return { ...r, claves, campos: elegirCampos(claves, (k) => r.muestras[0][k]) };
  });
  // un arreglo dentro de una fila con fecha es un atributo de esa fila (sus agencias, sus temas), no otra fila
  const conFecha = medidas.filter((r) => r.campos.fecha && !r.ruta.startsWith('**.')).map((r) => r.ruta);
  const adentro = (x) => conFecha.some((c) => x.ruta !== c && (c === '' || x.ruta.startsWith(`${c}.`)));
  let mejor = null;
  for (const r of medidas.filter((x) => !adentro(x))) {
    const puntos = r.n * (r.campos.fecha ? 3 : 1) * (r.campos.url ? 1.5 : 1) - r.ruta.split('.').length * 0.01;
    if (!mejor || puntos > mejor.puntos) mejor = { ...r, puntos };
  }
  if (!mejor) return null;
  const f0 = mejor.muestras[0];
  let fechaDoc = null;
  if (!mejor.campos.fecha) {
    const escalares = [];
    const juntar = (v, ruta, prof) => {
      if (prof > 6 || v == null || typeof v !== 'object' || Array.isArray(v)) return;
      for (const [k, x] of Object.entries(v)) (x && typeof x === 'object' ? juntar(x, ruta ? `${ruta}.${k}` : k, prof + 1) : escalares.push([ruta ? `${ruta}.${k}` : k, x]));
    };
    juntar(j, '', 0);
    const m = new Map(escalares);
    fechaDoc = elegirFecha([...m.keys()].map((k) => k), (k) => (typeof m.get(k) === 'number' ? String(m.get(k)) : m.get(k)));
  }
  const top = j && typeof j === 'object' && !Array.isArray(j) ? Object.keys(j) : [];
  return {
    que: mejor.ruta.startsWith('**.') ? `cada objeto \`${mejor.ruta.slice(3)}\`, a cualquier profundidad (${mejor.rutas} rutas)` : mejor.ruta ? `cada objeto de \`${mejor.ruta}\`` : 'cada objeto del arreglo raíz',
    ruta: mejor.ruta, cuantas: mejor.n, claves: mejor.claves, ...mejor.campos, fechaDoc,
    total: top.find((k) => /^(count|total|total_count|totalResults|total_results|hits)$/i.test(k)) ?? null,
    paginacion: top.filter((k) => /next|page|cursor|offset|links/i.test(k)),
    primera: f0,
  };
}

/** Filas de un XML genérico: la etiqueta con hijos que más se repite. */
export function filasXml(xml) {
  const conteo = new Map();
  for (const m of xml.matchAll(/<([A-Za-z_][\w:.-]*)[\s>/]/g)) conteo.set(m[1], (conteo.get(m[1]) ?? 0) + 1);
  const local = (n) => n.split(':').pop();
  for (const [n, c] of [...conteo].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])) {
    const bs = bloques(xml, local(n));
    if (!bs.length || !/<[A-Za-z_]/.test(bs[0].interior)) continue;
    const f0 = bs[0].interior;
    const claves = [...new Set([...f0.matchAll(/<([A-Za-z_][\w:.-]*)[\s>/]/g)].map((m) => local(m[1])))];
    const campos = elegirCampos(claves, (k) => valor(f0, k));
    let fechaDoc = null;
    if (!campos.fecha) {
      const todas = [...new Set([...xml.matchAll(/<([A-Za-z_][\w:.-]*)[\s>/]/g)].map((m) => local(m[1])))];
      fechaDoc = elegirFecha(todas, (k) => valor(xml, k));
    }
    return { que: `cada <${local(n)}>`, etiqueta: local(n), cuantas: c, claves, ...campos, fechaDoc, primera: f0 };
  }
  return null;
}

/** Fecha visible dentro de un fragmento de HTML (una fila). */
function fechaEnHtml(seg) {
  const t = /<time\b[^>]*datetime=["']([^"']+)/i.exec(seg);
  if (t && normalizarFecha(t[1])) return { campo: '<time datetime>', ejemplo: t[1] };
  for (const m of seg.matchAll(/<(\w+)\b[^>]*class=["']([^"']*(?:fecha|date|publica|published)[^"']*)["'][^>]*>([\s\S]{0,300}?)<\/\1>/gi)) {
    const txt = textoXml(m[3]);
    const p = PATRON_FECHA.exec(txt);
    if (p && normalizarFecha(p[0])) return { campo: `.${m[2].trim().split(/\s+/)[0]}`, ejemplo: p[0] };
  }
  const p = PATRON_FECHA.exec(textoDeHtml(seg));
  return p && normalizarFecha(p[0]) ? { campo: 'en el texto de la fila (puede no ser la de publicación)', ejemplo: p[0] } : null;
}

/** Filas de un HTML: la marca de apertura repetida (tr, li, article o una clase) cuyos tramos traen enlace y fecha. */
export function filasHtml(html, base) {
  const cuerpo = cuerpoDe(html).replace(/<(nav|header|footer|script|style)\b[\s\S]*?<\/\1\s*>/gi, (m) => ' '.repeat(m.length));
  const marcas = new Map();
  for (const m of cuerpo.matchAll(/<(tr|li|article|div|section|dd|p|span)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase();
    const clase = atributos(m[2]).class?.trim().split(/\s+/)[0];
    if (!clase && !['tr', 'li', 'article'].includes(tag)) continue;
    const k = clase ? `<${tag} class="${clase}"` : `<${tag}`;
    if (!marcas.has(k)) marcas.set(k, []);
    marcas.get(k).push(m.index);
  }
  let mejor = null;
  for (const [marca, pos] of marcas) {
    if (pos.length < 3) continue;
    const tramos = pos.map((p, i) => cuerpo.slice(p, Math.min(pos[i + 1] ?? p + 4000, p + 4000)));
    const enlaces = tramos.map((t) => /<a\b[^>]*href=["']([^"'#][^"']*)["']/i.exec(t)?.[1]).filter((h) => h && !/^(javascript|mailto|tel):/i.test(h));
    const fechas = tramos.map(fechaEnHtml).filter(Boolean);
    const puntos = enlaces.length + 2 * fechas.length + (marca.includes('class=') ? 0.5 : 0);
    if (enlaces.length >= 3 && (!mejor || puntos > mejor.puntos)) {
      mejor = { puntos, marca, cuantas: pos.length, conEnlace: enlaces.length, conFecha: fechas.length,
        fecha: fechas.length >= Math.ceil(pos.length / 2) ? fechas[0] : null,
        enlaces: [...new Set(enlaces.map((h) => { try { return new URL(h, base).href; } catch { return null; } }).filter(Boolean))] };
    }
  }
  if (!mejor) return null;
  return { que: `cada \`${mejor.marca}>\` (${mejor.conEnlace} con enlace, ${mejor.conFecha} con fecha)`, ...mejor };
}

const RUIDO = /w3\.org|schema\.org|google|gstatic|facebook|twitter|x\.com\/intent|linkedin|pinterest|tumblr|reddit|whatsapp|t\.me\/|vk\.com|stumbleupon|wikipedia|creativecommons|fontawesome|jsdelivr|unpkg|cdnjs|cloudflare|readspeaker|youtube|instagram|arcgis|mozilla\.org|github\.com|angular\.io|reactjs|npmjs|example\.com|localhost/i;
const registrable = (h) => { const p = h.split('.'); return p.slice(p.length > 2 && p.at(-2).length <= 3 ? -3 : -2).join('.'); };

/** Candidatos a XHR leídos del bundle de una SPA: URLs de API y rutas que se pasan a get/post/fetch. Sin confirmar. */
export function xhrDe(js, pagina) {
  const api = new Set(), rutas = new Set(), propias = new Set();
  const dom = registrable(new URL(pagina).hostname);
  for (const m of js.matchAll(/["'`](https?:\/\/[^"'`\s<>]{4,200})["'`]/g)) {
    let u; try { u = new URL(m[1]); } catch { continue; }
    if (RUIDO.test(m[1])) continue;
    if (/\/(api|apis|servicio|servicios|service|services|ws|rest|graphql|odata|datos|data)\b|^(api|apis|servicios?|ws|rest|datos)[.-]|[.-](api|servicios?)[.-]/i.test(`${u.hostname}${u.pathname}`)) api.add(m[1]);
    else if (registrable(u.hostname) === dom && (u.search || /\.(json|xml|php|py|aspx|asmx|ashx|do)$/i.test(u.pathname))) propias.add(m[1]);
  }
  for (const m of js.matchAll(/(?:\.(?:get|post|put|request)|\bfetch|\baxios(?:\.\w+)?)\(\s*(?:[\w$.]+\s*\+\s*)?["'`]((?:https?:\/\/[^"'`\s]+)|\/[\w\-./]*[\w\-./?=&]*)["'`]/g)) {
    if (m[1].length > 2 && !RUIDO.test(m[1])) rutas.add(m[1]);
  }
  return [...new Set([...api, ...rutas, ...propias])].slice(0, 20);
}

// ---------- TLS ----------

/** Lee el certificado que presenta el sitio (solo para describirlo; no se piden datos por esta conexión). */
function leerCertificado(host, port, timeoutMs = 10_000) {
  return new Promise((res) => {
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      const c = s.getPeerCertificate();
      const out = { altnames: c?.subjectaltname ?? null, vence: c?.valid_to ?? null, emisor: c?.issuer?.CN ?? c?.issuer?.O ?? null,
        aia: c?.infoAccess?.['CA Issuers - URI']?.[0] ?? null, error: s.authorizationError ? String(s.authorizationError) : null };
      s.end(); res(out);
    });
    s.setTimeout(timeoutMs, () => { s.destroy(); res(null); });
    s.on('error', () => res(null));
  });
}

function verificaCon(host, port, ca, timeoutMs = 10_000) {
  return new Promise((res) => {
    const s = tls.connect({ host, port, servername: host, ca: [...tls.rootCertificates, ...ca] }, () => { res(s.authorized); s.end(); });
    s.setTimeout(timeoutMs, () => { s.destroy(); res(false); });
    s.on('error', () => res(false));
  });
}

const aPem = (der) => `${'-'.repeat(5)}BEGIN CERTIFICATE${'-'.repeat(5)}\n${Buffer.from(der).toString('base64').match(/.{1,64}/g).join('\n')}\n${'-'.repeat(5)}END CERTIFICATE${'-'.repeat(5)}\n`;

async function medirTls(u, falla, via, informe) {
  const host = u.hostname, port = Number(u.port) || 443;
  const cert = await leerCertificado(host, port);
  if (cert) informe.tls = { altnames: cert.altnames, vence: cert.vence, emisor: cert.emisor };
  if (falla.tipo === 'tls_fuente') {
    informe.medido.push(`TLS: el certificado no sirve para ${host} (${falla.codigo}). Es falla de la fuente: no se apaga la verificación`);
    if (cert) informe.medido.push(`certificado presentado: ${cert.altnames ?? 'sin nombres alternativos'} · vence ${cert.vence ?? 's/f'} · emisor ${cert.emisor ?? 's/f'}`);
    const alt = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
    if (cert?.altnames && new RegExp(`DNS:${escaparRe(alt)}(,|$)`).test(cert.altnames)) {
      const otra = new URL(u.href); otra.hostname = alt;
      const r = await pedir(otra.href, { ...via, timeoutMs: 15_000 });
      informe.alternativa = { url: otra.href, status: r.ok ? r.status : null, falla: r.ok ? null : r.falla.codigo };
      informe.medido.push(`el certificado sí corresponde a ${alt}: ${otra.href} da ${r.ok ? `HTTP ${r.status}` : `sin respuesta (${r.falla.codigo})`}; cambiar de host lo decide quien escribe el conector`);
    }
    return;
  }
  // intermedio faltante: se sigue el AIA (hasta 3 saltos) y se comprueba que con lo bajado la cadena verifica
  let aia = cert?.aia;
  if (!aia) { informe.sinMedir.push('el intermedio que falta: el certificado no dice dónde está su emisor (AIA)'); return; }
  const pems = [], fuentes = [];
  for (let n = 0; n < 3 && aia; n++) {
    const r = await pedir(aia, { ...via, timeoutMs: 10_000, tope: 64 * 1024 });
    if (!es2xx(r)) { informe.sinMedir.push(`el intermedio que falta: no se pudo bajar de ${aia}`); return; }
    const pem = r.texto().includes('BEGIN CERTIFICATE') ? r.texto() : aPem(r.bytes);
    pems.push(pem); fuentes.push(aia);
    if (await verificaCon(host, port, pems)) {
      informe.medido.push(`TLS: el sitio no manda el intermedio (${falla.codigo}); bajado de ${fuentes.join(' y ')} y con eso la cadena verifica: va en caIntermedios`);
      informe.caIntermedios = pems;
      return;
    }
    try { aia = /CA Issuers - URI:(\S+)/.exec(new X509Certificate(pem).infoAccess ?? '')?.[1] ?? null; } catch { aia = null; }
  }
  informe.medido.push(`TLS: el sitio no manda el intermedio (${falla.codigo}); bajado de ${fuentes.join(' y ')}, pero ni con eso la cadena verifica contra las raíces de Node`);
}

// ---------- la sonda ----------

export const describirTipo = (t) => DESCRIPCION[t] ?? 'sin medir';

function variante(prueba, r) {
  return r.ok ? { prueba, status: r.status, contentType: mime(r.contentType), bytes: r.tamano, ms: r.ms } : { prueba, falla: r.falla.codigo, ms: r.ms };
}
const lineaVariante = (v) => `${v.prueba}: ${v.falla ? `sin respuesta útil (${v.falla})` : `HTTP ${v.status} · ${v.contentType || 'sin content-type'} · ${kb(v.bytes)} · ${seg(v.ms)}`}`;

function diferencia(a, b) {
  if (!a.ok || !b.ok) return a.ok === b.ok ? null : `${a.ok ? a.status : a.falla.codigo} con UA propio, ${b.ok ? b.status : b.falla.codigo} con UA de navegador`;
  if (a.status !== b.status) return `HTTP ${a.status} con UA propio, ${b.status} con UA de navegador`;
  if (mime(a.contentType) !== mime(b.contentType)) return `${mime(a.contentType)} con UA propio, ${mime(b.contentType)} con UA de navegador`;
  const m = Math.max(a.tamano, b.tamano) || 1;
  return Math.abs(a.tamano - b.tamano) / m > 0.2 ? `${kb(a.tamano)} con UA propio, ${kb(b.tamano)} con UA de navegador` : null;
}

async function resolverProxy(proxy, env) {
  if (!proxy) return null;
  const codigo = /^[a-z]{2}$/i.test(proxy) ? proxy.toLowerCase() : null;
  const uri = codigo ? proxyDe(codigo, env) : proxy;
  if (!uri) return { error: `no hay ACOMETIDA_PROXY_${codigo.toUpperCase()}` };
  try {
    const undici = await import('undici');
    // el dispatcher de undici en npm no siempre es compatible con el fetch de Node: va con su propio fetch
    return { codigo, dispatcher: new undici.ProxyAgent({ uri }), fetchImpl: undici.fetch };
  } catch {
    return { error: 'falta undici para salir por proxy (npm i undici)' };
  }
}

/**
 * Mide un link y devuelve el informe.
 * @param {string} url
 * @param {{ env?: object, fetchImpl?: typeof fetch, proxy?: string, timeoutMs?: number, trazaUrl?: string, ahora?: () => Date }} [o]
 *   `proxy`: URL del proxy o código de país (lee ACOMETIDA_PROXY_XX de `env`). El proxy nunca se escribe en el informe.
 */
export async function sondear(url, o = {}) {
  const env = o.env ?? process.env;
  const base = { fetchImpl: o.fetchImpl ?? fetch, timeoutMs: o.timeoutMs ?? 25_000 };
  const u = new URL(url);
  const inf = { url: u.href, medidoEn: (o.ahora ?? (() => new Date()))().toISOString(), desde: null, proxy: null, salida: 'directa',
    respuesta: null, variantes: [], uaCambia: null, falla: null, tipo: null, filas: null, fecha: null, robots: null,
    feeds: [], sitemaps: [], xhr: [], archivo: null, canario: null, nombre: null, acceso: null, plazoMs: base.timeoutMs, medido: [], sinMedir: [] };

  const desde = await paisDeSalida({ ...base, trazaUrl: o.trazaUrl });
  inf.desde = desde.pais;
  if (!desde.pais) inf.sinMedir.push(`país de salida: ${desde.motivo}`);
  const lugar = desde.pais ?? 'un país sin medir';

  const px = await resolverProxy(o.proxy, env);
  if (px?.error) inf.sinMedir.push(`por proxy: ${px.error}`);
  let via = base;
  const directo = await pedir(u.href, base);
  let principal = directo;
  inf.variantes.push(variante(`UA propio desde ${lugar}`, directo));
  if (px?.dispatcher) {
    const porProxyBase = { ...base, dispatcher: px.dispatcher, fetchImpl: o.fetchImpl ?? px.fetchImpl };
    const pp = await paisDeSalida({ ...porProxyBase, trazaUrl: o.trazaUrl });
    const salidaProxy = px.codigo ?? pp.pais?.toLowerCase() ?? null;
    const porProxy = await pedir(u.href, porProxyBase);
    inf.proxy = { pais: pp.pais, salida: salidaProxy };
    inf.variantes.push(variante(`UA propio por proxy (${pp.pais ?? 'país sin medir'})`, porProxy));
    if (!pp.pais) inf.sinMedir.push(`país del proxy: ${pp.motivo}`);
    if (!directo.ok && porProxy.ok) {
      principal = porProxy; via = porProxyBase;
      inf.salida = salidaProxy ?? 'COMPLETAR';
      inf.medido.push(`desde ${lugar} no responde (${directo.falla.codigo}); por el proxy (${pp.pais ?? 'país sin medir'}) sí: la ficha sale por ese país`);
    }
  }

  if (!principal.ok) {
    inf.falla = principal.falla;
    const f = principal.falla;
    if (f.tipo === 'sin_respuesta') {
      inf.medido.push(`sin medir desde ${lugar}: sin respuesta en ${seg(principal.ms)} (${f.codigo})`);
      inf.sinMedir.push(`todo lo demás: la fuente no respondió desde ${lugar}${o.proxy ? '' : '; repetir con --proxy por otro país'}`);
    } else if (f.tipo === 'tls_fuente' || f.tipo === 'tls_intermedio') {
      await medirTls(u, f, via, inf);
      if (inf.caIntermedios) {
        // con el intermedio la cadena verifica: se sigue midiendo con él, verificación activa
        const undici = await import('undici').catch(() => null);
        if (undici) {
          via = { ...via, fetchImpl: o.fetchImpl ?? undici.fetch, dispatcher: new undici.Agent({ connect: { ca: [...tls.rootCertificates, ...inf.caIntermedios] } }) };
          principal = await pedir(u.href, via);
          inf.variantes.push(variante('UA propio con el intermedio', principal));
        } else inf.sinMedir.push('el resto con el intermedio: falta undici (npm i undici)');
      }
      if (!principal.ok) inf.sinMedir.push('tipo, filas, cabeceras y robots.txt: la conexión no verifica');
    } else {
      inf.medido.push(`la fuente no responde desde ${lugar}: ${f.tipo} (${f.codigo})`);
      inf.sinMedir.push('todo lo demás: sin conexión');
    }
    if (!principal.ok) return cerrar(inf);
    inf.falla = null;
  }

  inf.respuesta = { status: principal.status, urlFinal: principal.url, redirecciones: principal.cadena, contentType: principal.contentType, bytes: principal.tamano, truncado: principal.truncado, ms: principal.ms };
  const saltos = principal.cadena.length ? ` · ${principal.cadena.length} redirección(es): ${principal.cadena.map((c) => c.status).join(', ')} → ${principal.url}` : ' · sin redirecciones';
  inf.medido.push(`respuesta con UA propio (Accept por defecto, */*): HTTP ${principal.status} · ${mime(principal.contentType) || 'sin content-type'} · ${kb(principal.tamano)}${principal.truncado ? ' (cortado al tope)' : ''} · ${seg(principal.ms)}${saltos}`);

  const navegador = await pedir(u.href, { ...via, ua: UA_NAVEGADOR });
  inf.variantes.push(variante('UA de navegador', navegador));
  inf.uaCambia = diferencia(principal, navegador);
  inf.medido.push(inf.uaCambia ? `cambia con UA de navegador: ${inf.uaCambia}` : 'UA de navegador: igual que el UA propio');

  let elegida = null, uaNavegador = false, cabeceras = {};
  if (es2xx(principal)) elegida = principal;
  else if (es2xx(navegador)) { elegida = navegador; uaNavegador = true; inf.medido.push(`el UA propio da ${principal.status} y el de navegador 200: la ficha usa UA de navegador`); }
  else if ((principal.status >= 400 && principal.status < 500) || (navegador.status >= 400 && navegador.status < 500)) {
    for (const nav of [false, true]) {
      for (const tipo of ['application/json', 'application/xml']) {
        const r = await pedir(u.href, { ...via, ua: nav ? UA_NAVEGADOR : UA_ACOMETIDA, cabeceras: { Accept: tipo } });
        const v = variante(`${nav ? 'UA de navegador' : 'UA propio'} + Accept: ${tipo}`, r);
        inf.variantes.push(v);
        inf.medido.push(lineaVariante(v));
        if (es2xx(r) && !elegida) { elegida = r; uaNavegador = nav; cabeceras = { Accept: tipo }; }
      }
      if (elegida) break;
    }
    if (elegida) inf.medido.push(`el ${principal.status} se arregla con la cabecera Accept: ${cabeceras.Accept}${uaNavegador ? ' y UA de navegador' : ''}`);
  }

  inf.robots = await medirRobots(u, via, inf);
  if (!elegida) {
    inf.falla = { tipo: 'http', codigo: `HTTP ${principal.status}`, detalle: `la fuente responde ${principal.status} con UA propio, de navegador y con Accept` };
    inf.medido.push(`falla de la fuente: ${inf.falla.detalle}`);
    inf.sinMedir.push('tipo, filas y fecha: ninguna variante dio 2xx');
    return cerrar(inf, { uaNavegador, cabeceras });
  }

  inf.tipo = tipoDe(elegida);
  inf.medido.push(`tipo: ${describirTipo(inf.tipo)}`);
  await medirForma(elegida, inf, via);
  if (/(?:^|[/=_-])(\d{4})-?(\d{2})-?(\d{2})(?:$|[/?&._-])/.test(`${u.pathname}${u.search}`)) {
    inf.urlConFecha = true;
    inf.medido.push('la URL lleva una fecha: descubrir debería recorrer por día desde el cursor');
  }
  return cerrar(inf, { uaNavegador, cabeceras, ritmoCrawl: inf.robots?.crawlDelay });
}

async function medirRobots(u, via, inf) {
  const r = await pedir(new URL('/robots.txt', u).href, { ...via, timeoutMs: 10_000, tope: 512 * 1024 });
  if (!r.ok) { inf.sinMedir.push(`robots.txt: ${r.falla.codigo}`); return null; }
  if (r.status !== 200 || pareceHtml(r.bytes)) { inf.medido.push(`robots.txt: no hay (HTTP ${r.status}${r.status === 200 ? ', llegó HTML' : ''})`); return { status: r.status, sitemaps: [], prohibe: false, regla: null, crawlDelay: null }; }
  const a = analizarRobots(r.texto(), `${u.pathname}${u.search}`);
  inf.sitemaps = a.sitemaps;
  inf.medido.push(`robots.txt: ${a.prohibe ? `PROHÍBE esta ruta (${a.regla})` : 'permite esta ruta'} · ${a.sitemaps.length} línea(s) Sitemap${a.crawlDelay ? ` · Crawl-delay ${a.crawlDelay} s` : ''}`);
  return { status: 200, ...a };
}

async function medirForma(r, inf, via) {
  const t = inf.tipo;
  const texto = r.texto();
  if (t === 'api_json') {
    const j = JSON.parse(texto);
    const f = filasJson(j);
    inf.nombre = typeof j?.description === 'string' ? j.description : null;
    if (!f) { inf.sinMedir.push('qué es una fila: el JSON no trae un arreglo de objetos (¿es un solo documento?)'); return; }
    inf.filas = f;
    inf.medido.push(`fila: ${f.que} · ${f.cuantas} en esta respuesta${f.total ? ` · total en \`${f.total}\`: ${j[f.total]}` : ''}${f.paginacion.length ? ` · paginación: ${f.paginacion.join(', ')}` : ''}`);
    inf.medido.push(`campos: ${f.claves.slice(0, 25).join(', ')}${f.claves.length > 25 ? ', …' : ''}`);
    fechaYCanario(inf, f, (k) => f.primera[k], r.url);
    fechaDelDocumento(inf, f);
  } else if (t === 'api_xml') {
    const f = filasXml(texto);
    if (!f) { inf.sinMedir.push('qué es una fila: no hay una etiqueta con hijos que se repita'); return; }
    inf.filas = f;
    inf.medido.push(`fila: ${f.que} · ${f.cuantas} en esta respuesta · campos: ${f.claves.join(', ')}`);
    fechaYCanario(inf, f, (k) => valor(f.primera, k), r.url);
    fechaDelDocumento(inf, f);
  } else if (t === 'feed_atom' || t === 'feed_rss') {
    const entradas = leerFeed(texto);
    inf.nombre = valor(texto.replace(/<(entry|item)\b[\s\S]*$/i, ''), 'title');
    const e0 = bloques(texto, t === 'feed_atom' ? 'entry' : 'item')[0]?.interior ?? '';
    const campo = ['published', 'pubDate', 'updated', 'issued', 'date'].find((k) => valor(e0, k) && normalizarFecha(valor(e0, k)));
    inf.filas = { que: t === 'feed_atom' ? 'cada <entry>' : 'cada <item>', cuantas: entradas.length, campos: { id: 'id', url: 'url', titulo: 'titulo', fecha: 'fecha', texto: 'resumen' } };
    inf.medido.push(`fila: ${inf.filas.que} · ${entradas.length} en el feed · ${entradas.filter((e) => e.fecha).length} con fecha legible`);
    if (campo) { inf.fecha = { campo, ejemplo: valor(e0, campo), nivel: 'fila' }; inf.medido.push(`fecha de publicación: <${campo}> (ej. ${valor(e0, campo)})`); }
    else inf.sinMedir.push('fecha de publicación: las entradas no traen una fecha legible');
    if (entradas[0]?.url) inf.canario = { id: r.url, url: r.url };
  } else if (t === 'sitemap') {
    const e = leerSitemap(texto);
    inf.filas = { que: e[0]?.esSitemap ? 'cada <sitemap> (es un índice: cada entrada es otro sitemap)' : 'cada <url>', cuantas: e.length, esIndice: Boolean(e[0]?.esSitemap) };
    inf.medido.push(`fila: ${inf.filas.que} · ${e.length} entradas · ${e.filter((x) => x.fecha).length} con <lastmod>`);
    inf.sinMedir.push('fecha de publicación: <lastmod> es la última modificación, no la publicación');
    const doc = e.find((x) => !x.esSitemap);
    if (doc) inf.canario = { id: doc.url, url: doc.url };
  } else if (t === 'html' || t === 'html_buscador' || t === 'webforms') {
    inf.nombre = textoXml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(texto)?.[1] ?? '') || null;
    inf.feeds = feedsDe(texto, r.url);
    inf.medido.push(inf.feeds.length ? `feeds declarados (<link rel="alternate">): ${inf.feeds.map((f) => f.url).join(', ')}` : 'feeds declarados en el HTML: ninguno');
    if (inf.feeds[0]) {
      const fr = await pedir(inf.feeds[0].url, { ...via, timeoutMs: 15_000 });
      const n = es2xx(fr) ? leerFeed(fr.texto()).length : 0;
      inf.medido.push(`el feed ${inf.feeds[0].url} ${es2xx(fr) ? `responde 200 con ${n} entradas: conviene descubrir por ahí` : `no responde bien (${fr.ok ? `HTTP ${fr.status}` : fr.falla.codigo})`}`);
    }
    const form = formularioDeBusqueda(texto);
    if (form) inf.medido.push(`buscador: <form ${form.metodo} ${form.accion || '(misma página)'}> con el campo \`${form.campo}\``);
    if (t === 'webforms') {
      const eventos = [...new Set([...texto.matchAll(/__doPostBack\(\s*'([^']+)'\s*,\s*'([^']*)'/g)].map((m) => `${m[1]} ${m[2]}`))].slice(0, 5);
      inf.webforms = { eventos };
      inf.medido.push(`WebForms: paginar o buscar es un POST con __VIEWSTATE y __EVENTVALIDATION${eventos.length ? `; postbacks vistos: ${eventos.join(' | ')}` : ''}`);
    }
    const f = filasHtml(texto, r.url);
    if (!f) { inf.sinMedir.push('qué es una fila: no hay un bloque repetido con enlaces'); return; }
    inf.filas = f;
    inf.medido.push(`fila (posible): ${f.que} · ${f.cuantas} en la página`);
    if (f.fecha) { inf.fecha = { ...f.fecha, nivel: 'fila' }; inf.medido.push(`fecha visible: ${f.fecha.campo} (ej. ${f.fecha.ejemplo})`); }
    else inf.sinMedir.push('fecha de publicación: no se ve en la mayoría de las filas de la lista');
    const doc = f.enlaces.find((h) => h !== r.url);
    if (doc) inf.canario = { id: doc, url: doc };
  } else if (t === 'spa') {
    inf.nombre = textoXml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(texto)?.[1] ?? '') || null;
    const base = new URL(atributos(/<base\b([^>]*)>/i.exec(texto)?.[1] ?? '').href ?? '', r.url);
    const scripts = scriptsDe(texto).map((s) => new URL(s, base)).filter((s) => registrable(s.hostname) === registrable(new URL(r.url).hostname));
    const orden = scripts.sort((a, b) => Number(/main|app|index/i.test(b.pathname)) - Number(/main|app|index/i.test(a.pathname))).slice(0, 3);
    for (const s of orden) {
      const js = await pedir(s.href, { ...via, timeoutMs: 20_000 });
      if (es2xx(js) && !pareceHtml(js.bytes)) inf.xhr.push(...xhrDe(js.texto(), r.url).filter((x) => !inf.xhr.includes(x)));
      else inf.sinMedir.push(`bundle ${s.pathname}: ${js.ok ? (pareceHtml(js.bytes) ? 'llegó HTML' : `HTTP ${js.status}`) : js.falla.codigo}`);
    }
    inf.medido.push(`SPA: HTML de ${kb(r.tamano)} con ${scriptsDe(texto).length} script(s); bundles leídos: ${orden.map((s) => s.pathname.split('/').pop()).join(', ') || 'ninguno'}`);
    inf.medido.push(inf.xhr.length ? `candidatos a XHR leídos del bundle (sin confirmar): ${inf.xhr.slice(0, 12).join(' · ')}` : 'el bundle no deja ver URLs de API');
    inf.sinMedir.push('XHR reales: hace falta abrir la página en un navegador y mirar la pestaña Red');
    inf.sinMedir.push('qué es una fila y su fecha: el HTML llega vacío; depende del XHR');
  } else if (t.startsWith('archivo_')) {
    const lm = r.cabeceras['last-modified'] ?? null, et = r.cabeceras.etag ?? null;
    inf.archivo = { lastModified: lm, etag: et };
    inf.medido.push(`archivo: ${kb(r.tamano)} · Last-Modified ${lm ?? 'no viene'} · ETag ${et ?? 'no viene'}`);
    inf.sinMedir.push('si el archivo se actualiza: hace falta una segunda sonda otro día (o comparar el sha256 en cada corrida)');
    if (t === 'archivo_csv') {
      const [cab, f1] = texto.split(/\r?\n/);
      const sep = (cab.match(/;/g)?.length ?? 0) > (cab.match(/,/g)?.length ?? 0) ? ';' : ',';
      const claves = cab.split(sep).map((x) => x.replace(/^"|"$/g, '').trim());
      const v = (f1 ?? '').split(sep).map((x) => x.replace(/^"|"$/g, '').trim());
      inf.filas = { que: 'cada renglón del CSV', cuantas: texto.split(/\r?\n/).filter(Boolean).length - 1, claves, separador: sep };
      inf.medido.push(`fila: cada renglón · columnas: ${claves.join(', ')}`);
      const fc = elegirFecha(claves, (k) => v[claves.indexOf(k)]);
      if (fc) { inf.fecha = { ...fc, nivel: 'fila' }; inf.medido.push(`fecha: columna \`${fc.campo}\` (ej. ${fc.ejemplo})`); }
    } else inf.sinMedir.push('qué es una fila y su fecha: hay que leer el archivo (lector con modelo, ctx.leerConModelo)');
    inf.canario = { id: r.url, url: r.url };
  } else {
    inf.sinMedir.push(`qué es una fila: ${describirTipo(t)}`);
  }
}

function fechaDelDocumento(inf, f) {
  if (f.fecha || !f.fechaDoc) return;
  inf.fecha = { campo: f.fechaDoc.campo, ejemplo: f.fechaDoc.ejemplo, nivel: 'documento' };
  inf.medido.push(`fecha de publicación: no va en la fila; la trae el documento en \`${f.fechaDoc.campo}\` (ej. ${f.fechaDoc.ejemplo})`);
}

function fechaYCanario(inf, f, valorDe, urlLista) {
  if (f.fecha) { inf.fecha = { ...f.fecha, nivel: 'fila' }; inf.medido.push(`fecha de publicación: \`${f.fecha.campo}\` (ej. ${f.fecha.ejemplo})`); }
  else if (!f.fechaDoc) inf.sinMedir.push('fecha de publicación: ningún campo de la fila se lee como fecha');
  inf.medido.push(`clave: ${f.id ? `\`${f.id}\` (ej. ${valorDe(f.id)})` : 'sin campo de identificador evidente'} · enlace: ${f.url ? `\`${f.url}\`` : 'ninguno'} · título: ${f.titulo ? `\`${f.titulo}\`` : 'ninguno'}`);
  inf.canario = { id: urlLista, url: urlLista };
}

/** Arma la ficha propuesta y las líneas del resumen. */
function cerrar(inf, { uaNavegador = false, cabeceras = {}, ritmoCrawl = null } = {}) {
  const t = inf.tipo;
  const porMinuto = Math.max(1, Math.min(10, ritmoCrawl ? Math.floor(60 / ritmoCrawl) : 10));
  inf.acceso = {
    salida: inf.salida, uaNavegador, cabeceras,
    esperado: t?.startsWith('archivo_') ? 'archivo' : t === 'api_json' ? 'json' : /xml|feed|sitemap/.test(t ?? '') ? 'xml' : 'html',
    ritmo: { porMinuto }, timeoutMs: 30_000, intentos: 3,
    ...(inf.caIntermedios ? { caIntermedios: inf.caIntermedios } : {}),
  };
  if (inf.robots?.prohibe) inf.sinMedir.push('permiso: robots.txt prohíbe esta ruta; usarla es decisión de quien instala');
  return inf;
}

/** Resumen corto para la consola (sin raya larga). */
export function resumir(inf, fuente) {
  const estado = inf.falla
    ? inf.falla.tipo === 'sin_respuesta' ? `sin medir desde ${inf.desde ?? 'un país sin medir'}` : `falla de la fuente: ${inf.falla.codigo}`
    : `${describirTipo(inf.tipo)} · HTTP ${inf.respuesta?.status}`;
  const extra = [inf.acceso?.cabeceras?.Accept && `Accept: ${inf.acceso.cabeceras.Accept}`, inf.acceso?.uaNavegador && 'UA de navegador', inf.acceso?.caIntermedios && 'con intermedio TLS'].filter(Boolean);
  return [`${fuente} · ${estado}${extra.length ? ` · ${extra.join(' · ')}` : ''} · desde ${inf.desde ?? 'país sin medir'}`,
    ...(inf.sinMedir.length ? [`sin medir: ${inf.sinMedir.length} punto(s), ver el informe`] : [])].join('\n');
}

/** Nombre de fuente válido (`[a-z][a-z0-9_]{1,40}`) desde un texto o un host. */
export function nombreDeFuente(s) {
  const n = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const v = /^[a-z]/.test(n) ? n : `f_${n}`;
  return v.slice(0, 41).replace(/_+$/, '');
}

function escribirNuevo(ruta, contenido) {
  const fd = openSync(ruta, 'wx'); // falla si existe: nunca se sobrescribe
  try { writeSync(fd, contenido); } finally { closeSync(fd); }
}

/**
 * `acometida nuevo <url>`: sondea y escribe `fuentes/<nombre>.mjs` y `fuentes/<nombre>.md`. Nunca sobrescribe.
 * @param {string} url
 * @param {{ dir?: string, nombre?: string, proxy?: string, env?: object, fetchImpl?: typeof fetch, timeoutMs?: number, trazaUrl?: string, log?: (s:string)=>void }} [o]
 * @returns {Promise<{ archivo: string, informe: object, rutaInforme: string }>}
 */
export async function nuevo(url, o = {}) {
  const env = o.env ?? process.env;
  const fuente = nombreDeFuente(o.nombre ?? new URL(url).hostname);
  const dir = join(carpetaDe(o.dir, env), 'fuentes');
  const archivo = join(dir, `${fuente}.mjs`);
  const rutaInforme = join(dir, `${fuente}.md`);
  for (const r of [archivo, rutaInforme]) if (existsSync(r)) throw new Error(`ya existe ${r}: no se sobrescribe (usa --nombre para otro)`);
  const informe = await sondear(url, { ...o, env });
  mkdirSync(dir, { recursive: true });
  escribirNuevo(archivo, conectorDe(informe, fuente));
  escribirNuevo(rutaInforme, informeDe(informe, fuente));
  (o.log ?? console.log)(`${resumir(informe, fuente)}\n${archivo}\n${rutaInforme}`);
  return { archivo, informe, rutaInforme };
}
