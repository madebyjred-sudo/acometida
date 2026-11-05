/**
 * Lo que escribe `acometida nuevo`: el esqueleto del conector (ficha llena con lo medido + descubrir y leer por tipo)
 * y el informe de la sonda en Markdown. Lo que la sonda no pudo decidir queda marcado COMPLETAR.
 * El conector no importa nada de Acometida: usa `ctx.ayudas` (leerFeed, leerSitemap, textoDeHtml, bloques, valor, fecha).
 */
import { UA_ACOMETIDA, UA_NAVEGADOR } from './traer.mjs';

export const DESCRIPCION = {
  api_json: 'API JSON', api_xml: 'API XML', feed_atom: 'feed Atom', feed_rss: 'feed RSS', sitemap: 'sitemap',
  html: 'HTML', html_buscador: 'HTML con buscador', webforms: 'ASP.NET WebForms (__VIEWSTATE)', spa: 'SPA que carga por JS',
  archivo_pdf: 'archivo PDF', archivo_csv: 'archivo CSV', archivo_xlsx: 'archivo XLSX', archivo_zip: 'archivo ZIP', texto: 'texto plano', desconocido: 'forma desconocida',
};

const J = (v) => JSON.stringify(v);
const dia = (iso) => iso.slice(0, 10);
const hora = (iso) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1).replace('.', ',')} KB`);
const seg = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const listaDe = (inf) => J(inf.respuesta?.urlFinal ?? inf.url);

function plantillaDe(t) {
  if (['api_json', 'api_xml', 'feed_atom', 'feed_rss'].includes(t)) return 'lista';
  if (['html', 'html_buscador', 'webforms'].includes(t)) return 'paginas';
  if (t === 'sitemap' || t === 'spa') return t;
  if (t?.startsWith('archivo_')) return 'archivo';
  return 'sinMedir';
}

function ficha(inf, fuente, plantilla) {
  const f = {
    fuente,
    nombre: inf.nombre || new URL(inf.url).hostname,
    leidoCon: `${fuente}@1`,
    cuandoUsar: 'COMPLETAR: qué preguntas responde esta fuente',
    cuandoNo: 'COMPLETAR: qué preguntas parecen de esta fuente y no lo son',
    acceso: inf.acceso,
    frescura: { cadaHoras: 24 },
  };
  const campos = plantilla === 'lista' ? ['clave', 'titulo', ...(inf.fecha ? ['fecha'] : [])] : plantilla === 'archivo' ? ['clave', 'texto'] : ['clave', 'titulo', 'texto'];
  if (inf.canario) f.canario = { pendiente: inf.canario, campos };
  return f;
}

// ---------- cuerpos por tipo ----------

const LEER_HTML = `  leer(crudo, ctx) {
    const { textoDeHtml } = ctx.ayudas;
    const html = crudo.texto();
    const titulo = textoDeHtml(/<h1\\b[^>]*>([\\s\\S]*?)<\\/h1>/i.exec(html)?.[1] ?? /<title\\b[^>]*>([\\s\\S]*?)<\\/title>/i.exec(html)?.[1] ?? '') || null;
    return [{ clave: crudo.url, titulo, texto: textoDeHtml(html), fecha: null /* COMPLETAR: de dónde sale la fecha de publicación */, url: crudo.url }];
  },`;

function lista(inf) {
  const t = inf.tipo, f = inf.filas ?? {};
  let filasDe, campos;
  if (t === 'api_json') {
    const doc = !f.fecha && f.fechaDoc ? f.fechaDoc.campo : null;
    campos = { id: f.id ?? null, url: f.url ?? null, titulo: f.titulo ?? null, texto: f.texto ?? null, fecha: f.fecha?.campo ?? doc };
    filasDe = `const RUTA = ${J(f.ruta ?? '')}; // dónde vienen las filas; los arreglos del camino se aplanan
