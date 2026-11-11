# Spec Delta

## Purpose

Permitir que cada usuario autenticado administre sus propios cuestionarios y preguntas de cuatro opciones, con persistencia y aislamiento entre propietarios.

## ADDED Requirements

### Requirement: Identidad autenticada obligatoria
El sistema SHALL exigir un JWT válido con `sub` de tipo UUID para todas las operaciones de autoría. La identidad del propietario MUST derivarse exclusivamente del `sub` verificado y no de campos aportados por el cliente.

#### Scenario: Solicitud sin identidad válida
- **WHEN** se solicita cualquier operación sin token, con token inválido o expirado, o con `sub` ausente o no UUID
- **THEN** la API responde `401` y no consulta ni modifica recursos de autoría

#### Scenario: Intento de asignar otro propietario
- **WHEN** un usuario envía `authorId` en el cuerpo de creación o edición
- **THEN** la API responde `400` y no permite asignar ni cambiar el propietario

### Requirement: Crear cuestionarios persistentes
El sistema SHALL permitir crear un cuestionario con título obligatorio de 1 a 150 caracteres tras recortar extremos, descripción opcional de hasta 2000 caracteres y `coverImageUrl` opcional HTTP(S). MUST devolver el recurso con UUID, propietario y fechas, inicialmente sin preguntas.

#### Scenario: Creación correcta
- **WHEN** un usuario envía un título válido y metadatos opcionales a `POST /quizzes`
- **THEN** recibe `201` con el cuestionario persistido y asociado a su identidad
- **AND** el recurso sigue disponible después de reiniciar la API

#### Scenario: Cuestionario inválido
- **WHEN** falta el título, queda vacío tras recortarlo, excede su límite o los metadatos no cumplen sus tipos y límites
- **THEN** la API responde `400` sin crear el cuestionario

### Requirement: Consultar únicamente cuestionarios propios
El sistema SHALL listar solo cuestionarios del usuario autenticado y permitir consultar el detalle de uno propio con sus preguntas y opciones. MUST devolver `404` para identificadores UUID inexistentes o ajenos, sin revelar su existencia; un identificador de ruta no UUID MUST producir `400`.

#### Scenario: Lista aislada por usuario
- **WHEN** dos usuarios tienen cuestionarios y uno consulta `GET /quizzes`
- **THEN** recibe `200` con un arreglo que contiene únicamente los suyos, o `[]` si no tiene ninguno

#### Scenario: Detalle propio
- **WHEN** el propietario consulta `GET /quizzes/:quizId`
- **THEN** recibe `200` con los metadatos, preguntas y cuatro opciones por pregunta, incluyendo cuál es correcta

#### Scenario: Lectura ajena o inexistente
- **WHEN** un usuario consulta un UUID ajeno o inexistente
- **THEN** recibe el mismo resultado `404` sin contenido del cuestionario

### Requirement: Editar metadatos del cuestionario
El sistema SHALL permitir al propietario actualizar parcialmente título, descripción y portada mediante `PATCH /quizzes/:quizId`. Los campos omitidos MUST conservarse; `null` MUST permitir quitar descripción o portada, pero no el título. Un cambio válido MUST actualizar `updatedAt`.

#### Scenario: Actualización parcial
- **WHEN** el propietario modifica únicamente el título
- **THEN** recibe `200` con el recurso actualizado, conservando descripción, portada y preguntas

#### Scenario: Limpiar datos opcionales
- **WHEN** el propietario envía `description: null` y `coverImageUrl: null`
- **THEN** ambos datos quedan ausentes en el recurso persistido

#### Scenario: Edición no autorizada
- **WHEN** otro usuario intenta editar el cuestionario
- **THEN** recibe `404` y los datos no cambian

### Requirement: Eliminar un cuestionario completo
El sistema SHALL permitir al propietario eliminar un cuestionario mediante `DELETE /quizzes/:quizId`, junto con sus preguntas y opciones. Tras confirmar la eliminación, el recurso y las imágenes asociadas MUST dejar de ser accesibles por la API.

#### Scenario: Eliminación en cascada
- **WHEN** el propietario elimina un cuestionario que contiene preguntas e imágenes
- **THEN** recibe `204` sin cuerpo y las consultas posteriores a sus recursos responden `404`

#### Scenario: Eliminación ajena
- **WHEN** otro usuario intenta eliminar el cuestionario
- **THEN** recibe `404` y el cuestionario, preguntas e imágenes permanecen intactos

