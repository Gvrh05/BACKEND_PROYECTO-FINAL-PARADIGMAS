# Spec Delta

## Purpose

Ofrecer una experiencia web adaptable para que usuarios autenticados administren cuestionarios, preguntas e imágenes propias mediante el backend de autoría.

## ADDED Requirements

### Requirement: Acceso mediante el servicio de identidad existente
La interfaz SHALL permitir ingresar con usuario y contraseña usando el login existente, consumir su `accessToken` y adjuntarlo como Bearer a las llamadas de autoría. MUST mantenerlo solo en memoria, no incluir credenciales en URLs ni registros y limpiar token y datos privados al cerrar sesión o recibir `401` de la API.

#### Scenario: Acceso correcto
- **WHEN** un usuario envía credenciales válidas al formulario de acceso
- **THEN** la interfaz obtiene la sesión y muestra sus cuestionarios mediante una llamada autenticada

#### Scenario: Credenciales incorrectas
- **WHEN** el login rechaza las credenciales
- **THEN** se muestra un mensaje comprensible y no se abre el editor autenticado

#### Scenario: Sesión finalizada o expirada
- **WHEN** el usuario cierra sesión, recarga la aplicación o recibe `401` de la API
- **THEN** no se muestran los datos privados de la sesión anterior y se solicita iniciar sesión nuevamente

### Requirement: Listado de cuestionarios propios
La interfaz SHALL consultar la API y presentar los cuestionarios propios con acciones de crear, abrir, editar y eliminar. MUST distinguir carga, lista vacía, error y resultados; MUST permitir reintentar una consulta fallida sin mostrar datos de otro usuario.

#### Scenario: Lista vacía
- **WHEN** la API devuelve un arreglo vacío
- **THEN** se muestra un estado sin cuestionarios y una acción para crear el primero

#### Scenario: Error recuperable
- **WHEN** la consulta falla por red o error del servidor
- **THEN** se muestra el error y una opción de reintento, sin representar la falla como lista vacía

### Requirement: Crear y editar cuestionarios
La interfaz SHALL permitir crear y editar título y descripción, conservar metadatos no modificados y validar sus límites antes de enviar. MUST mostrar confirmación solo tras respuesta exitosa y bloquear envíos repetidos mientras una mutación está pendiente.

#### Scenario: Crear cuestionario
- **WHEN** el usuario envía metadatos válidos
- **THEN** se guarda el cuestionario y se abre su detalle para agregar preguntas

#### Scenario: Validación y error de servidor
- **WHEN** el título está vacío o la API rechaza la operación
- **THEN** se explica el problema y se conservan los campos escritos para corregir o reintentar

#### Scenario: Conservar portada existente
- **WHEN** se edita el título de un cuestionario que ya tiene `coverImageUrl`
- **THEN** la portada no se elimina ni se sustituye implícitamente

### Requirement: Editor de preguntas de cuatro opciones
La interfaz SHALL permitir crear, consultar, editar y eliminar preguntas del cuestionario abierto. MUST presentar un enunciado de texto plano y cuatro campos de opción, con un selector exclusivo de la respuesta correcta; MUST impedir guardar opciones vacías o sin una única correcta.

#### Scenario: Guardar pregunta válida
- **WHEN** se completan enunciado y cuatro opciones y se selecciona una como correcta
- **THEN** se envía una opción con `isCorrect: true` y tres con `isCorrect: false`, y la pregunta guardada aparece en el detalle

#### Scenario: Cambiar respuesta correcta
- **WHEN** el usuario selecciona una opción diferente
- **THEN** la selección previa se desmarca y el envío conserva exactamente una opción correcta

#### Scenario: Pregunta incompleta
- **WHEN** falta enunciado, texto de una opción o selección correcta
- **THEN** se muestra el error en el formulario y no se envía una pregunta inválida

#### Scenario: Editar sin perder ajustes existentes
- **WHEN** se abre una pregunta existente y se modifica solo su texto
- **THEN** se conservan sus opciones, tiempo, puntos e imagen salvo modificación explícita

