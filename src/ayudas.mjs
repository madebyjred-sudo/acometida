/**
 * Ayudas para lectores: feeds RSS/Atom, sitemaps, XML simple y texto de HTML. Sin dependencias.
 * Las fechas salen normalizadas (AAAA-MM-DD) o nulas: nunca «ahora». El conector las recibe en `ctx.ayudas`.
 */
import { fecha as normalizarFecha } from './fecha.mjs';

const NOMBRADAS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª', deg: '°', euro: '€', copy: '©', reg: '®',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ccedil: 'ç',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü', Ccedil: 'Ç',
  agrave: 'à', egrave: 'è', ograve: 'ò', acirc: 'â', ecirc: 'ê', ocirc: 'ô', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

/** Decodifica entidades HTML/XML (nombradas comunes y numéricas). */
export function decodificar(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NOMBRADAS[e] ?? m;
  });
}

const escaparRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sinCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
/** Texto de un fragmento XML: sin CDATA, sin etiquetas, entidades decodificadas, espacios colapsados. */
export const textoXml = (s) => (s == null ? null : decodificar(sinCdata(String(s)).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());

/**
 * Bloques `<etiqueta ...>…</etiqueta>` (con o sin prefijo de espacio de nombres). Devuelve `{ attrs, interior }`.
 * No anida etiquetas iguales: alcanza para feeds, sitemaps y sumarios.
 */
export function bloques(xml, etiqueta) {
  const n = `(?:[\\w.-]+:)?${escaparRe(etiqueta)}`;
  const re = new RegExp(`<(${n})(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</\\1\\s*>)`, 'g');
  const out = [];
  for (const m of String(xml).matchAll(re)) out.push({ attrs: atributos(m[2] ?? ''), interior: m[3] ?? '' });
  return out;
}

/** Texto del primer `<etiqueta>` (o null). */
export function valor(xml, etiqueta) {
  const b = bloques(xml, etiqueta)[0];
  return b ? textoXml(b.interior) : null;
}

/** Atributos de una etiqueta: `href="x" rel='y'` → { href: 'x', rel: 'y' }. Claves en minúsculas. */
export function atributos(s) {
  const out = {};
  for (const m of String(s).matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = decodificar(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

// títulos y resúmenes de feed suelen venir con HTML escapado: se decodifica y se vuelven a quitar etiquetas
const plano = (s) => (s == null ? null : textoXml(textoXml(s)));
const fechaDe = (...vs) => { for (const v of vs) { const f = normalizarFecha(v); if (f) return f; } return null; };

/** RSS 2.0, RSS 1.0 (RDF) o Atom → `[{ id, titulo, url, fecha, resumen }]`. */
export function leerFeed(xml) {
  const s = String(xml ?? '');
  if (/<(?:[\w-]+:)?feed[\s>]/.test(s)) {
    return bloques(s, 'entry').map(({ interior: e }) => {
      const links = bloques(e, 'link').map((l) => l.attrs);
      const link = links.find((l) => !l.rel || l.rel === 'alternate') ?? links[0];
      const url = link?.href || null;
      return {
        id: valor(e, 'id') || url,
        titulo: plano(valor(e, 'title')),
        url,
        fecha: fechaDe(valor(e, 'published'), valor(e, 'updated'), valor(e, 'issued'), valor(e, 'created')),
        resumen: plano(valor(e, 'summary') ?? valor(e, 'content')),
      };
    });
  }
  return bloques(s, 'item').map(({ attrs, interior: e }) => {
    const url = valor(e, 'link') || attrs['rdf:about'] || null;
    return {
      id: valor(e, 'guid') || attrs['rdf:about'] || url,
      titulo: plano(valor(e, 'title')),
      url,
      fecha: fechaDe(valor(e, 'pubDate'), valor(e, 'date'), valor(e, 'published'), valor(e, 'updated')),
      resumen: plano(valor(e, 'description') ?? valor(e, 'encoded')),
    };
  });
}

/** Sitemap o índice de sitemaps → `[{ url, fecha, esSitemap }]` (`esSitemap`: la entrada es otro sitemap). */
export function leerSitemap(xml) {
  const s = String(xml ?? '');
  const indice = /<(?:[\w-]+:)?sitemapindex[\s>]/.test(s);
  return bloques(s, indice ? 'sitemap' : 'url')
    .map(({ interior }) => ({ url: valor(interior, 'loc'), fecha: fechaDe(valor(interior, 'lastmod')), esSitemap: indice }))
    .filter((e) => e.url);
}

const BLOQUE = /<\/?(?:p|div|br|li|ul|ol|tr|table|h[1-6]|section|article|header|footer|blockquote|pre|dd|dt|dl|hr|title)\b[^>]*>/gi;

/** Texto legible de un HTML: sin scripts, estilos ni comentarios; un renglón por bloque. */
export function textoDeHtml(html) {
  return decodificar(String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<td\b[^>]*>/gi, ' \t')
    .replace(BLOQUE, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}
