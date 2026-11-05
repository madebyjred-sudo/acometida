import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { after, before, test } from 'node:test';
import { crearTraer } from '../src/traer.mjs';

// Un sitio local y un proxy CONNECT local que cuenta lo que pasa por él.
let sitio, proxy, pasaron = 0;
before(async () => {
  sitio = createServer((req, res) => res.end('hola desde el sitio'));
  // http va en forma absoluta; https, por CONNECT
  proxy = createServer((req, res) => {
    pasaron++;
    const u = new URL(req.url);
    req.pipe(request({ host: u.hostname, port: u.port, path: u.pathname, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }));
  });
  proxy.on('connect', (req, cliente, cabeza) => {
    pasaron++;
    const [host, puerto] = req.url.split(':');
    const s = connect(Number(puerto), host, () => { cliente.write('HTTP/1.1 200 Connection Established\r\n\r\n'); s.write(cabeza); s.pipe(cliente); cliente.pipe(s); });
    s.on('error', () => cliente.destroy());
  });
  await Promise.all([new Promise((r) => sitio.listen(0, '127.0.0.1', r)), new Promise((r) => proxy.listen(0, '127.0.0.1', r))]);
});
after(() => { sitio.close(); proxy.close(); });

test('salida por país: el pedido pasa por ACOMETIDA_PROXY_<PAÍS>', async () => {
  const env = { ACOMETIDA_PROXY_MX: `http://127.0.0.1:${proxy.address().port}` };
  const { traer, avisos } = crearTraer({ fuente: 'p', acceso: { salida: 'mx', ritmo: { porMinuto: 0 } } }, { env });
  assert.deepEqual(avisos, []);
  const r = await traer(`http://127.0.0.1:${sitio.address().port}/x`);
  assert.equal(r.texto(), 'hola desde el sitio');
  assert.equal(pasaron, 1);
});
