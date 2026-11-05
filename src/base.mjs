/**
 * La base: un archivo SQLite por proyecto. Registros con versión, búsqueda por texto (FTS5),
 * cursores, corridas y canarios. Una sola versión vigente por clave.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ESQUEMA = `
create table if not exists registro (
  id integer primary key,
  fuente text not null, clave text not null, version text not null,
  hash_crudo text, url text, titulo text, texto text, fecha text,
  traido_en text not null, leido_con text, datos text,
  vigente integer not null default 1,
  unique (fuente, clave, version)
);
create index if not exists registro_vigente on registro (fuente, vigente, fecha);
create virtual table if not exists busqueda using fts5 (titulo, texto, tokenize = 'unicode61 remove_diacritics 2');
create table if not exists cursor (
  fuente text primary key, valor text, avanzado_en text, ultima_fila_nueva_en text, estado text
);
create table if not exists corrida (
  id integer primary key, fuente text not null, inicio text not null, fin text not null,
  descubiertos integer, nuevos integer, versiones integer, todavia_no integer,
  fallos_fuente integer, fallos_parser integer, sin_fecha integer,
  semaforo text not null, motivo text
);
create index if not exists corrida_fuente on corrida (fuente, inicio);
create table if not exists canario (
  id integer primary key, fuente text not null, en text not null, ok integer not null, motivo text
);
`;

export function abrirBase(ruta) {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('pragma journal_mode = wal; pragma busy_timeout = 15000;');
  db.exec(ESQUEMA);
  return crearBase(db);
}

function crearBase(db) {
  const q = (sql) => db.prepare(sql);
  const sel = {
    existe: q('select id from registro where fuente = ? and clave = ? and version = ?'),
    vigente: q('select id from registro where fuente = ? and clave = ? and vigente = 1'),
    retirar: q('update registro set vigente = 0 where id = ?'),
    borrarFts: q('delete from busqueda where rowid = ?'),
    insertar: q(`insert into registro (fuente, clave, version, hash_crudo, url, titulo, texto, fecha, traido_en, leido_con, datos)
                 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    insertarFts: q('insert into busqueda (rowid, titulo, texto) values (?, ?, ?)'),
    leerCursor: q('select * from cursor where fuente = ?'),
    guardarCursor: q(`insert into cursor (fuente, valor, avanzado_en, ultima_fila_nueva_en, estado) values (?, ?, ?, ?, ?)
                      on conflict (fuente) do update set valor = excluded.valor, avanzado_en = excluded.avanzado_en,
                      ultima_fila_nueva_en = excluded.ultima_fila_nueva_en, estado = excluded.estado`),
    corrida: q(`insert into corrida (fuente, inicio, fin, descubiertos, nuevos, versiones, todavia_no, fallos_fuente, fallos_parser, sin_fecha, semaforo, motivo)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    canario: q('insert into canario (fuente, en, ok, motivo) values (?, ?, ?, ?)'),
  };

  return {
    db,
    cerrar: () => db.close(),

    /** Guarda en una transacción. Misma (clave, versión) = nada; versión nueva = retira la vieja. */
    persistir(filas) {
      let nuevos = 0, versiones = 0;
      db.exec('begin immediate');
      try {
        for (const f of filas) {
          if (sel.existe.get(f.fuente, f.clave, f.version)) continue;
          const vieja = sel.vigente.get(f.fuente, f.clave);
          if (vieja) { sel.retirar.run(vieja.id); sel.borrarFts.run(vieja.id); versiones++; } else nuevos++;
          const r = sel.insertar.run(f.fuente, f.clave, f.version, f.hash_crudo, f.url, f.titulo, f.texto, f.fecha,
            f.traido_en, f.leido_con, f.datos == null ? null : JSON.stringify(f.datos));
          sel.insertarFts.run(r.lastInsertRowid, f.titulo ?? '', f.texto ?? '');
        }
        db.exec('commit');
      } catch (e) {
        db.exec('rollback');
        throw e;
      }
      return { nuevos, versiones };
    },

    leerCursor(fuente) {
      const c = sel.leerCursor.get(fuente);
      return c ? { ...c, valor: c.valor == null ? null : JSON.parse(c.valor) } : null;
    },
    guardarCursor(c) {
      sel.guardarCursor.run(c.fuente, c.valor === undefined || c.valor === null ? null : JSON.stringify(c.valor), c.avanzado_en, c.ultima_fila_nueva_en, c.estado);
    },
    escribirCorrida(c) {
      sel.corrida.run(c.fuente, c.inicio, c.fin, c.descubiertos, c.nuevos, c.versiones, c.todavia_no, c.fallos_fuente, c.fallos_parser, c.sin_fecha, c.semaforo, c.motivo);
    },
    escribirCanario(fuente, en, ok, motivo) { sel.canario.run(fuente, en, ok ? 1 : 0, motivo); },

    corridas(fuente, n = 50) {
      return q('select * from corrida where fuente = ? order by inicio desc, id desc limit ?').all(fuente, n);
    },
    ultimoCanario(fuente) {
      return q('select * from canario where fuente = ? order by en desc, id desc limit 1').get(fuente) ?? null;
    },
    /** Cobertura de la copia: cuántos registros vigentes y entre qué fechas. */
    cobertura(fuente) {
      return q(`select count(*) n, min(fecha) desde, max(fecha) hasta, sum(fecha is null) sin_fecha
                from registro where fuente = ? and vigente = 1`).get(fuente);
    },
    /** Fechas de publicación distintas (para calibrar el umbral). */
    fechas(fuente) {
      return q('select distinct fecha from registro where fuente = ? and vigente = 1 and fecha is not null order by fecha').all(fuente).map((r) => r.fecha);
    },
    vigentes(fuente) {
      return q('select * from registro where fuente = ? and vigente = 1 order by fecha desc, id desc').all(fuente);
    },
  };
}
