# Observabilidad de la partida

## Purpose

Verificar desde un entorno remoto que una partida real genera señales observables de actividad, errores y latencia de respuesta.

## ADDED Requirements

### Requirement: Telemetría observable desde una partida desplegada
La API desplegada SHALL exportar telemetría mediante OpenTelemetry. Un tablero Grafana accesible de forma autenticada en el entorno remoto SHALL mostrar salas activas, respuestas aceptadas y rechazadas por motivo, reconexiones y latencia de confirmación del servidor.

#### Scenario: Evidencia remota durante el juego
- **WHEN** se abre una sala en la URL de demo, se envía una respuesta válida, se reenvía otra y un participante reconecta
- **THEN** el tablero remoto muestra actividad correspondiente a esas operaciones, diferenciada por entorno y servicio

### Requirement: Privacidad y continuidad del juego
La telemetría SHALL omitir JWT, PIN, nombres, identificadores de usuario y contenido de respuestas. Si la exportación deja de estar disponible, las operaciones de juego SHALL continuar.

#### Scenario: Exportador no disponible
- **WHEN** el destino de telemetría no responde durante una ronda
- **THEN** el anfitrión puede completar la ronda y los jugadores reciben confirmaciones según las reglas normales