### Requirement: Adjuntar y visualizar imágenes privadas
La interfaz SHALL ofrecer selección opcional de JPEG, PNG o WebP, vista previa, reemplazo y eliminación de imagen. MUST consultar las imágenes guardadas con autenticación, no colocando el token en la URL; MUST mostrar errores de tipo o tamaño y liberar las vistas previas al descartarlas o cerrar sesión.

#### Scenario: Vista previa y guardado
- **WHEN** el usuario selecciona un archivo válido y guarda la pregunta
- **THEN** ve una previsualización y, tras la carga exitosa, puede ver la imagen persistida al volver a consultar el detalle

#### Scenario: Archivo inválido
- **WHEN** el archivo no pertenece a un formato permitido o supera el límite configurado
- **THEN** se informa el error y no se muestra la imagen como guardada

#### Scenario: Quitar imagen
- **WHEN** el usuario confirma quitar la imagen de una pregunta
- **THEN** la interfaz actualiza la pregunta sin imagen después de recibir éxito de la API

### Requirement: Guardado por etapas con fallas explícitas
La interfaz SHALL distinguir el guardado de datos de pregunta de la posterior carga de su imagen. Si la pregunta se guarda pero el archivo falla, MUST conservar el recurso creado, indicar éxito parcial y permitir reintentar solo el archivo sin duplicar preguntas ni perder los campos editados.

#### Scenario: Falla de imagen después de crear pregunta
- **WHEN** la API crea la pregunta y luego rechaza o no completa la carga de imagen
- **THEN** se indica que la pregunta existe pero la imagen no se guardó, manteniendo una acción de reintento de carga

#### Scenario: Reintento únicamente del archivo
- **WHEN** el usuario reintenta la carga tras ese éxito parcial
- **THEN** se usa el identificador de la pregunta existente y no se repite su creación

### Requirement: Confirmar operaciones destructivas
La interfaz SHALL pedir confirmación antes de borrar un cuestionario o pregunta, aclarando que se eliminarán sus datos asociados. MUST mantener los elementos visibles si la operación falla y retirarlos solo al confirmar éxito; cancelar MUST NOT emitir la solicitud destructiva.

#### Scenario: Cancelar eliminación
- **WHEN** el usuario cancela la confirmación
- **THEN** no se llama al DELETE y el elemento permanece intacto

#### Scenario: Eliminación confirmada o fallida
- **WHEN** el usuario confirma borrar un elemento
- **THEN** se bloquea la acción durante la solicitud y se elimina de la vista solo tras `204`; si falla, se conserva con un mensaje

### Requirement: Acceso denegado y recurso desaparecido
La interfaz SHALL tratar `404` de un cuestionario o pregunta como recurso no disponible, sin permitir seguir editando una copia obsoleta ni exponer información sobre otros propietarios. MUST ofrecer volver al listado y conservar el manejo diferenciado de `401` como sesión finalizada.

#### Scenario: Recurso eliminado en otra pestaña
- **WHEN** el detalle o una mutación recibe `404`
- **THEN** se muestra que el recurso no está disponible y se ofrece regresar al listado

### Requirement: Uso adaptable y accesible
La interfaz SHALL funcionar desde 320 píxeles de ancho y en escritorio, con formularios etiquetados, selección correcta operable por teclado, foco visible y errores perceptibles. MUST representar enunciados y opciones como texto, no como HTML ejecutable.

#### Scenario: Edición en pantalla móvil
- **WHEN** se usa el listado y editor a 320 píxeles de ancho
- **THEN** sus acciones y cuatro opciones siguen siendo utilizables sin desplazamiento horizontal obligatorio

#### Scenario: Teclado y texto literal
- **WHEN** se completa el formulario por teclado y se consulta una pregunta que contiene etiquetas HTML en su texto
- **THEN** se puede elegir la respuesta correcta y guardar con etiquetas accesibles, y el contenido se muestra literalmente sin ejecutarse
