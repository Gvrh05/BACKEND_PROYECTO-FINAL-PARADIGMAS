# Verificación del merge develop → feature/punto3

Base local preservada: `8a1d667`. Se integra el merge pendiente de
`3d4772f` (origin/develop), sin rebase, amend ni cambios en results.

## Resolución

- Motor, módulo y gateway del Punto 3 conservan los contratos de HEAD; no se
  incorporan handlers legacy de respuestas ni el gateway global create_session.
  El test entrante de ese gateway se adapta a join/start autenticados del Punto 3.
- Quizzes conserva entidades, controller, DTOs y CRUD de develop. Las tres
  consultas aditivas usan DataSource y author_id UUID. El alias firmado de demo
  se limita al modo no-production; el selector nunca usa el listado público/demo.
- Se mantienen el guard global y @Public del compañero; las salas usan siempre
  su propio guard HTTP y el mismo TokenVerifier que WS. La integración completa
  por AppModule prueba 401, catálogo, ownership 403, creación, unión e inicio.
- ConfigModule vuelve a ser global. Base de datos, seed manual e integración usan
  la configuración de migraciones del compañero, sin synchronize. Se añade solo
  la migración de game_sessions. Las preguntas del seed respetan las cuatro
  opciones y una correcta exigidas por las constraints de authoring.
- Se conservan todos los servicios Compose y scripts/dependencias de ambos lados;
  se eliminan claves duplicadas y entradas environment inválidas dentro de ports.
- Lockfile: se parte de theirs y se regenera con pnpm install, no se edita a mano.
- OpenAPI conserva los 8 paths de develop y añade los 6 de salas y x-websocket.
  Los nombres de respuestas HTTP que colisionaban se separan para no cambiar
  silenciosamente el sobre de errores de ninguno de los dos contratos.
- OpenSpec de Punto 3 y archivos results son comprobados contra sus respectivas
  versiones de referencia. La integración de authoring ya no conserva el mock [];
  las pruebas históricas que exigían ese mock se adaptan al CRUD real del compañero.

## Resultados

| Verificación | Resultado |
| --- | --- |
| TypeScript `tsc --noEmit` | OK |
| Nest `pnpm build` | OK |
| ESLint `pnpm lint` | OK, sin desactivar reglas |
| Unitarias | 114 pruebas, 17 suites |
| E2E combinados | 69 pruebas, 10 suites |
| Persistencia Punto 3 | 5 pruebas reales |
| OpenAPI / Swagger parser | OK |
| OpenSpec `validate --all --strict` | 7 elementos válidos |
| Compose con .env.example, config --quiet | OK |

Los e2e combinados usan TEST_DATABASE_URL en kahoot_punto3_test, con un esquema
aleatorio por harness y cinco migraciones reales. Se borra solo el esquema creado
por la prueba. El smoke Hello World sigue separado de Postgres. No se ejecutó el
seed manual ni se migró/limpió public de la base de desarrollo. No se reejecutó
Edge contra la BD legacy: primero requiere el plan de migración indicado en README.
Compose fue validado estáticamente; no se desplegaron los servicios auth/frontend.

No se modifica ni se versiona .env. El commit de merge y la publicación se limitan
a feature/punto3; no se publica develop ni se abre PR.
