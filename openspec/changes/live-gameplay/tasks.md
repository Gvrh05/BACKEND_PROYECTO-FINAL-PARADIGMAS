# Tasks

## 1. Contratos y datos de partida

- [ ] 1.1 Alinear con Punto 2 el tipo `TRUE_FALSE` y el orden de cambios respecto a `add-quiz-management`. Alinear con Punto 5 el resumen, clave idempotente y entrega final. Dejar ambos contratos y responsables registrados en el cambio.
- [x] 1.2 Añadir el tipo a entidades, DTO y migración aditiva con validación diferida por tipo. Verificar en PostgreSQL que se conserva y edita un quiz de cuatro opciones anterior y que un binario inválido se revierte.
- [ ] 1.3 Adaptar el editor React y el seed sin reemplazar datos existentes. Probar crear, editar y recargar un Verdadero/Falso con imagen, y repetir la edición con un quiz de cuatro opciones.
- [ ] 1.4 Comprobar elegibilidad al iniciar y fijar el snapshot ordenado con copia de imagen. Probar quiz vacío o incompatible, cambios de texto e imagen durante el juego, y fallo de persistencia sin transición ni archivos de partida huérfanos.

## 2. Rondas en el backend

- [ ] 2.1 Abrir la primera ronda desde el inicio REST y WS y programar el cierre usando la cola por sala. Probar con reloj controlado el plazo configurado, cierre único y callbacks obsoletos.
- [x] 2.2 Registrar `submit-answer` autenticado con confirmación privada. Probar respuesta `false`, duplicados simultáneos, vencimiento exacto, pregunta anterior, anfitrión y sala ajena.
- [x] 2.3 Publicar el cierre con respuesta correcta y resultado individual. Probar que la correcta permanece privada hasta el cierre y que acierto, error y ausencia aportan 1, 0 y 0.
- [x] 2.4 Implementar `next-question` solo para el anfitrión y el límite idempotente de entrega al Punto 5. Probar avance anticipado, repetido y no autorizado, además de reintento tras fallo del receptor.
- [x] 2.5 Extender el snapshot por identidad y actualizar OpenAPI y `x-websocket` con formatos, permisos y errores. Validar el contrato y probar en dos salas que la reconexión recupera la ronda y la respuesta propia sin filtrar datos ajenos.

## 3. Partida en React

- [ ] 3.1 Extender la conexión y los esquemas del lobby con el estado de juego. Probar reconexión después de responder, pérdida del evento de inicio, cambio de sala y GET atrasado después del cierre.
- [x] 3.2 Mostrar vistas por rol con imagen, temporizador, botones Verdadero/Falso y controles de avance o finalización. Probar en tamaño móvil y de escritorio el envío, confirmación, tiempo agotado y revelación, y verificar que solo el host puede avanzar.
- [x] 3.3 Verificar el primer flujo completo con una cuenta de anfitrión y dos participantes. Documentar inicio reproducible, cuentas de prueba y cómo obtener el quiz binario con imagen.

## 4. Observabilidad y demo remota

- [ ] 4.1 Instrumentar salas activas, rechazos por motivo, respuestas aceptadas, reconexiones y latencia. Probar con un receptor de pruebas que se registran las señales sin atributos privados y que el flujo funciona con el exportador caído.
- [ ] 4.2 Integrar el SDK y exportador reales con su responsable y publicar configuración reproducible del Collector, fuente de datos y tablero. Confirmar desde Grafana remoto que la API y Auth están identificados por servicio y que la actividad de juego aparece en el entorno desplegado.
- [ ] 4.3 Demostrar dos salas, dos dispositivos, una reconexión y lectura de sesión con un cliente adicional. Registrar el máximo de participantes simultáneos efectivamente probado y capturar la actividad correspondiente en Grafana.
- [ ] 4.4 Verificar con el Punto 5 que la clasificación y resultados terminados se recuperan después de reiniciar los contenedores. Registrar las comprobaciones integradas y las limitaciones observadas.

## Evidencia local

- Partida con Auth real y PostgreSQL sin Docker. Dos salas simultáneas y dos jugadores en la sala de prueba. Se comprobaron dos preguntas, la imagen, rechazo tardío y duplicado, reconexión y clasificación 2 a 0 recuperada tras reiniciar la API.
- El receptor local de diagnóstico recibió métricas OTLP de `kahoot-game-session` y `profelink-auth`. Se comprobaron salas activas, solicitudes de login HTTP 200 y 401 y latencia de Auth. Los atributos de Auth se limitaron a método, plantilla de ruta y código HTTP. El tablero de Grafana Cloud mostró métricas de una partida local; queda comprobar las del despliegue público.
- La prueba con las API actualizadas registró un perfil, rechazó un duplicado y permitió entrar al lobby con la cuenta nueva y el PIN. Jugó con dos participantes y un anfitrión en una sala, mientras otra sala permanecía aislada. El cliente HTTP independiente recuperó el resultado 2 a 0. Esta cifra corresponde a la prueba realizada, no al límite de capacidad.
- Se verificó la exportación OTLP de `frontend_http_up=1` con el frontend local activo. La serie se confirmó en Grafana Cloud con `deployment_environment_name=local` y se guardó el panel de disponibilidad en el tablero.
- La pila Docker Hub de referencia arrancó sin compilar y respondió al login de demo y a las comprobaciones de salud. Queda publicar y comprobar la revisión que incluye registro, Scalar y la sonda de frontend en el despliegue externo.
- Las tres imágenes nuevas compilaron y arrancaron con el override de Compose. Se verificaron registro, PIN, acceso de invitado, revocación, partida y las dos rutas OpenAPI. Tras reiniciar Auth, API, frontend y las bases, se comprobó el mismo UUID del perfil, la imagen del cuestionario byte a byte y el registro de la partida finalizada en PostgreSQL.
- Verificación automatizada local: Frontend 29 pruebas, Auth 12 unitarias y 12 HTTP/migración, Backend 116 unitarias, 72 e2e y 5 de persistencia. OpenSpec en modo estricto y los dos contratos OpenAPI pasaron. La prueba física multidispositivo y la recepción de métricas de producción siguen pendientes.

## Workflow follow-up

- Ejecutar `openspec validate live-gameplay --strict` y `openspec validate --all --strict`. Resolver los cambios canónicos que hayan entrado desde el Punto 2.
- Con las tareas terminadas, archivar con `opsx-archive` y comprobar que el PR del backend contiene el archivo y las specs consolidadas.
- Enlazar los dos PR de `feature/punto4` y adjuntar la evidencia remota sin credenciales.
