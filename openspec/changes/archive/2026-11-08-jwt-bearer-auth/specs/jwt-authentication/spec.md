# Spec Delta

## Purpose

Provee validación centralizada de tokens JWT Bearer emitidos por un servicio de autenticación externo para proteger endpoints HTTP y conexiones de SignalR, estableciendo el contexto de usuario autenticado mediante ICurrentUser.

## ADDED Requirements

### Requirement: Configuration-driven JWT Bearer Validation
El sistema MUST / DEBE cargar los parámetros de autenticación JWT (Authority/MetadataAddress, Issuer, Audience, SecretKey) exclusivamente desde la configuración del entorno (`appsettings.json`, variables de entorno) sin valores fijos en el código fuente.

#### Scenario: Carga exitosa de configuración JWT
- **WHEN** el backend inicializa y lee la sección `Auth` desde `appsettings` o variables de entorno
- **THEN** el middleware de autenticación queda configurado con los parámetros provistos

#### Scenario: Configuración faltante o vacía
- **WHEN** el backend inicializa con valores faltantes para los parámetros esenciales de JWT
- **THEN** la aplicación arroja un error descriptivo de inicio impidiendo la ejecución insegura

### Requirement: Cryptographic Token and Claim Validation
El sistema MUST / DEBE validar criptográficamente la firma del token, emisor, audiencia y expiración, y DEBE desactivar el mapeo de claims predeterminado (`MapInboundClaims = false`) para conservar `sub` y `name` originales.

#### Scenario: Petición con token válido y vigente
- **WHEN** el cliente envía un Bearer token con firma correcta, audiencia coincidente y no expirado
- **THEN** la petición es autenticada con éxito y los claims `sub` y `name` quedan disponibles sin mutar

#### Scenario: Petición sin token de autenticación
- **WHEN** un cliente realiza una petición a un endpoint protegido sin cabecera `Authorization`
- **THEN** el sistema responde con código HTTP 401 Unauthorized

#### Scenario: Token con firma alterada o inválida
- **WHEN** un cliente envía un token firmado con una clave incorrecta o manipulado
- **THEN** el sistema rechaza la petición con código HTTP 401 Unauthorized

#### Scenario: Token con audiencia incorrecta
- **WHEN** un cliente envía un token emitido para una audiencia diferente a la configurada
- **THEN** el sistema rechaza la petición con código HTTP 401 Unauthorized

#### Scenario: Token expirado
- **WHEN** un cliente envía un token cuya fecha de expiración (`exp`) ya ha transcurrido
- **THEN** el sistema rechaza la petición con código HTTP 401 Unauthorized

### Requirement: Global Endpoint Authorization and Public Exceptions
El sistema MUST / DEBE aplicar autorización obligatoria a todos los endpoints por defecto, permitiendo acceso anónimo únicamente a `/health` y a la lectura de imágenes públicas.

#### Scenario: Endpoint protegido invocado anónimamente
- **WHEN** un cliente intenta acceder a cualquier endpoint de cuestionarios, salas o resultados sin credenciales
- **THEN** el sistema deniega el acceso retornando 401 Unauthorized

#### Scenario: Consulta a health check anónima
- **WHEN** un cliente o balanceador consulta la ruta `/health` sin credenciales
- **THEN** el sistema responde satisfactoriamente con código HTTP 200 OK

#### Scenario: Lectura de imágenes estáticas anónima
- **WHEN** un cliente solicita una imagen almacenada mediante la ruta pública de lectura
- **THEN** el sistema entrega el recurso estático sin exigir token de autenticación

### Requirement: Authenticated Context via ICurrentUser
El sistema MUST / DEBE resolver la identidad del usuario actual a través del servicio `ICurrentUser` leyendo `UserId` desde el claim `sub` y el nombre desde `name` (o `username`), y NUNCA DEBE aceptar el identificador del propietario desde el cuerpo de la petición.

#### Scenario: Creación de cuestionario o sala
- **WHEN** un usuario autenticado crea un cuestionario o sala
- **THEN** el sistema asocia la propiedad del recurso al `UserId` obtenido de `ICurrentUser` e ignora cualquier ID de dueño enviado en el cuerpo de la petición

#### Scenario: Intento de modificación de recurso ajeno
- **WHEN** un usuario autenticado intenta modificar o eliminar un cuestionario perteneciente a otro `UserId`
- **THEN** el sistema rechaza la operación retornando código HTTP 403 Forbidden

### Requirement: SignalR Hub Authentication via Query Parameter
El sistema MUST / DEBE autenticar conexiones WebSocket dirigidas a rutas bajo `/hubs` extrayendo el Bearer token desde el query parameter `access_token`.

#### Scenario: Conexión exitosa al Hub de SignalR
- **WHEN** un cliente WebSocket se conecta a `/hubs/*` enviando `?access_token=<token_valido>`
- **THEN** la conexión es autenticada y asociada al contexto del usuario

#### Scenario: Conexión al Hub sin token o con token inválido
- **WHEN** un cliente WebSocket se conecta a `/hubs/*` sin token o con un token vencido
- **THEN** el servidor rechaza el handshake de conexión retornando 401 Unauthorized

#### Scenario: Parámetro access_token en rutas REST normales
- **WHEN** un cliente realiza una petición a una ruta de API REST común incluyendo `?access_token=` en lugar de la cabecera `Authorization`
- **THEN** el sistema no procesa el query parameter como credencial y exige la cabecera Bearer
