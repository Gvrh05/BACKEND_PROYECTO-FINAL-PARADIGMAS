# Evidencia de Comprobaciones y Aportes

## Pruebas y Resultados
El flujo se probó en navegadores Edge y Chrome (en modo escritorio y móvil), y mediante pruebas unitarias (114 tests) y e2e (69 tests).
- **Acceso y Permisos:** Validado. El MASTER no puede borrar el Quiz Demo. Un PROFESOR no puede ver usuarios ni controlar partidas ajenas. Los invitados no pueden iniciar partidas.
- **Juego Simultáneo:** Validado. Las salas mantienen estados separados. Los mensajes y resultados no se cruzan entre salas.
- **Respuestas:** Validado. El backend rechaza respuestas dobles o fuera de tiempo.
- **Reconexión:** Validado. Al recargar la página (F5), el jugador vuelve a la misma sala con su puntaje intacto.
- **Persistencia:** Validado. Después de reiniciar los contenedores, los quizzes e imágenes siguen en la base de datos.
- **Consumo Independiente:** Validado. El cliente adicional (dashboard de React) consume los contratos del Auth Service y del API principal.

## Limitaciones Conocidas
1. **Escalabilidad:** El estado de las partidas activas vive en la memoria del backend (Map). Si el servidor se cae en medio de una partida, esta se pierde.
2. **Invitados:** El nombre del invitado es un alias, no una identidad verificada.
3. **JWT:** Usamos HS256 (secreto compartido) en lugar de RS256 para simplificar el desarrollo local, pero está documentado como cambio a futuro.

## Aportes del Equipo
- **Jairo (Punto 3):** Diseño del GameSessionModule, Gateway Socket.IO, sistema de invitados por QR, frontend de lobby (Host/Player), pruebas e2e y validación de estado en vivo.
- **[Nombre Compañero 1] (Auth y Puntos 1/2):** Servicio de autenticación independiente, roles MASTER/PROFESOR, gestión de usuarios, dashboard de docentes y CRUD de quizzes.
- **[Nombre Compañero 2] (Punto 4 y Obs):** Implementación del motor de juego (LiveGame), cálculo de puntajes, base de datos de resultados y dashboards de Grafana/OpenTelemetry.