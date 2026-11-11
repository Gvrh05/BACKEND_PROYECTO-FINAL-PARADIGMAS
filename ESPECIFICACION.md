# Especificación del Sistema: ProfeLink Kahoot (Punto 3 + Extras)

## 1. Alcance y Reglas
El sistema permite a docentes autenticados crear y gestionar cuestionarios de Verdadero/Falso, y organizar salas de juego en vivo. Los estudiantes pueden ingresar mediante un código de 6 dígitos o un enlace QR público, sin necesidad de crear una cuenta, solo ingresando un alias.
**Reglas de Juego:** Cada pregunta vale 1 punto. Se otorga 1 punto por respuesta correcta y 0 por error o falta de respuesta. El sistema bloquea envíos duplicados y respuestas fuera del tiempo límite.

## 2. Arquitectura del Sistema
El sistema sigue un estilo de **Monolito Modular** con arquitectura interna en **N-Capas** y separación frontend/backend:
- **Frontend (React + Vite):** Consume la API REST y los eventos WebSocket. Implementa un patrón de "Router" y contextos de sesión.
- **Backend Principal (NestJS + PostgreSQL):** Dividido en módulos (`auth`, `quizzes`, `game-session`, `results`). Comunica estado en tiempo real mediante Socket.IO. Utiliza TypeORM con migraciones explícitas.
- **Servicio de Autenticación (NestJS):** API independiente (Auth Service) que emite y valida JWT (HS256). Gestiona roles MASTER, PROFESOR e Invitados.

**Comunicación:**
- **REST:** Para operaciones CRUD y autenticación.
- **WebSockets (Socket.IO):** Namespace `/game` para transmisión de estado en tiempo real (join-session, start-session, session-state).

## 3. Diagrama de Clases y Modelo de Datos
**Entidades Principales (TypeORM):**
- `Quiz` (id, title, authorId, isDemo)
- `Question` (id, quizId, statement, correctAnswer, order, imageUrl)
- `GameSession` (id, roomCode, quizId, hostId, status [LOBBY, IN_PROGRESS, FINISHED], startedAt, finishedAt)
- `User` (Auth) (id, username, role, isActive, credentialVersion)

**Diagrama de Clases:**
- `GameSessionService` orquesta a `SessionManager` (memoria) y `GameSessionEntity` (DB).
- `GameGateway` escucha eventos WS y delega al servicio. Los guards validan JWT.

## 4. API y Eventos en Vivo
**Endpoints Principales:**
- `POST /auth/login` (JWT)
- `GET /kahoot-api/game-sessions/available-quizzes`
- `POST /kahoot-api/game-sessions` (crear sala)
- `POST /kahoot-api/game-sessions/:roomCode/join` (unirse)
- `POST /kahoot-api/game-sessions/:roomCode/start` (iniciar)

**Eventos WebSocket:**
- `join-session` (C→S): `{ roomCode }`
- `session-state` (S→C): `{ sessionId, status, participants, currentQuestion }`
- `start-session` (C→S): `{ roomCode }`
- `session-started` (S→C): `{ sessionId, startedAt }`