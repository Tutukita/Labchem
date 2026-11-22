# Laboratorio de Moléculas — prototipo digital

Prototipo jugable del juego de mesa **Laboratorio de Moléculas**, pensado para probar la construcción de moléculas, reacciones, investigaciones, objetivos comerciales y contaminación.

## Probar el juego

La versión publicada con GitHub Pages se abre directamente desde el navegador, sin instalación. Esa versión conserva la conexión directa entre navegadores como compatibilidad.

Para partidas con reconexión, usá el servidor Node incluido en este repositorio.

## Modo online

1. Una persona elige **Crear sala privada** y comparte el código `LAB-0000`.
2. La otra abre el mismo enlace, elige **Ingresar con código** y escribe ese código.
3. La mesa, los turnos y las manos individuales se sincronizan a través del servidor.

El servidor mantiene el estado más reciente de cada sala y permite que un jugador recargue la página y vuelva a entrar automáticamente. Las reglas todavía son validadas por el navegador anfitrión: este backend está pensado para probar el juego con amigos, no para partidas competitivas públicas.

## Funciones incluidas

- Tablero molecular dividido en cuatro estructuras de 10 × 10.
- Colocación reversible de átomos y enlaces durante el turno.
- Enlaces horizontales, verticales y diagonales con orientación automática.
- Límite de colocación: un átomo por estructura y una colocación doble por turno.
- Matraces personales y captura de moléculas.
- Editor de reacciones.
- Investigaciones y objetivos comerciales.
- Economía, puntos de victoria y contaminación.

## Ejecutar frontend y backend localmente

Requiere Node.js 20 o posterior. Desde la carpeta del proyecto ejecutá:

```bash
npm install
npm start
```

Después visitá `http://localhost:4175`. El mismo proceso sirve el juego y acepta las conexiones WebSocket en `/ws`. El estado del servicio se puede consultar en `/health`.

## Hospedarlo

Subí el repositorio a un proveedor que ejecute Node.js y admita WebSockets. Configurá:

- Comando de instalación: `npm install`
- Comando de inicio: `npm start`
- Puerto: la variable `PORT` que entregue el proveedor
- Comprobación de salud: `/health`

No hace falta separar frontend y backend: el servidor entrega la carpeta `dist` y usa el mismo dominio para `/ws`. Una vez desplegado, compartí la URL pública con ambos jugadores.

También se incluye `render.yaml` como ejemplo para Render. Si preferís mantener el frontend en GitHub Pages y alojar solamente el backend, definí la URL pública WebSocket en `dist/config.js`, por ejemplo:

```js
window.LABCHEM_SERVER_URL = 'wss://tu-servidor.example/ws';
```

Las salas se guardan en memoria. Sobreviven a una recarga o una desconexión breve de los jugadores, pero se pierden cuando el servidor se reinicia o vuelve a desplegarse. Las salas vacías vencen luego de dos horas.

## Estructura

- `dist/index.html`: estructura de la interfaz.
- `dist/styles.css`: diseño visual y grillas.
- `dist/app.js`: reglas y comportamiento del prototipo.
- `dist/config.js`: URL opcional del backend cuando se hospeda por separado.
- `server/index.js`: servidor HTTP, salas y sincronización WebSocket.
- `package.json`: dependencias y comandos del servidor.
- `render.yaml`: ejemplo de despliegue.
- `.github/workflows/deploy-pages.yml`: publicación automática en GitHub Pages.

## Próximo objetivo

Persistir las partidas en una base de datos y trasladar la validación de reglas al servidor.