${doc ? `const DOC = ${J(doc)}; // la fecha no va en la fila: la trae el documento\n` : ''}${f.ruta?.startsWith('**.') ? `// la fila cuelga de \`${f.ruta.slice(3)}\` a distintas profundidades: se junta toda\n` : ''}const plano = (xs) => xs.flatMap((x) => (Array.isArray(x) ? x : [x]));
const recorrer = (v, ruta) => {
  if (ruta.startsWith('**.')) {
    const k = ruta.slice(3), out = [];
    const ir = (x) => { if (Array.isArray(x)) return x.forEach(ir); if (!x || typeof x !== 'object') return; if (x[k] != null) out.push(x[k]); Object.entries(x).forEach(([c, y]) => c !== k && ir(y)); };
    ir(v);
    return plano(out).filter((x) => x && typeof x === 'object');
  }
  let actual = [v];
  for (const k of ruta ? ruta.split('.') : []) actual = plano(actual).map((x) => x?.[k]).filter((x) => x != null);
  return plano(actual).filter((x) => x && typeof x === 'object');
};
const filasDe = (crudo) => {
  const j = JSON.parse(crudo.texto());
  ${doc ? 'const delDocumento = DOC.split(\'.\').reduce((x, k) => x?.[k], j);\n  return recorrer(j, RUTA).map((f) => ({ ...f, [DOC]: delDocumento }));' : 'return recorrer(j, RUTA);'}
};`;
  } else if (t === 'api_xml') {
    const doc = !f.fecha && f.fechaDoc ? f.fechaDoc.campo : null;
    campos = { id: f.id ?? null, url: f.url ?? null, titulo: f.titulo ?? null, texto: f.texto ?? f.titulo ?? null, fecha: f.fecha?.campo ?? doc };
    filasDe = `const FILA = ${J(f.etiqueta ?? 'COMPLETAR')};
