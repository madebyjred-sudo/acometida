# Fuentes que solo responden desde su país

Algunos sitios públicos no responden desde afuera: el puerto no contesta, devuelven 403, o muestran otra cosa. Desde
afuera eso parece una caída, y no lo es.

## Primero, medir
1. Desde tu máquina: `curl -sv <url>` y mira dónde muere (DNS, conexión, TLS, HTTP).
2. Desde otra red de otro país (un servidor barato, el celular con datos): si allí tampoco responde, puede estar caída.
3. Desde una IP del país (un conocido, una VPN con salida allí): si responde, es restricción geográfica.
4. Anota en `fuentes/<nombre>.md` qué probaste, desde dónde y cuándo. Lo que no probaste queda «sin medir».

## Después, una salida
La ficha dice `acceso.salida: 'mx'` (el código del país) y el motor busca `ACOMETIDA_PROXY_MX`. Sin esa variable, cada
ítem falla con motivo: nunca sale directo en silencio, porque una respuesta directa distinta se vería como dato.

Tres formas de tener ese proxy, de la más simple a la más estable:
1. **Correr desde una IP del país.** Si tu máquina o una de tu equipo está allí, programa `acometida correr` en ella.
2. **Una VM barata con VPN de salida en el país.** La VM se conecta a una VPN con salida allí, enruta por el túnel
   solo el bloque de IPs del sitio, y expone un proxy HTTP privado (por ejemplo squid) que solo tu red alcanza. Tu
   `ACOMETIDA_PROXY_XX` apunta a ese proxy. Comprueba la salida con `curl --interface <túnel> https://1.1.1.1/cdn-cgi/trace`
   (debe decir `loc=XX`). El servicio que levanta el túnel debe reconectarse solo y sobrevivir reinicios.
3. **Un proveedor de proxies con salida en el país.** Lee sus términos: no todos permiten tráfico automatizado.

## Cuidados
- Solo el dominio de la fuente sale por el proxy; el resto (tu modelo, tu base) sale directo.
- Las credenciales de la VPN o del proxy van en variables de entorno o en el gestor de secretos, nunca en el repo.
- Respeta el ritmo de la ficha: una fuente pública de un gobierno no es un lugar para pedir rápido.
- Si la restricción se levanta, deja la salida configurada: no molesta, y te avisará si vuelve.
