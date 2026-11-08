# Tasks

## 1. Configuración y Dependencias

- [ ] 1.1 Instalar el paquete NuGet `Microsoft.AspNetCore.Authentication.JwtBearer` y verificar que el proyecto compile sin errores
- [ ] 1.2 Definir la sección de configuración `Auth` en `appsettings.json`, `appsettings.Development.json` y `.env.example` con valores de ejemplo para `Authority`, `MetadataAddress`, `Issuer`, `Audience` y `SecretKey`
- [ ] 1.3 Crear una clase de opciones `AuthSettings` vinculada a la sección `Auth` para validación tipada durante el arranque

## 2. Configuración del Middleware JWT y SignalR

- [ ] 2.1 Desactivar el mapeo global de claims (`JsonWebTokenHandler.DefaultInboundClaimTypeMap.Clear()`) y configurar `MapInboundClaims = false` en `JwtBearerOptions` para preservar `sub` y `name`
- [ ] 2.2 Registrar `AddAuthentication` y `AddJwtBearer` configurando `TokenValidationParameters` para validar firma, emisor, audiencia y expiración, leyendo los parámetros desde la configuración sin valores en duro
- [ ] 2.3 Implementar el hook de evento `OnMessageReceived` en `JwtBearerEvents` para extraer el token desde `context.Request.Query["access_token"]` únicamente cuando la ruta comience con `/hubs`
- [ ] 2.4 Configurar la política de autorización por defecto (`FallbackPolicy`) para exigir autenticación en toda la API, agregando `[AllowAnonymous]` en el endpoint de `/health` y en la lectura pública de imágenes

## 3. Servicio de Identidad de Usuario (ICurrentUser)

- [ ] 3.1 Registrar `IHttpContextAccessor` y crear la interfaz `ICurrentUser` con propiedades `UserId` (Guid/string) y `Name` (string)
- [ ] 3.2 Implementar `CurrentUser` extrayendo el `UserId` del claim `sub` y el nombre desde el claim `name` (con fallback al claim `username` emitido por el auth-service)
- [ ] 3.3 Registrar `ICurrentUser` como servicio Scoped en el contenedor de inyección de dependencias
- [ ] 3.4 Actualizar los controladores y servicios de cuestionarios y salas para asignar la propiedad del recurso mediante `ICurrentUser.UserId` (ignorando IDs de dueño en el cuerpo) y retornar `403 Forbidden` si un usuario no propietario intenta modificar el recurso

## 4. Pruebas Automatizadas de Autenticación y Autorización

- [ ] 4.1 Configurar proyecto de pruebas de integración con `WebApplicationFactory` y generador de tokens de prueba
- [ ] 4.2 Crear prueba que valide que peticiones a endpoints protegidos sin cabecera `Authorization` retornen `401 Unauthorized`
- [ ] 4.3 Crear prueba que valide que peticiones con token emitido para una audiencia diferente retornen `401 Unauthorized`
- [ ] 4.4 Crear prueba que valide que peticiones con token expirado retornen `401 Unauthorized`
- [ ] 4.5 Crear prueba que valide que peticiones con token válido y vigente retornen `200 OK`
- [ ] 4.6 Crear prueba que valide que un cliente conectándose al Hub de SignalR con `?access_token=<valido>` complete la conexión exitosamente y con token inválido retorne `401`