const CLAVES = ${J(f.claves ?? [])};
${doc ? `// la fecha no va en la fila: la trae el documento en <${doc}>\n` : ''}const filasDe = (crudo, { bloques, valor }) => {
  const xml = crudo.texto();
  ${doc ? `const delDocumento = valor(xml, ${J(doc)});\n  ` : ''}return bloques(xml, FILA).map(({ interior }) => ({ ...Object.fromEntries(CLAVES.map((k) => [k, valor(interior, k)]))${doc ? `, ${J(doc)}: delDocumento` : ''} }));
};`;
  } else {
    campos = { id: 'id', url: 'url', titulo: 'titulo', texto: 'resumen', fecha: inf.fecha ? 'fecha' : null };
    filasDe = '// el texto es el resumen del feed; COMPLETAR si hace falta el documento entero\nconst filasDe = (crudo, { leerFeed }) => leerFeed(crudo.texto());';
  }
  const paginacion = f.paginacion?.length ? ` (${f.paginacion.join(', ')})` : '';
  const descubrir = campos.fecha
    ? `  async *descubrir(cursor, ctx) {
    const desde = cursor?.marca ?? '';
    const crudo = await ctx.traer(LISTA, { esperado: ficha.acceso.esperado });
    const fechas = filasDe(crudo, ctx.ayudas).map((f) => fechaDe(f, ctx.ayudas)).filter((x) => x && x > desde).sort();
    // COMPLETAR: esto lee la primera página; si entre corridas se publica más de una, recorrer la paginación${paginacion}
    if (!fechas.length) return ctx.probarSinPublicaciones(\`la lista no trae nada posterior a \${desde || 'el inicio'}\`);
    yield { id: \`\${LISTA}#\${fechas.at(-1)}\`, url: LISTA, crudo, desde, cursor: { marca: fechas.at(-1) } };
  },`
    : `  async *descubrir(cursor, ctx) {
    // sin fecha en la fila no hay cursor por fecha: cada corrida relee la lista y el motor guarda solo lo que cambió.
    // COMPLETAR: cómo probar que la fuente no publicó (sin eso la corrida queda en amarillo)
    const crudo = await ctx.traer(LISTA, { esperado: ficha.acceso.esperado });
    yield { id: LISTA, url: LISTA, crudo };
  },`;
  return `const LISTA = ${listaDe(inf)};
${filasDe}
const CAMPOS = ${J(campos)};
const fechaDe = (f, { fecha }) => (CAMPOS.fecha ? fecha(f[CAMPOS.fecha]) : null);
${inf.urlConFecha ? '// la URL lleva una fecha: COMPLETAR para recorrer por día desde el cursor\n' : ''}
export default {
  ...ficha,
${descubrir}
  traer: (p, ctx) => p.crudo ?? ctx.traer(p.url, { esperado: ficha.acceso.esperado }),
  leer(crudo, ctx, p) {
    return filasDe(crudo, ctx.ayudas)
      .filter((f) => !p?.desde || (fechaDe(f, ctx.ayudas) ?? '') > p.desde)
      .map((f) => ({
        clave: String(f[CAMPOS.id] ?? f[CAMPOS.url] ?? ''),
        titulo: f[CAMPOS.titulo] ?? null,
        texto: f[CAMPOS.texto] ?? f[CAMPOS.titulo] ?? null,
        fecha: f[CAMPOS.fecha] ?? null,
        url: f[CAMPOS.url] ?? crudo.url,
        datos: f,
      }));
  },
};
`;
}

function paginas(inf) {
  const f = inf.filas;
  const notas = [
    f?.fecha && `// la lista muestra la fecha en ${f.fecha.campo} (ej. ${f.fecha.ejemplo})`,
    inf.tipo === 'webforms' && '// WebForms: la página 2 y la búsqueda son un POST con __VIEWSTATE, __EVENTVALIDATION y __EVENTTARGET',
    inf.feeds?.[0] && `// el HTML declara un feed: ${inf.feeds[0].url} (descubrir por ahí es más estable)`,
  ].filter(Boolean).join('\n');
  const descubrir = f
    ? `  async *descubrir(cursor, ctx) {
    const r = await ctx.traer(LISTA);
    const enlaces = [...new Set(enlacesDe(r.texto(), r.url))]; // COMPLETAR: confirmar que la lista va de la más nueva a la más vieja
    const corte = cursor?.ultimo ? enlaces.indexOf(cursor.ultimo) : -1;
    const nuevos = (corte >= 0 ? enlaces.slice(0, corte) : enlaces).reverse();
    if (!nuevos.length) return ctx.probarSinPublicaciones('la lista no trae enlaces nuevos');
    for (const url of nuevos) yield { id: url, url, cursor: { ultimo: url } };
  },`
    : `  async *descubrir() {
    throw new Error('COMPLETAR: la sonda no encontró qué es una fila en la lista');
  },`;
  return `const LISTA = ${listaDe(inf)};
${f ? `const MARCA = ${J(f.marca)}; // dónde empieza cada fila en la lista
const enlacesDe = (html, base) => html.split(MARCA).slice(1)
  .map((t) => /<a\\b[^>]*href=["']([^"'#][^"']*)["']/i.exec(t)?.[1])
  .filter((h) => h && !/^(javascript|mailto|tel):/i.test(h))
  .map((h) => new URL(h, base).href);
` : ''}${notas}

export default {
  ...ficha,
${descubrir}
${LEER_HTML}
};
`;
}

function sitemap(inf) {
  return `const LISTA = ${listaDe(inf)};
// <lastmod> es la última modificación, no la publicación

export default {
  ...ficha,
  async *descubrir(cursor, ctx) {
    const desde = cursor?.marca ?? '';
    const e = ctx.ayudas.leerSitemap((await ctx.traer(LISTA, { esperado: 'xml' })).texto());
    if (e[0]?.esSitemap) throw new Error('COMPLETAR: es un índice de sitemaps; elegir el sitemap hijo que trae lo nuevo');
    if (!e.some((x) => x.fecha)) throw new Error('COMPLETAR: el sitemap no trae <lastmod>; sin eso no se sabe qué es nuevo');
    const nuevas = e.filter((x) => x.fecha && x.fecha > desde).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (!nuevas.length) return ctx.probarSinPublicaciones(\`el sitemap no trae nada modificado después de \${desde || 'el inicio'}\`);
    for (const x of nuevas) yield { id: x.url, url: x.url, cursor: { marca: x.fecha } };
  },
${LEER_HTML}
};
`;
}

function spa(inf) {
  const xhr = inf.xhr?.length ? inf.xhr.slice(0, 12).map((x) => `//   ${x}`).join('\n') : '//   (el bundle no dejó ver ninguno)';
  return `// La página carga por JS. Candidatos a XHR leídos del bundle, sin confirmar:
${xhr}

export default {
  ...ficha,
  async *descubrir() {
    throw new Error('COMPLETAR: elegir el XHR que trae la lista (abrir la página con la pestaña Red) y leerlo aquí');
  },
${LEER_HTML}
};
`;
}

function archivo(inf) {
  const f = inf.filas ?? {};
  const leer = inf.tipo === 'archivo_csv'
    ? `  leer(crudo) {
    const SEP = ${J(f.separador ?? ',')}; // COMPLETAR: este corte no respeta comillas con el separador adentro
    const [cab, ...renglones] = crudo.texto().split(/\\r?\\n/).filter(Boolean);
    const col = cab.split(SEP).map((c) => c.replace(/^"|"$/g, '').trim());
    return renglones.map((l) => {
      const fila = Object.fromEntries(l.split(SEP).map((c, i) => [col[i], c.replace(/^"|"$/g, '').trim()]));
      return { clave: l /* COMPLETAR: la columna que identifica la fila */, titulo: null, texto: l, fecha: ${inf.fecha ? `fila[${J(inf.fecha.campo)}]` : 'null'}, url: crudo.url, datos: fila };
    });
  },`
    : `  leer(crudo, ctx) {
    return ctx.leerConModelo({
      bytes: crudo.bytes, contentType: crudo.contentType, url: crudo.url,
      campos: { clave: 'COMPLETAR: identificador estable de cada fila' },
      instrucciones: 'COMPLETAR: qué es una fila en este archivo y de dónde sale su fecha',
    });
  },`;
  return `const ARCHIVO = ${listaDe(inf)};
// Last-Modified: ${inf.archivo?.lastModified ?? 'no viene'} · ETag: ${inf.archivo?.etag ?? 'no viene'}

export default {
  ...ficha,
  async *descubrir(cursor, ctx) {
    const crudo = await ctx.traer(ARCHIVO, { esperado: 'archivo' });
    const hash = createHash('sha256').update(crudo.bytes).digest('hex');
    if (hash === cursor?.hash) return ctx.probarSinPublicaciones('el archivo no cambió (mismo sha256)');
    yield { id: \`\${ARCHIVO}#\${hash.slice(0, 12)}\`, url: ARCHIVO, crudo, cursor: { hash } };
  },
  traer: (p, ctx) => p.crudo ?? ctx.traer(p.url, { esperado: 'archivo' }),
${leer}
};
`;
}

function sinMedir(inf) {
  const motivo = inf.falla ? `${inf.falla.tipo} (${inf.falla.codigo})` : `forma ${DESCRIPCION[inf.tipo] ?? 'sin medir'}`;
  return `export default {
  ...ficha,
  async *descubrir() {
    throw new Error(${J(`sin medir: ${motivo}; ver el informe y volver a sondear`)});
  },
${LEER_HTML}
};
`;
}

const CUERPOS = { lista, paginas, sitemap, spa, archivo, sinMedir };

/** Código de `fuentes/<fuente>.mjs`. */
export function conectorDe(inf, fuente) {
  const p = plantillaDe(inf.falla ? null : inf.tipo);
  const fi = ficha(inf, fuente, p);
  return `/**
 * ${fi.nombre}: esqueleto escrito por \`acometida nuevo\` el ${dia(inf.medidoEn)} desde ${inf.desde ?? 'un país sin medir'}.
 * Lo medido está en ${fuente}.md. Lo marcado COMPLETAR lo decide quien lee la fuente.
 */
${p === 'archivo' ? "import { createHash } from 'node:crypto';\n\n" : ''}const ficha = ${JSON.stringify(fi, null, 2)};

${CUERPOS[p](inf)}`.replace(/\n{3,}/g, '\n\n');
}

// ---------- informe ----------

const celda = (s) => String(s).replace(/\|/g, '\\|');

/** Markdown de `fuentes/<fuente>.md`. */
export function informeDe(inf, fuente) {
  const pruebas = inf.variantes.map((v) => `| ${celda(v.prueba)} | ${v.falla ? `sin respuesta útil (${celda(v.falla)}) · ${seg(v.ms)}` : `HTTP ${v.status} · ${celda(v.contentType || 'sin content-type')} · ${kb(v.bytes)} · ${seg(v.ms)}`} |`);
  const acceso = inf.acceso?.caIntermedios ? { ...inf.acceso, caIntermedios: [`${inf.acceso.caIntermedios.length} PEM (en el .mjs)`] } : inf.acceso;
  return `# ${inf.nombre || new URL(inf.url).hostname} · \`${fuente}\`

Sonda del ${hora(inf.medidoEn)} desde ${inf.desde ?? 'un país sin medir'}${inf.proxy ? ` y por proxy (${inf.proxy.pais ?? 'país sin medir'})` : ''}. Vale para esa fecha: los sitios cambian.

- URL: ${inf.url}
- Tipo: ${inf.falla ? `sin medir (${inf.falla.tipo})` : DESCRIPCION[inf.tipo] ?? 'sin medir'}
- Medido con: \`acometida nuevo\`, UA propio \`${UA_ACOMETIDA}\`, UA de navegador \`${UA_NAVEGADOR}\`, plazo por pedido ${seg(inf.plazoMs ?? 25_000)}, país de salida por \`https://1.1.1.1/cdn-cgi/trace\` (\`loc=\`)

## Medido
${inf.medido.map((l) => `- ${l}`).join('\n')}

## Pruebas
| Prueba | Resultado |
|---|---|
${pruebas.join('\n')}

## Sin medir
${inf.sinMedir.length ? inf.sinMedir.map((l) => `- ${l}`).join('\n') : '- nada'}

## Acceso propuesto
\`\`\`json
${JSON.stringify(acceso, null, 2)}
\`\`\`

## Guía de lectura
- Qué es una fila:
- Clave estable:
- Fecha de publicación (campo y formato):
- Texto que se indexa:
- Cómo se descubre lo nuevo:
- Cuándo usarla:
- Cuándo no:
- Trampas conocidas:
`;
}
