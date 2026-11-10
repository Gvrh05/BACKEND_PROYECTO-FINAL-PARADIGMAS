# Proposal

## Why

El backend en .NET (API REST + SignalR) necesita autenticar usuarios de manera segura sin emitir tokens propios ni almacenar credenciales o tablas de usuarios, delegando esta responsabilidad a un servicio externo centralizado (`auth-service`). Es fundamental asegurar la validación estricta de firma, emisor, audiencia y expiración de los JWT, identificar de forma confiable al usuario autenticado mediante `ICurrentUser` evitando suplantaciones de identidad (no confiar en el cuerpo de la petición) y proteger tanto las rutas HTTP como las conexiones WebSocket de SignalR.

## What Changes

- **Configuración desacoplada de JWT Bearer**: Lectura flexible mediante `IConfiguration` (appsettings y variables de entorno `Auth:Authority` / `Auth:MetadataAddress`, `Auth:Issuer`, `Auth:Audience` y `Auth:SecretKey`). Plantillas con valores de ejemplo en `appsettings.json`, `appsettings.Development.json` y `.env.example`.
- **Validación criptográfica y preservación de claims**: Validación obligatoria de emisor, audiencia, expiración y clave de firma. Desactivación del mapeo por defecto de claims de Microsoft (`MapInboundClaims = false`) para conservar `sub` y `name`.
- **Política de autorización global**: Protección de todos los endpoints por defecto mediante un `AuthorizeFilter` global o `.RequireAuthorization()`, con excepciones explícitas para `/health` y rutas públicas de lectura de imágenes estáticas (`[AllowAnonymous]`).
- **Servicio `ICurrentUser`**: Abstracción e inyección de dependencia para resolver el `UserId` (desde claim `sub`) y nombre de usuario (desde claim `name` o fallback a `username` emitido por el auth-service), asegurando que la propiedad de cuestionarios y salas se determine únicamente desde el token autenticado.
- **Soporte de autenticación en SignalR**: Extracción del token desde el query parameter `?access_token=` exclusivamente para conexiones hacia rutas bajo `/hubs`.
- **Manejo estandarizado de códigos HTTP**: Retorno de 401 Unauthorized para peticiones no autenticadas o con token inválido/vencido, y 403 Forbidden cuando el usuario autenticado intenta acceder a un recurso ajeno.
- **Suite de pruebas de integración**: Tests automatizados para verificar rechazo sin token (401), token con audiencia incorrecta (401), token expirado (401) y acceso exitoso con token válido (200).

## Capabilities

### New Capabilities
- `jwt-authentication`: Validación de tokens JWT Bearer emitidos por el microservicio de autenticación externo, configuración desacoplada, protección de controladores REST y Hubs de SignalR, y resolución de identidad mediante `ICurrentUser`.

### Modified Capabilities
<!-- None -->

## Impact

- **Seguridad**: Se elimina la posibilidad de que clientes maliciosos envíen `userId` o `ownerId` en el payload HTTP para adjudicarse recursos ajenos.
- **Infraestructura y Configuración**: Requiere variables de entorno o secciones de configuración para la autoridad/emisor/audiencia/clave compartida del auth-service.
- **SignalR**: Conexiones WebSocket requieren enviar el token en la negociación (`?access_token=`).
- **Controladores / Endpoints**: Requieren inyectar `ICurrentUser` en lugar de leer IDs de usuario desde DTOs de entrada.
