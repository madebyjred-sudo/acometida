import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bloques, decodificar, leerFeed, leerSitemap, textoDeHtml, valor } from '../src/ayudas.mjs';

test('leerFeed: Atom con link alternate, published y entidades', () => {
  const xml = `<?xml version="1.0"?><?xml-stylesheet href="x.xsl"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Boletín</title><link rel="self" href="https://x.test/feed"/>
<entry><id>urn:a:1</id><title>Ley &amp; decreto</title><link rel="alternate" href="https://x.test/1"/><link rel="related" href="https://x.test/1.pdf"/>
<published>2026-11-03T10:00:00+01:00</published><updated>2026-11-04T09:00:00Z</updated><summary type="html">&lt;p&gt;Resumen&lt;/p&gt;</summary></entry>
<entry><id>urn:a:2</id><title>Sin fecha</title><link href="https://x.test/2"/></entry></feed>`;
  const e = leerFeed(xml);
  assert.equal(e.length, 2);
  assert.deepEqual(e[0], { id: 'urn:a:1', titulo: 'Ley & decreto', url: 'https://x.test/1', fecha: '2026-11-03', resumen: 'Resumen' });
  assert.equal(e[1].url, 'https://x.test/2');
  assert.equal(e[1].fecha, null, 'sin fecha queda nula, nunca hoy');
});

test('leerFeed: RSS 2.0 con CDATA, guid y pubDate', () => {
  const xml = `<rss version="2.0"><channel><title>Avisos</title><link>https://x.test</link>
<item><title><![CDATA[Aviso <b>uno</b>]]></title><link>https://x.test/a1</link><guid isPermaLink="false">A-1</guid>
<pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[Primer &aacute;viso]]></description></item>
<item><title>Aviso dos</title><link>https://x.test/a2</link><dc:date>2026-10-30</dc:date></item></channel></rss>`;
  const e = leerFeed(xml);
  assert.equal(e.length, 2);
  assert.deepEqual(e[0], { id: 'A-1', titulo: 'Aviso uno', url: 'https://x.test/a1', fecha: '2026-11-03', resumen: 'Primer áviso' });
  assert.deepEqual([e[1].id, e[1].fecha], ['https://x.test/a2', '2026-10-30']);
});

test('leerFeed: RSS 1.0 (RDF) usa rdf:about', () => {
  const e = leerFeed('<rdf:RDF><item rdf:about="https://x.test/r1"><title>R</title><dc:date>2026-01-02</dc:date></item></rdf:RDF>');
  assert.deepEqual(e[0], { id: 'https://x.test/r1', titulo: 'R', url: 'https://x.test/r1', fecha: '2026-01-02', resumen: null });
});

test('leerSitemap: urlset con lastmod e índice de sitemaps', () => {
  const u = leerSitemap('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://x.test/a</loc><lastmod>2026-11-01</lastmod></url><url><loc>https://x.test/b</loc></url></urlset>');
  assert.deepEqual(u, [{ url: 'https://x.test/a', fecha: '2026-11-01', esSitemap: false }, { url: 'https://x.test/b', fecha: null, esSitemap: false }]);
  const i = leerSitemap('<sitemapindex><sitemap><loc>https://x.test/s1.xml</loc><lastmod>2026-10-01T00:00:00Z</lastmod></sitemap></sitemapindex>');
  assert.deepEqual(i, [{ url: 'https://x.test/s1.xml', fecha: '2026-10-01', esSitemap: true }]);
});

test('textoDeHtml: sin scripts ni estilos, un renglón por bloque, entidades decodificadas', () => {
  const t = textoDeHtml(`<html><head><title>T</title><style>p{}</style></head><body><!-- nota -->
<script>var x = "<p>no</p>";</script><h1>Ley&nbsp;5</h1><p>Art&iacute;culo 1 &mdash; vigente</p><table><tr><td>a</td><td>b</td></tr></table></body></html>`);
  assert.equal(t, 'Ley 5\nArtículo 1 — vigente\na b');
});

test('bloques, valor y decodificar', () => {
  const xml = '<r><ns:item a="1"><id>X&#233;</id></ns:item><item/><itemx>no</itemx></r>';
  assert.equal(bloques(xml, 'item').length, 2);
  assert.equal(bloques(xml, 'item')[0].attrs.a, '1');
  assert.equal(valor(xml, 'id'), 'Xé');
  assert.equal(decodificar('&#x41;&lt;&unknown;'), 'A<&unknown;');
});
