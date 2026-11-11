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
- **Cuenta MASTER (Demo):** Usuario `profesor_test` / Contraseña `853b81573507dabca43b7696ba64f54de39e`
- **Invitado:** No requiere cuenta. Al crear una sala, escanea el QR o copia el enlace, pon tu nombre y entra.

## Demostración de Juego
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