### Requirement: Preguntas con una única opción correcta
El sistema SHALL aceptar preguntas con `questionText` de texto plano de 1 a 2000 caracteres y exactamente cuatro opciones de texto de 1 a 500 caracteres, tras recortar extremos. Cada opción MUST tener `isCorrect` booleano: exactamente uno `true` y tres `false`. MUST rechazar valores booleanos expresados como texto o números.

#### Scenario: Cuatro opciones válidas
- **WHEN** se envía un enunciado y cuatro opciones no vacías con una única correcta
- **THEN** el sistema acepta la pregunta y conserva el orden de las opciones

#### Scenario: Cardinalidad o selección incorrecta
- **WHEN** hay tres o cinco opciones, ninguna o varias correctas, texto vacío, o `isCorrect` vale `"false"`, `0` o `1`
- **THEN** la API responde `400` sin alterar la pregunta ni sus opciones

#### Scenario: Texto no interpretado como marcado
- **WHEN** el enunciado u opciones contienen caracteres con aspecto de HTML
- **THEN** se tratan como texto literal y no como contenido ejecutable

### Requirement: CRUD de preguntas subordinado al cuestionario
El sistema SHALL permitir crear, listar, consultar, editar y eliminar preguntas bajo `/quizzes/:quizId/questions`. MUST verificar propietario y pertenencia al cuestionario en cada operación; una pregunta ajena o asociada a otro cuestionario MUST responder `404`, aunque su UUID exista.

#### Scenario: Crear y consultar pregunta
- **WHEN** el propietario crea una pregunta válida con `POST /quizzes/:quizId/questions`
- **THEN** recibe `201` con UUID de pregunta y de opciones, y puede obtenerla mediante listado y `GET /quizzes/:quizId/questions/:questionId`

#### Scenario: Editar pregunta de forma parcial
- **WHEN** el propietario envía `PATCH /quizzes/:quizId/questions/:questionId` con un nuevo enunciado y omite las opciones
- **THEN** recibe `200` con el enunciado cambiado y las opciones anteriores intactas

#### Scenario: Sustituir opciones atómicamente
- **WHEN** el propietario envía nuevas opciones válidas en un PATCH
- **THEN** se sustituyen las cuatro opciones como un conjunto, sin estados parciales visibles
- **AND** si la operación falla, se conservan íntegramente los datos anteriores

#### Scenario: Eliminar una pregunta
- **WHEN** el propietario elimina una pregunta con `DELETE /quizzes/:quizId/questions/:questionId`
- **THEN** recibe `204`, desaparecen sus opciones y asociación de imagen y las demás preguntas permanecen intactas

#### Scenario: Ruta anidada incorrecta o ajena
- **WHEN** se intenta cualquier operación usando una pregunta de otro cuestionario o de otro propietario
- **THEN** la API responde `404` sin leer ni modificar ese recurso

### Requirement: Compatibilidad de los parámetros de pregunta
El sistema SHALL conservar `timeLimitSeconds` y `points`. En creación, si se omiten MUST usar 20 segundos y 1000 puntos; si se incluyen MUST ser enteros, con tiempo entre 1 y 300 y puntos entre 0 y 100000. En edición, los campos omitidos MUST conservar sus valores.

#### Scenario: Valores predeterminados
- **WHEN** se crea una pregunta sin tiempo ni puntos
- **THEN** el recurso persistido y devuelto contiene `timeLimitSeconds: 20` y `points: 1000`

#### Scenario: Valores fuera de rango
- **WHEN** se envían fracciones, texto numérico, tiempo fuera de rango o puntos negativos
- **THEN** la API responde `400` sin modificar datos

### Requirement: Mutaciones validadas y respuesta coherente
El sistema SHALL rechazar propiedades desconocidas, campos de solo lectura, JSON con tipos incorrectos y PATCH sin campos editables mediante `400`. Las creaciones MUST responder `201`, las lecturas y ediciones `200`, y las eliminaciones `204`; los errores MUST conservar el sobre existente con `statusCode`, `timestamp`, `path` y `error`.

#### Scenario: Campos no editables
- **WHEN** se envía `id`, `quizId`, `imageUrl` o fechas como campos editables de una pregunta
- **THEN** la API responde `400`; la imagen solo se gestiona por su operación de archivo específica

#### Scenario: PATCH vacío o inválido
- **WHEN** se envía un cuerpo vacío o tipos incorrectos a una actualización
- **THEN** la API responde `400` sin modificar recursos
