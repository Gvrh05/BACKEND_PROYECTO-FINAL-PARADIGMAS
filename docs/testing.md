# Pruebas

## Unitarias

```powershell
pnpm exec jest --runInBand
pnpm run docs:validate
```

El validador OpenAPI se ejecuta con el runtime nativo de Node para soportar sus
dependencias ESM sin cambiar la configuración CommonJS/ts-jest del proyecto.

## Integración con PostgreSQL 16

Usar una base **descartable** cuyo nombre termine en `_test`. El harness crea un
schema aleatorio por caso, aplica las migraciones reales y elimina únicamente ese
schema al terminar. Nunca usar la base del servicio de autenticación ni datos de
desarrollo/producción para las pruebas.

La suite e2e permite 30 segundos por caso/hook porque arranca Nest, aplica
migraciones y abre conexiones reales. Las pruebas unitarias conservan su timeout
normal; no se usa `--forceExit` para ocultar recursos abiertos.

Ejemplo de servidor independiente (no reutiliza volúmenes de otros proyectos):

```powershell
docker run --name kahoot-quiz-management-test -e POSTGRES_USER=kahoot_test -e POSTGRES_PASSWORD=kahoot_test -e POSTGRES_DB=kahoot_quiz_test -p 127.0.0.1:55432:5432 -d postgres:16-alpine
$env:TEST_DATABASE_URL='postgresql://kahoot_test:kahoot_test@127.0.0.1:55432/kahoot_quiz_test'
pnpm run test:e2e --runInBand
```

Si ya existe ese contenedor, iniciarlo con `docker start kahoot-quiz-management-test`
en lugar de volver a crearlo. Las credenciales anteriores son solo para pruebas.

El harness emite JWT de dos usuarios UUID con secreto de prueba, aplica el mismo
prefijo, CORS, filtros e interceptores que producción y usa una carpeta temporal
exclusiva de uploads. Restaura las variables de entorno al finalizar. La prueba
de reinicio abre dos aplicaciones con conexiones distintas y comprueba que los
datos persisten. La ruta raíz continúa protegida; `/kahoot-api/health` es pública.

Las pruebas de migraciones validan up/down, cascadas, opciones completas al commit,
rangos y rollback; no requieren un emisor de identidad externo.

`authoring-concurrency.e2e-spec.ts` recorre las operaciones JSON con el segundo
usuario y sin token, compara el detalle antes/después y ejercita ocho reemplazos
simultáneos de opciones, altas frente a eliminación del quiz y edición/borrado de
la misma pregunta. Acepta únicamente los órdenes válidos de finalización y verifica
que no quedan opciones huérfanas.

`images.e2e-spec.ts` usa imágenes generadas con sharp y comprueba MIME, firmas,
decodificación, nombres hostiles, tamaño/dimensiones, múltiples archivos, archivos
vacíos, propiedad antes de recibir, streaming privado y rollback de archivos con
una falla diferida al commit. `file-cleanup.e2e-spec.ts` induce un unlink fallido,
reinicia la aplicación y comprueba recuperación, idempotencia y barrido seguro.

Si Jest falla antes de cargar los tests y `node_modules/jest/bin/jest.js` contiene
un hook incompleto de Console Ninja, desactivar la instrumentación de esa extensión
y restaurar la dependencia. No relajar pruebas ni cambiar rutas privadas para
ocultar errores del runner.

`.vscode/settings.json` deshabilita la instrumentación automática de Jest y Nest solo para
este proyecto; no cambia la configuración global ni la de otros proyectos. Si
Cursor ya estaba abierto al cambiarla, recarga su ventana para que la extensión
retire los hooks de procesos anteriores.
