# acometida

[![M8ven Score](https://m8ven.ai/badge/mcp/madebyjred-sudo-acometida-1a8jpq?v=1b97e63ac6b64c76e8b36a6c99bbc665)](https://m8ven.ai/mcp/madebyjred-sudo-acometida-1a8jpq?s=readme)

Cualquier link, una fuente que tu chat consulta y cita con la fecha real del dato.

[Repositorio](https://github.com/madebyjred-sudo/acometida) · [Sitio](https://acometida.madebyjred.com) · [English](https://acometida.madebyjred.com/en/) · MIT

```
acometida nuevo <url>       sondea el link y escribe la ficha de la fuente
acometida correr [fuente]   trae lo nuevo, lo guarda y dice verde, amarillo o rojo con motivo
acometida estado            el medidor; sale con 2 si algo está viejo, rojo o sin medir
acometida servir            MCP: cada fuente es una herramienta para tu chat
acometida instalar          lo programa (--hora 06:00 o --cada 6h; --quitar)
```

Node 22.13 o más. Sin dependencias, salvo `undici` si una fuente sale por proxy de otro país.

## Instalar
```
git clone https://github.com/madebyjred-sudo/acometida.git && cd acometida && npm link
```
La skill está en `skills/acometida/`: tu agente la sigue para conectar la fuente que le pidas.

## Conectar tu chat
```
claude mcp add acometida -- acometida servir --dir /ruta/a/tu/proyecto/acometida
```
Cada fuente aparece como `consultar_<fuente>`, más `estado_de_las_fuentes`. Toda respuesta dice si viene de la copia
guardada o de una consulta en vivo, «datos al» (la última corrida verde) y la cobertura. Lo que no está en la copia
sale como «no consta en lo cargado».

## Un conector
`acometida/fuentes/<nombre>.mjs`, sin imports:
```js
export default {
  fuente: 'boletin',
  nombre: 'Boletín de ejemplo',
  cuandoUsar: 'avisos y resoluciones del boletín',
  cuandoNo: 'normas de otros países',
  acceso: { salida: 'directa', cabeceras: { Accept: 'application/json' }, ritmo: { porMinuto: 20 } },
  frescura: { cadaHoras: 24 },
  canario: { pendiente: { id: 'conocido', url: 'https://…/2026-11-03' }, campos: ['clave', 'titulo', 'fecha'] },
  async *descubrir(cursor, ctx) { /* yield { id, url, cursor } en orden */ },
  leer(crudo, ctx) { /* return [{ clave, titulo, texto, fecha, url }] */ },
};
```
`casos/` trae cuatro completos: BOE (España), Federal Register (EE. UU.), legislation.gov.uk (Reino Unido) y Ley Chile.

## La regla
Nunca fecha con «ahora». Verde exige prueba. Un 5xx no es «vacío». Lo no medido dice «sin medir». Los umbrales
salen del histórico de la fuente. El chat dice de dónde y de cuándo es cada dato.

## Lector con modelo
Para PDFs y HTML sin estructura: `ctx.leerConModelo(...)` con tu `OPENROUTER_API_KEY` (`ACOMETIDA_MODELO`,
`ACOMETIDA_TOPE_USD_DIA`). Valida que cada fecha esté en el documento.

La licencia es [MIT](LICENSE).
