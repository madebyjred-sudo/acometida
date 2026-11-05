/**
 * legislation.gov.uk (Reino Unido), feed Atom de lo recién publicado.
 * Medido el 4-nov-2026: `/new/data.feed` → 200, 20 entradas por página, ordenadas por `published` de la más
 * nueva a la más vieja, y `leg:morePages` dice cuántas páginas quedan.
 * El feed trae lo nuevo, no la historia: la primera corrida rellena las páginas que haya.
 */
const FEED = 'https://www.legislation.gov.uk/new/data.feed';
const MAX_PAGINAS = 15;

const pagina = (n) => (n === 1 ? FEED : `${FEED}?page=${n}`);
const clave = (id) => String(id).replace(/^https?:\/\/www\.legislation\.gov\.uk\/(?:id\/)?/, ''); // las fe de erratas vienen con la URL del PDF como id

export default {
  fuente: 'legislation_uk',
  nombre: 'legislation.gov.uk · legislación del Reino Unido recién publicada',
  leidoCon: 'legislation_uk@1',
  cuandoUsar: 'leyes, statutory instruments y normas de Inglaterra, Gales, Escocia e Irlanda del Norte publicadas recientemente',
  cuandoNo: 'el texto consolidado vigente de una ley antigua, jurisprudencia ni normas de otros países',
  acceso: { salida: 'directa', ritmo: { porMinuto: 20 } },
  frescura: { cadaHoras: 24 },
  canario: { pendiente: { id: 'p1', url: FEED }, campos: ['clave', 'titulo', 'fecha', 'url'], minRegistros: 10 },

  async *descubrir(cursor, ctx) {
    const { leerFeed } = ctx.ayudas;
    const desde = cursor?.publicado ?? '';
    const paginas = [];
    for (let n = 1; n <= MAX_PAGINAS; n++) {
      const xml = (await ctx.traer(pagina(n), { esperado: 'cualquiera' })).texto();
      const entradas = leerFeed(xml);
      if (!entradas.length) break;
      paginas.push({ n, xml, mayor: entradas.map((e) => e.fecha ?? '').sort().at(-1), menor: entradas.map((e) => e.fecha ?? '').sort()[0] });
      if (desde && paginas.at(-1).menor <= desde.slice(0, 10)) break;
      if (!/<leg:morePages>[1-9]/.test(xml)) break;
    }
    if (desde && paginas[0] && paginas[0].mayor < desde.slice(0, 10)) {
      ctx.probarSinPublicaciones(`el feed no tiene nada publicado después del ${desde.slice(0, 10)}`);
    }
    // de la página más vieja a la más nueva, para que el cursor avance en orden
    for (const p of paginas.reverse()) yield { id: `p${p.n}`, url: pagina(p.n), cursor: { publicado: p.mayor }, meta: { xml: p.xml } };
  },

  async traer(p, ctx) {
    if (p.meta?.xml) return { bytes: p.meta.xml, url: p.url };
    return ctx.traer(p.url);
  },

  leer(crudo, ctx) {
    return ctx.ayudas.leerFeed(crudo.texto()).map((e) => ({
      clave: clave(e.id),
      titulo: e.titulo,
      fecha: e.fecha,
      url: e.url,
      texto: [e.titulo, e.resumen].filter(Boolean).join(' · '),
      datos: { tipo: clave(e.id).split('/')[0] },
    }));
  },
};
