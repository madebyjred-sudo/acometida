/**
 * Federal Register (EE. UU.), API pública JSON. Un pedido por día de publicación.
 * Medido el 4-nov-2026: 200 en 0,4 s, sin llave. Un día sin publicación responde `count: 0`, que para un día
 * pasado prueba que no hubo; para hoy es «todavía no».
 * Tiene buscador propio: si la copia no alcanza, `enVivo` pregunta a la API.
 */
const API = 'https://www.federalregister.gov/api/v1/documents.json';
const ZONA = 'America/New_York';
const RELLENO_DIAS = 30;
const CAMPOS = ['document_number', 'title', 'abstract', 'publication_date', 'html_url', 'type', 'agencies'];
const consulta = (cond) => `${API}?per_page=1000&order=oldest&${CAMPOS.map((c) => `fields%5B%5D=${c}`).join('&')}&${cond}`;

const registro = (d) => ({
  clave: d.document_number,
  titulo: d.title,
  fecha: d.publication_date,
  url: d.html_url,
  texto: [d.title, d.abstract, d.type, ...(d.agencies ?? []).map((a) => a.name ?? a.raw_name)].filter(Boolean).join(' · '),
  datos: { tipo: d.type, agencias: (d.agencies ?? []).map((a) => a.name ?? a.raw_name) },
});

export default {
  fuente: 'federal_register',
  nombre: 'Federal Register (EE. UU.)',
  leidoCon: 'federal_register@1',
  cuandoUsar: 'reglas, propuestas de regla, avisos y documentos presidenciales del gobierno federal de Estados Unidos',
  cuandoNo: 'leyes estatales, el Código de Regulaciones Federales vigente (eCFR) ni proyectos de ley del Congreso',
  acceso: { salida: 'directa', ritmo: { porMinuto: 30 } },
  frescura: { cadaHoras: 24 },
  canario: { pendiente: { id: '2026-11-03', url: consulta('conditions%5Bpublication_date%5D%5Bis%5D=2026-11-03'), meta: { dia: '2026-11-03', pasado: true } }, campos: ['clave', 'titulo', 'fecha', 'url'], minRegistros: 20 },

  async *descubrir(cursor, ctx) {
    const { diaEn, diasEntre, sumarDias } = ctx.ayudas;
    const hoy = diaEn(ZONA, ctx.ahora);
    const desde = cursor?.dia ? sumarDias(cursor.dia, 1) : sumarDias(hoy, -RELLENO_DIAS);
    for (const dia of diasEntre(desde, hoy)) {
      const pasado = dia < hoy;
      yield { id: dia, url: consulta(`conditions%5Bpublication_date%5D%5Bis%5D=${dia}`), cursor: pasado ? { dia } : undefined, meta: { dia, pasado } };
    }
  },

  async traer(p, ctx) {
    return ctx.traer(p.url, { esperado: 'json' });
  },

  leer(crudo, ctx, p) {
    const d = JSON.parse(crudo.texto());
    if (d.total_pages > 1) throw new Error(`el ${p.meta.dia} tiene ${d.count} documentos en ${d.total_pages} páginas: falta paginar`);
    if (!d.count) {
      if (!p.meta.pasado) throw new ctx.errores.TodaviaNo(`Federal Register del ${p.meta.dia} todavía sin documentos`);
      ctx.probarSinPublicaciones(`la API respondió count 0 para el ${p.meta.dia}`);
      return [];
    }
    return (d.results ?? []).map(registro);
  },

  async enVivo(args, ctx) {
    const cond = [];
    if (args.consulta) cond.push(`conditions%5Bterm%5D=${encodeURIComponent(args.consulta)}`);
    if (args.clave) cond.push(`conditions%5Bdocument_number%5D=${encodeURIComponent(args.clave)}`);
    if (args.desde) cond.push(`conditions%5Bpublication_date%5D%5Bgte%5D=${args.desde}`);
    if (args.hasta) cond.push(`conditions%5Bpublication_date%5D%5Blte%5D=${args.hasta}`);
    const url = `${API}?per_page=8&order=relevance&${CAMPOS.map((c) => `fields%5B%5D=${c}`).join('&')}&${cond.join('&')}`;
    const d = JSON.parse((await ctx.traer(url, { esperado: 'json' })).texto());
    return (d.results ?? []).map(registro);
  },
};
