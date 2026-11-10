# Design

## Context

El backend en .NET (ASP.NET Core con API REST y Hubs de SignalR) actúa exclusivamente como consumidor de recursos protegidos. La emisión de credenciales y generación de JWT ocurre en un repositorio independiente (`auth-service`).

Al inspeccionar el `auth-service` actual:
- **Algoritmo de firma**: `HS256` (HMAC-SHA256 con clave simétrica `JWT_SECRET`, default `secret_key_compartida`).
- **Payload del token**:
  - `sub`: `user.id` (UUID en string).
  - `username`: `user.username` (nombre de usuario).
  - `role`: `user.role` (`'PROFESOR'` o `'ESTUDIANTE'`).
- **Emisor y Audiencia**: Actualmente el `auth-service` no fija `issuer` ni `audience` en su configuración inicial por defecto (`JwtModule.register({ signOptions: { expiresIn: '1d' } })`), por lo que ambos valores deben alinearse mediante variables de entorno para entornos productivos.

## Goals / Non-Goals

**Goals:**
- Configurar autenticación `JwtBearer` en ASP.NET Core desacoplada en `IConfiguration` (soporte para `Authority`/`MetadataAddress` o `IssuerSigningKey` con clave simétrica/asimétrica, `Issuer`, `Audience`).
- Desactivar el mapeo heredado de claims de WS-Federation (`MapInboundClaims = false`) para conservar `sub` y `name` limpios en `ClaimsPrincipal`.
- Implementar la interfaz `ICurrentUser` inyectada como Scoped vía `IHttpContextAccessor`, garantizando que la autoría de recursos provenga exclusivamente del token verificado.
- Configurar el evento `OnMessageReceived` en SignalR para admitir `?access_token=` únicamente en rutas `/hubs/*`.
- Aplicar autorización global por defecto (`FallbackPolicy`), dejando como excepciones públicas `/health` y endpoints de imágenes estáticas.
- Estandarizar respuestas: 401 Unauthorized ante falta o invalidez de token, 403 Forbidden cuando el usuario autenticado carece de permisos sobre un recurso.
- Implementar suite de pruebas automatizadas que verifiquen 401 (sin token, audiencia errónea, expirado) y 200 (token válido).

**Non-Goals:**
- No emitir tokens, refrescar tokens ni manejar credenciales o contraseñas en este backend.
- No crear tablas locales de usuarios ni replicar entidades de cuentas.

## Decisions

### 1. Desactivación de Mapeo de Claims (`MapInboundClaims = false`)
- **Decisión**: Limpiar el diccionario global de mapeo `JsonWebTokenHandler.DefaultInboundClaimTypeMap.Clear()` y establecer `options.MapInboundClaims = false`.
- **Razón**: Por compatibilidad histórica con SOAP/SAML, ASP.NET Core renombra `sub` a `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier`. Desactivarlo mantiene los nombres estándar de JWT (`sub`, `name`, `role`).
- **Alternativas consideradas**: Dejar el mapeo por defecto y leer `ClaimTypes.NameIdentifier`, lo cual acopla el código a URIs obsoletas de Microsoft y confunde los contratos con el frontend.

### 2. Extracción de Token en SignalR mediante `OnMessageReceived`
- **Decisión**: En `JwtBearerEvents.OnMessageReceived`, evaluar si `context.Request.Path.StartsWithSegments("/hubs")` y asignar `context.Token = context.Request.Query["access_token"]`.
- **Razón**: El protocolo WebSocket de los navegadores no admite cabeceras HTTP personalizadas como `Authorization: Bearer <token>` durante el handshake inicial.
- **Alternativas consideradas**: Permitir `access_token` en cualquier ruta REST (descartado por vulnerabilidad de seguridad en logs HTTP y cabeceras Referer).

### 3. Servicio `ICurrentUser` con Soporte Resiliente de Claims
- **Decisión**: `ICurrentUser` expone `UserId` (obtenido de `sub`) y `Name` (obtenido de `name`, con fallback a `username`).
- **Razón**: Dado que el `auth-service` inspeccionado emite actualmente el claim como `username`, el fallback garantiza interoperabilidad inmediata mientras se soporta el estándar `name`.
- **Alternativas consideradas**: Exigir que los endpoints reciban el `userId` en el JSON del request (descartado: genera vulnerabilidad IDOR donde un usuario suplanta al creador).

### 4. Autorización Global vía FallbackPolicy
- **Decisión**: Configurar `options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build()`.
- **Razón**: Principio de seguridad por defecto: si un desarrollador crea un nuevo controlador y olvida colocar `[Authorize]`, el endpoint sigue estando protegido.
- **Excepciones**: Uso explícito de `[AllowAnonymous]` en el controlador de salud (`/health`) y en los endpoints o middleware de entrega de imágenes.

### 5. Configuración Flexible (Simétrica / OIDC)
- **Decisión**: Leer configuración desde `Auth:Authority`, `Auth:MetadataAddress`, `Auth:Issuer`, `Auth:Audience` y `Auth:SecretKey`. Si se define `Authority`, se delega el descubrimiento OIDC. Si se define `SecretKey`, se valida con `SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey))`.
- **Razón**: Permite trabajar en desarrollo con el microservicio NestJS actual (HS256) y migrar a un IdP estándar (Keycloak, Auth0, etc.) sin cambiar código.

## Risks / Trade-offs

- **[Riesgo] Ausencia de emisor/audiencia en tokens emitidos localmente por auth-service**
  - *Mitigación*: Documentar la configuración en `appsettings.json` y `.env.example`, y habilitar validación de emisor y audiencia configurables.
- **[Riesgo] Exposición de token en URLs de SignalR en logs de proxy**
  - *Mitigación*: Limitar el query parameter estrictamente al prefijo `/hubs` y asegurar que la negociación se realice bajo TLS/HTTPS.
- **[Riesgo] Formato de UserId no compatible (UUID vs int)**
  - *Mitigación*: Exponer `UserId` en `ICurrentUser` como `string` o `Guid` parseado de forma segura desde `sub`.
