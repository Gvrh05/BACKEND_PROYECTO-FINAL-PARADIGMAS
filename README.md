# ProfeLink Kahoot - Proyecto Final Paradigmas

## URLs de los Repositorios
- **Backend/API:** https://github.com/Gvrh05/BACKEND_PROYECTO-FINAL-PARADIGMAS
- **Frontend:** https://github.com/Gvrh05/FRONT_PROYECTO-FINAL_PARAGIDMAS
- **Auth Service:** https://github.com/Gvrh05/AUTH_PROYECTO-FINAL-PARADIGMAS

## Requisitos Previos
- Docker y Docker Compose instalados.
- Git.

## Inicio Rápido (Docker)
Para levantar toda la infraestructura (Auth, API, Frontend, PostgreSQL) y ver la demo:
1. Clona los 3 repositorios en la misma carpeta principal (para que el `docker-compose` los encuentre).
2. Navega a la carpeta del backend: `cd BACKEND_PROYECTO-FINAL-PARADIGMAS`
3. Ejecuta: `docker compose up --build -d --wait`
4. El frontend estará disponible en `http://localhost:45173` (o el puerto configurado en tu `.env`).

## Cuentas de Prueba
- **Cuenta MASTER (Demo):** usuario configurado en `DEMO_USER_USERNAME` (default `profesor_test`). La contraseña es `DEMO_USER_PASSWORD` del entorno privado; no publicarla en Git.
- **Invitado:** No requiere cuenta. Al crear una sala, escanea el QR o copia el enlace, pon tu nombre y entra.

## Demostración de Juego

El demo incluye diez ilustraciones locales. Volver a ejecutar `quiz-seed` completa
solo imágenes ausentes del demo existente, sin cambiar preguntas, respuestas ni
imágenes ya asociadas. Sigue siendo de solo lectura; para jugar crear un quiz
Verdadero/Falso. Detalles: [imágenes demo](public/seeds/README.md).

Configuración pública, CORS y Grafana Cloud:
[guía Railway/Netlify](docs/grafana/railway-netlify.md).
1. Inicia sesión como `profesor_test`.
2. Ve a **Quices** y verifica que el "Quiz Demo" tiene el botón de borrar deshabilitado.
3. Crea un nuevo cuestionario con preguntas Verdadero/Falso.
4. Ve a **Crear Partida**, selecciona tu cuestionario y crea la sala.
5. En otra ventana de incógnito, abre el enlace público/QR que generó la sala.
6. Ingresa un nombre y presiona **Unirse**.
7. En la ventana del profesor, presiona **Iniciar partida**.
8. Ambos verán la misma pregunta. El invitado responde y el profesor ve el resultado en vivo.

## Imágenes Publicadas en Docker Hub

Las imágenes oficiales del proyecto están compiladas y disponibles públicamente en Docker Hub para su despliegue:

- **Backend API:** [jairito980/kahoot-backend:latest](https://hub.docker.com/r/jairito980/kahoot-backend)
- **Frontend Web:** [jairito980/kahoot-frontend:latest](https://hub.docker.com/r/jairito980/kahoot-frontend)
- **Auth Service:** [jairito980/kahoot-auth:latest](https://hub.docker.com/r/jairito980/kahoot-auth)
