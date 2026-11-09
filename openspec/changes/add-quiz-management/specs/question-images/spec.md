# Spec Delta

## Purpose

Permitir adjuntar una imagen opcional a cada pregunta, manteniendo la privacidad del propietario y evitando asociaciones rotas cuando una carga o sustitución falla.

## ADDED Requirements

### Requirement: Asociar una imagen opcional
El sistema SHALL permitir al propietario agregar o reemplazar una única imagen por pregunta mediante `PUT /quizzes/:quizId/questions/:questionId/image` con `multipart/form-data` y un archivo `image`. La respuesta MUST ser `200` con la pregunta actualizada y un `imageUrl` de lectura autenticada; sin imagen MUST devolver `imageUrl: null`.

#### Scenario: Agregar primera imagen
- **WHEN** el propietario carga un archivo válido para una pregunta sin imagen
- **THEN** la pregunta queda asociada a esa imagen y los demás campos no cambian

#### Scenario: Pregunta sin imagen
- **WHEN** se crea o consulta una pregunta sin archivo asociado
- **THEN** la pregunta sigue siendo válida y su `imageUrl` es `null`

### Requirement: Validar los archivos recibidos
El sistema SHALL aceptar únicamente JPEG, PNG y WebP con contenido compatible con el tipo declarado, hasta 25 megapíxeles y un tamaño máximo de 5 MiB por defecto, configurable en el servidor. MUST rechazar archivos vacíos, multipart sin archivo y múltiples archivos; MUST impedir que nombres de cliente determinen rutas de almacenamiento.

#### Scenario: Formatos permitidos
- **WHEN** se carga un JPEG, PNG o WebP válido dentro del límite
- **THEN** se acepta y devuelve con el tipo de contenido correspondiente

#### Scenario: Archivo excesivo
- **WHEN** el archivo supera el límite configurado
- **THEN** la API responde `413` y conserva la asociación anterior, si existía

#### Scenario: Tipo no permitido o falsificado
- **WHEN** se carga un SVG, un archivo no imagen o contenido que no coincide con su tipo declarado
- **THEN** la API responde `415` sin conservarlo como imagen de la pregunta

#### Scenario: Imagen con dimensiones excesivas
- **WHEN** el archivo está dentro del límite de bytes pero supera 25 megapíxeles al decodificarse
- **THEN** la API responde `415` sin sustituir la imagen anterior

#### Scenario: Archivo faltante, vacío o múltiple
- **WHEN** el multipart no contiene exactamente un archivo no vacío en `image`
- **THEN** la API responde `400` sin modificar la pregunta

#### Scenario: Nombre de archivo malicioso
- **WHEN** el nombre aportado por el cliente contiene rutas o secuencias de directorio padre
- **THEN** ese nombre no permite escribir fuera del área de archivos configurada

### Requirement: Lectura privada de imágenes
El sistema SHALL entregar la imagen únicamente al propietario mediante `GET /quizzes/:quizId/questions/:questionId/image`, con tipo de contenido correcto y sin caché compartida. MUST exigir autenticación y comprobar pertenencia y propiedad igual que en las preguntas; los archivos MUST NOT quedar expuestos mediante una ruta estática pública alternativa.

#### Scenario: Lectura por el propietario
- **WHEN** el propietario solicita una imagen asociada con un token válido
- **THEN** recibe `200` con el contenido binario y cabeceras que impiden el almacenamiento en caché compartida

#### Scenario: Imagen ajena o ruta anidada incorrecta
- **WHEN** otro usuario solicita la imagen o se usa un cuestionario que no contiene la pregunta
- **THEN** recibe `404` sin bytes del archivo ni su ruta física

#### Scenario: Lectura sin token
- **WHEN** se solicita una imagen sin token válido
- **THEN** la API responde `401` y no entrega su contenido

#### Scenario: Imagen ausente o ruta estática alternativa
- **WHEN** se consulta una pregunta sin imagen o se intenta acceder directamente a un archivo almacenado por una ruta pública
- **THEN** no se entrega el archivo y la consulta privada sin imagen responde `404`

### Requirement: Reemplazo sin pérdida de la imagen anterior
El sistema SHALL confirmar una sustitución solo cuando el nuevo archivo y su asociación sean utilizables. Si la validación, el almacenamiento o la persistencia falla, MUST conservar la imagen anterior y no publicar una nueva asociación; las sustituciones concurrentes MUST dejar como máximo una imagen activa.

#### Scenario: Sustitución exitosa
- **WHEN** el propietario reemplaza una imagen por otra válida
- **THEN** el endpoint de lectura entrega la nueva imagen y la anterior deja de estar asociada

#### Scenario: Falla de escritura o persistencia
- **WHEN** ocurre un error al guardar el nuevo archivo o actualizar la asociación
- **THEN** la API devuelve un error, la imagen previa sigue disponible y no queda publicada una referencia rota

#### Scenario: Dos sustituciones concurrentes
- **WHEN** se procesan dos reemplazos simultáneos sobre una pregunta
- **THEN** solo una asociación final queda activa y los archivos descartados quedan sujetos a limpieza

### Requirement: Desasociar y limpiar archivos
El sistema SHALL permitir quitar la imagen mediante `DELETE /quizzes/:quizId/questions/:questionId/image` sin borrar la pregunta. MUST invalidar inmediatamente el acceso al eliminar una imagen, pregunta o cuestionario y retirar los archivos descartados; una falla temporal de borrado MUST quedar pendiente de reintento persistente.

#### Scenario: Quitar imagen existente o ausente
- **WHEN** el propietario elimina la imagen de una pregunta propia
- **THEN** recibe `204`, la pregunta queda con `imageUrl: null` y la lectura de imagen responde `404`
- **AND** la misma operación responde `204` si la pregunta ya no tenía imagen

#### Scenario: Eliminación de pregunta o cuestionario
- **WHEN** se elimina una pregunta o su cuestionario
- **THEN** todas sus imágenes dejan de ser accesibles y sus archivos son retirados o quedan pendientes de limpieza

#### Scenario: Falla temporal de limpieza y reinicio
- **WHEN** el sistema no puede borrar un archivo descartado y luego reinicia
- **THEN** el archivo sigue sin ser accesible por la API y el trabajo de limpieza pendiente puede reintentarse sin perderse
