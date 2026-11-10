# Spec Delta

## Purpose

Permitir adjuntar una imagen opcional a cada pregunta y servirla públicamente desde una ruta relativa persistida, evitando asociaciones rotas cuando una carga o sustitución falla.

## ADDED Requirements

### Requirement: Asociar una imagen opcional
El sistema SHALL permitir al propietario agregar o reemplazar una única imagen por pregunta mediante `POST` o `PUT /quizzes/:quizId/questions/:questionId/image` con `multipart/form-data` y un archivo `image`. La respuesta MUST ser `200` con la pregunta actualizada y la ruta pública persistida `/uploads/questions/<filename>` como `imageUrl`; sin imagen MUST devolver `imageUrl: null`.

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

### Requirement: Lectura pública de imágenes
El sistema SHALL servir imágenes de preguntas sin Bearer en `/uploads/questions/<filename>`. Los nombres de uploads MUST usar UUID; los assets demo MUST usar `q1.png`–`q10.png`. `imageUrl` MUST almacenarse en la base de datos junto con sus metadatos y coincidir con la ruta pública. La antigua ruta `GET /quizzes/:quizId/questions/:questionId/image` MAY mantenerse como compatibilidad autenticada.

#### Scenario: Lectura pública
- **WHEN** cualquier cliente solicita un `imageUrl` asociado
- **THEN** recibe `200` con el contenido binario y su MIME sin necesitar token

#### Scenario: Imagen ausente
- **WHEN** se solicita una ruta pública inexistente
- **THEN** la API responde `404` sin revelar rutas físicas

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

### Requirement: Persistir la ruta pública relativa
Cada carga MUST actualizar en una transacción `imageUrl`, `imageStorageKey`, MIME y tamaño. Migraciones MUST convertir las asociaciones previas a `/uploads/questions/<key>`. Quitar o sustituir una imagen MUST limpiar `imageUrl` en la misma transacción que desasocia la clave.

#### Scenario: Persistir y quitar la ruta pública
- **WHEN** se carga, migra o elimina una imagen asociada
- **THEN** la base conserva una ruta pública consistente con la clave o limpia la ruta al desasociar
