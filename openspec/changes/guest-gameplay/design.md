## Context
Las salas son de una instancia y sus participantes viven en memoria.
## Decisions
Cada sala recibe UUID e invitationId aleatorio no reutilizable al reciclar PIN.
Guardar hashes SHA-256 de secretos aleatorios de 256 bits con expiración.
El gateway acepta exclusivamente token de cuenta o guestToken y verifica en cada evento.
Invitados solo entran/reconectan a su sala y responden; no controlan rondas.
Auth valida cuentas online con timeout y fallo seguro 503. MASTER no evita ownership.
No transformar preguntas demo ni agregar exportación real.
## Risks
Reiniciar pierde partidas e invalida invitados. No hay coordinación distribuida.
El alias no prueba identidad académica. Rate limit acotado por IP y sala.
## Migration
Provisionar Auth antes del seed, que solo hace login. Conservar bases y volúmenes.
