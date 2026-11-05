# Cómo entrar a cada tipo de fuente

De la más estable a la más frágil. Usa la primera que exista: `acometida nuevo` te dice cuáles encontró.

## API pública (JSON o XML)
- Mira si pide cabeceras: hay APIs que dan 400 sin `Accept: application/json` o `application/xml`.
- Un pedido por día de publicación es el cursor más simple. Si el día trae más de una página, pagina dentro de `leer`
  o parte el pendiente; nunca te quedes con la primera página sin decirlo.
- Lo que la API responde para un día sin publicación (`count: 0`, 404 con mensaje) es tu prueba de vacío, pero solo
  para días pasados: hoy puede ser «todavía no».
- Si tiene buscador, escribe `enVivo`.

## Feed RSS o Atom
- Trae lo último, no la historia: sirve para lo nuevo, no para rellenar. Si necesitas historia, busca el archivo o el
  sitemap.
- La clave es el `id` o el enlace canónico, no la posición en el feed. La fecha es `published` o `updated`; si solo
  hay `updated`, dilo en la ficha (es la fecha de la última edición, no la de publicación).

## Sitemap
- Descúbrelo en `robots.txt` (líneas `Sitemap:`), luego en `/sitemap.xml`, `/sitemap_index.xml`, `/wp-sitemap.xml`.
  Un 200 con HTML no es un sitemap: solo vale lo que parsea como `urlset` o `sitemapindex`.
- En índices con tipos, quédate con los de contenido (entradas, noticias), no con páginas fijas, categorías ni
  productos. `lastmod` es la fecha; sin `lastmod` no se fecha.

## La API interna de la página (XHR)
- Si la página carga sus datos por JavaScript, ábrela con las herramientas de desarrollo y mira las llamadas de red
  mientras navegas: casi siempre hay un endpoint JSON detrás. Úsalo como API, con la misma cortesía.
- Copia de la llamada real solo lo necesario (ruta, parámetros, cabeceras que el servidor exige). Si exige sesión
  iniciada, no es una fuente pública: para.

## Formulario con estado (ASP.NET WebForms)
- Se reconoce por `__VIEWSTATE` y `__EVENTVALIDATION` en el HTML. Cada página depende de la anterior: haz GET, toma
  los campos ocultos y la cookie, y manda el POST con ellos. Un ítem no se puede volver a pedir suelto, así que la
  prueba de vacío compara la primera fila de cada lista con lo último guardado.

## HTML
- Busca primero un enlace a la versión de impresión, XML o JSON del mismo documento: muchos sitios la tienen.
- El canario es obligatorio: el HTML cambia sin aviso.

## PDF que se actualiza
- Si el PDF tiene capa de texto, extrae y lee como texto. Si es escaneado o desordenado, `ctx.leerConModelo`.
- La versión es el hash del archivo: el mismo PDF republicado con un cambio es versión nueva, no documento nuevo.
- Si llega HTML donde iba el PDF (página de error, inicio de sesión), es falla de la fuente: `esperado: 'archivo'`.
