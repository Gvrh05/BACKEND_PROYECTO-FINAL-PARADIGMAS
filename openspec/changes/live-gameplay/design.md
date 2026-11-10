# Design

## Context

El Punto 3 ya provee rutas `/kahoot-api/game-sessions`, el namespace `/game`, identidad JWT compartida entre REST y WS, transiciones persistidas y suscripción por `roomCode`. `GameSessionService.startSession` publica `session-started`. En React, `useSessionLobby` recupera el lobby y las páginas de host y jugador muestran un texto al pasar a IN_PROGRESS. El método heredado `submitAnswer` todavía es simulado y carece de handler activo. `ResultsService` aún devuelve resultados simulados y `src/tracing.ts` ofrece instrumentos sin exportación.

El cambio activo `add-quiz-management` define cuatro opciones con una única correcta. Sus DTO, editor, seed y trigger diferido en PostgreSQL aplican esa regla. El enunciado del curso pide Verdadero/Falso en la partida. El nuevo tipo añade esa capacidad sin reinterpretar datos previos. Si el equipo archiva primero la autoría de cuatro opciones, reconciliar su spec canónica con este cambio antes del archivo final.

## Goals / Non-Goals

- Reusar el flujo de sala, JWT, PostgreSQL y la conexión Socket.IO existentes.
- Mantener el motor activo en una instancia y entregar al Punto 5 un resumen con identidad estable para la persistencia de resultados.
- Limitar los cambios de autoría a compatibilidad binaria y datos de demo. La clasificación final y su API son responsabilidad del Punto 5. La recuperación de partidas activas tras reinicio y la ejecución distribuida quedan fuera de este diseño.

## Decisions

### Autoría y snapshot

Añadir un tipo explícito `TRUE_FALSE` junto con el formato de cuatro opciones, que será el valor para datos y solicitudes anteriores. Reutilizar la relación de opciones, con valores binarios canónicos ligados a cada opción binaria y textos de presentación en React. Validar tipo, cantidad, valores y correcta en la API y en la restricción diferida. Crear o actualizar la pregunta y sus opciones en la misma transacción. Mantener el quiz anterior y agregar un seed binario separado con al menos dos preguntas y una imagen.

En el inicio, cargar el detalle autorizado con orden estable y preparar el snapshot completo antes de confirmar `IN_PROGRESS`. Fijar las imágenes en almacenamiento de partida mediante copia con nombre independiente de autoría. Verificar que el origen corresponde a la versión capturada y abortar o reintentar la preparación si la limpieza concurrente elimina el archivo. Liberar copias tras finalizar o si el inicio falla. Reutilizar la configuración del origen público de la API para servir las imágenes a otros dispositivos. Un enlace al archivo de autoría quedaría roto si la limpieza elimina el original.

### Máquina de estados y concurrencia

```text
LOBBY --> IN_PROGRESS con ronda activa --> ronda cerrada
                          ^                      |
                          +--- siguiente -------+
                                                 |
                                     ultima --> FINISHED
```

Conservar `SessionStatus` para el ciclo de sala. Dentro de IN_PROGRESS, almacenar ronda, índice, `closesAt`, versión de juego, respuestas por identidad y resultado calculado al cierre. Usar la cola existente por sala para serializar las transiciones y coordinar la aceptación de respuestas con el cierre. La frontera de aceptación es `serverNow < closesAt` cuando el servicio procesa el comando. Usar `timeLimitSeconds` y 20 segundos de reserva cuando la configuración esté ausente. El temporizador se programa una vez por ronda, comprueba su identificador al dispararse y se cancela en cierre o retiro. Se propone cerrar por tiempo incluso si todos ya respondieron, para que la duración sea predecible.

El último avance llama al límite del Punto 5 con `roomCode`, `startedAt`, `quizId` y contribuciones de las rondas. Acordar una clave idempotente por sesión y conservar el resumen mientras la entrega se puede reintentar. Ante un fallo, el host sigue viendo la ronda cerrada y puede reintentar finalizar. En esta rama, la fila de sesión guarda la clasificación con el estado FINISHED en una actualización condicional. ResultsService la lee como integración inicial. El motor conserva la ronda hasta confirmar esa actualización. Las pruebas del Punto 4 pueden usar un receptor controlado y la demo integrada debe verificar la implementación real del Punto 5.

### Contrato REST y Socket.IO

| Dirección | Contrato propuesto |
| --- | --- |
| Cliente a API | Se preservan las rutas REST del lobby. `GET /game-sessions/:roomCode` incorpora el snapshot de juego solo para el anfitrión y participantes registrados. |
| Cliente a `/game` | `join-session { roomCode }` y `start-session { roomCode }` se conservan. `submit-answer { roomCode, questionId, answer }` y `next-question { roomCode, questionId }` usan los mismos controles de JWT y sala. |
| API a sala | Se conserva `session-started`. `question-opened` publica el contenido visible y `question-closed` publica la correcta. `game-finished` señala el traspaso final. Los eventos de juego incluyen `roomCode` y versión de estado. |
| API a cliente | `session-state` recupera el estado visible más la respuesta o resultado propio. El envío devuelve confirmación al socket emisor y un rechazo distinguible para plazo, duplicado, fase, identidad o payload inválido. Los resultados individuales se consultan o emiten únicamente al usuario que corresponda. |

El snapshot incluirá `serverNow`, `closesAt`, posición y total, e identificador de ronda. React extiende el hook de sala y reutiliza la conexión existente. La vista se elige por rol y fase, con versión de juego para ignorar snapshots obsoletos. La versión gobierna la progresión de la ronda. La confirmación propia se conserva al mezclar mensajes de la misma ronda. El estado público se construye con DTO explícitos para evitar enviar entidades de autoría con la opción correcta.

### Observabilidad remota

Reusar `getMeter` y `getTracer` y coordinar con el responsable que sustituya el stub por el SDK antes del arranque de Nest. Enviar OTLP por HTTPS al endpoint de Grafana Cloud. La API puede apuntar al endpoint del equipo o pasar por Alloy si el despliegue requiere un Collector. Configurar API y Auth con nombres de servicio distinguibles y coordinar la señal de Auth con su repositorio responsable. Instrumentar salidas de negocio con motivos acotados y medir en el servidor desde la recepción hasta la confirmación. Diferenciar el entorno en el tablero. La elección del host concreto y sus credenciales se resuelve antes del despliegue. El contrato permite usar un Grafana remoto existente si el equipo ya lo tiene.

## Risks / Trade-offs

- **Datos previos y orden de PRs.** Coordinar la migración y la spec del Punto 2 antes de editar autoría. Comprobar los quizzes de cuatro opciones y la migración con PostgreSQL real.
- **Conflicto entre plazo, duplicado y avance.** Probar el instante exacto de vencimiento, respuestas concurrentes, callbacks vencidos y reenvíos de comandos.
- **Reinicio del servidor.** El estado activo vive en memoria. Registrar este límite en la demo y coordinar con Punto 5 la verificación de resultados terminados después de reiniciar.
- **Demo con dependencias del equipo.** Verificar desde el principio una cuenta real de Auth y las URLs que utilizará un teléfono. Separar el humo local de la evidencia de telemetría remota.

## Migration Plan

1. Aplicar una migración aditiva después de las existentes y probar el valor de tipo asignado a datos previos y la restricción por tipo.
2. Desplegar la API compatible antes del frontend y cargar el quiz binario sin reemplazar el anterior.
3. Ejecutar la demo contra el entorno remoto y verificar los paneles durante el juego. Si se debe retirar el código, preservar los datos binarios y revisar la compatibilidad antes de revertir la restricción de base.
