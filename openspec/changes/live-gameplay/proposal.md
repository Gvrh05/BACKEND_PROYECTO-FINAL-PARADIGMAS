# Proposal

## Why

El Punto 3 permite abrir e iniciar una sala. El Punto 4 debe convertir ese inicio en una partida Verdadero/Falso jugable, con tiempo controlado por la API y recuperación del estado al reconectar.

## What Changes

- Abrir la primera pregunta al iniciar la sala, aceptar una respuesta por participante antes del cierre y permitir que el anfitrión avance después del cierre.
- Extender las vistas y la suscripción existentes de anfitrión y jugador para mostrar pregunta, imagen, tiempo, confirmación y resultado de ronda.
- Admitir un formato explícito Verdadero/Falso en autoría y preparar un quiz binario de demo. Preservar los cuestionarios de cuatro opciones ya guardados y su edición.
- Entregar el cierre de ronda y el resumen final al contrato acordado con el Punto 5. El Punto 5 es dueño de la clasificación y su persistencia.
- Instrumentar la partida y verificar que Grafana remoto reciba telemetría real de la API desplegada. Coordinar el SDK compartido y la señal de Auth con sus responsables.

## Capabilities

### New Capabilities

- `live-gameplay` — Ciclo de preguntas en vivo, respuestas, interfaz y entrega de resultados.
- `true-false-questions` — Autoría y selección de preguntas binarias con compatibilidad para preguntas de cuatro opciones.
- `live-gameplay-observability` — Evidencia remota de la actividad de juego instrumentada.

### Modified Capabilities

- `game-session-start` — El inicio existente publica la primera pregunta y el lobby pasa a la vista de partida.
- `game-session-reconnect` — La sesión recupera la ronda y el estado de respuesta por identidad.

## Impact

- Backend NestJS y frontend React en sus respectivas ramas `feature/punto4`.
- Contrato REST de sesiones, Socket.IO en `/game`, DTO de autoría, migración de integridad y seed.
- Observabilidad compartida y entorno remoto del equipo. Se mantiene el alcance de reconexión temporal a un proceso activo.
