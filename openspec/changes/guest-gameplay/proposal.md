## Why
Permitir alumnos sin cuenta y mantener autorizaciones docentes vigentes.
## What Changes
- Invitaciones aleatorias con credenciales temporales limitadas a una sala.
- Verificación REST/WS común y consulta de actividad/versión a Auth.
- Demo inmutable y exportación sin enlaces ficticios.
## Capabilities
### New Capabilities
- `guest-gameplay`: identidad temporal, límites y reconexión.
- `account-authorization`: cuentas activas, roles y ownership.
- `demo-quiz-protection`: demo de solo lectura.
### Modified Capabilities
- `game-session-join`: handshake de cuenta o invitado, sin ambigüedad.
## Impact
Controladores, gateway, motor en memoria, seed y pruebas. Sin usuarios alumnos en Auth.
