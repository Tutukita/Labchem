# Laboratorio de Moléculas — prototipo digital

Prototipo jugable del juego de mesa **Laboratorio de Moléculas**, pensado para probar la construcción de moléculas, reacciones, investigaciones, objetivos comerciales y contaminación.

## Probar el juego

La versión publicada con GitHub Pages se abre directamente desde el navegador, sin instalación.

> Estado actual: prototipo de interfaz. Las salas privadas y los demás jugadores todavía son simulados; dos personas no pueden compartir una misma partida en tiempo real.

## Funciones incluidas

- Tablero molecular dividido en cuatro estructuras de 10 × 10.
- Colocación reversible de átomos y enlaces durante el turno.
- Enlaces horizontales, verticales y diagonales con orientación automática.
- Límite de colocación: un átomo por estructura y una colocación doble por turno.
- Matraces personales y captura de moléculas.
- Editor de reacciones.
- Investigaciones y objetivos comerciales.
- Economía, puntos de victoria y contaminación.

## Ejecutar localmente

El juego no necesita instalación ni compilación. Serví la carpeta `dist` con cualquier servidor web estático y abrí `index.html`.

Ejemplo:

```bash
python -m http.server 4175 --directory dist
```

Después visitá `http://localhost:4175`.

## Estructura

- `dist/index.html`: estructura de la interfaz.
- `dist/styles.css`: diseño visual y grillas.
- `dist/app.js`: reglas y comportamiento del prototipo.
- `.github/workflows/deploy-pages.yml`: publicación automática en GitHub Pages.

## Próximo objetivo

Agregar un servidor compartido para que las salas privadas sincronicen turnos y partidas reales entre distintos dispositivos.
