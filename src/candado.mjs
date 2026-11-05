/** Un candado por fuente: dos corridas de la misma fuente no se pisan. Si el dueño murió, se toma. */
import { mkdirSync, openSync, readFileSync, rmSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';

const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

export function tomarCandado(carpeta, nombre) {
  const dir = join(carpeta, '.candados');
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, `${nombre}.lock`);
  for (let i = 0; i < 2; i++) {
    try {
      const fd = openSync(ruta, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return { soltar: () => rmSync(ruta, { force: true }) };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(readFileSync(ruta, 'utf8'));
      if (pid && vivo(pid)) return null;
      rmSync(ruta, { force: true }); // dueño muerto: candado huérfano
    }
  }
  return null;
}
