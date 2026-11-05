/** El crudo, tal cual llegó: `crudo/<fuente>/<AAAA-MM-DD>/<sha256>`. Se relee con un lector mejor sin volver a pedir. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const sha256 = (b) => createHash('sha256').update(b).digest('hex');

export function crearAlmacen(raiz) {
  return {
    guardar(fuente, dia, bytes) {
      const hash = sha256(bytes);
      const dir = join(raiz, fuente, dia);
      const ruta = join(dir, hash);
      if (!existsSync(ruta)) { mkdirSync(dir, { recursive: true }); writeFileSync(ruta, bytes); }
      return hash;
    },
  };
}
