# Partida en vivo

## Purpose

Permitir que un anfitrión dirija una partida Verdadero/Falso sincronizada y que cada participante responda dentro del plazo de la ronda.

## ADDED Requirements

### Requirement: Pregunta activa por sala
El sistema SHALL mostrar una sola pregunta a la vez por sala, en el orden fijado al iniciar. El contenido público SHALL incluir identificador, enunciado, imagen opcional y hora de cierre. La opción correcta SHALL permanecer privada hasta el cierre.

#### Scenario: Apertura de la ronda
- **WHEN** inicia una ronda con imagen y hay clientes en dos salas
- **THEN** solo los clientes de la sala correspondiente reciben el mismo enunciado, imagen y plazo, sin la clave de respuesta

#### Scenario: Cambios de autoría durante el juego
- **WHEN** el propietario edita el texto, sustituye la imagen o elimina una pregunta del cuestionario después de iniciar
- **THEN** la partida sigue usando el contenido y la imagen fijados al inicio

### Requirement: Respuesta válida y única
El sistema SHALL aceptar una respuesta booleana por participante registrado y pregunta activa. SHALL identificar al usuario mediante su autenticación y decidir el plazo con el reloj del servidor. Cada envío SHALL tener una confirmación o un rechazo dirigido a su emisor.

#### Scenario: Envío y reenvío
- **WHEN** un participante envía Falso a tiempo y luego reenvía Verdadero para la misma pregunta
- **THEN** se confirma Falso como primera respuesta y el segundo envío no la cambia ni genera otro punto

#### Scenario: Respuesta fuera de plazo
- **WHEN** llega una respuesta a partir de la hora de cierre, incluso si el evento de cierre aún no salió
- **THEN** el sistema la rechaza por tardía

#### Scenario: Sala, pregunta o identidad incorrecta
- **WHEN** se intenta responder desde otra sala, con una pregunta obsoleta, como anfitrión o con un valor que no es booleano
- **THEN** se rechaza el envío sin cambiar el estado de respuestas

### Requirement: Cierre y revelación de la ronda
El sistema SHALL cerrar una sola vez al vencimiento. Tras el cierre SHALL revelar la respuesta correcta y mostrar el resultado propio a cada participante. La contribución al puntaje SHALL ser 1 por acierto y 0 por error o ausencia.

#### Scenario: Acierto, error y ausencia
- **WHEN** cierra una pregunta con un acierto, un error y un participante sin respuesta
- **THEN** se revela la correcta y los resultados son 1, 0 y 0 respectivamente, sin exponer las respuestas individuales de otros jugadores

### Requirement: Avance controlado por el anfitrión
El sistema SHALL permitir avanzar únicamente al anfitrión, desde una ronda cerrada y con su identificador vigente. Al avanzar desde la última pregunta SHALL emitir un cierre final único y entregar el resumen al módulo de resultados.

#### Scenario: Comando repetido o fuera de fase
- **WHEN** un jugador intenta avanzar, el host intenta avanzar durante la cuenta regresiva o se reenvía un comando para una ronda anterior
- **THEN** el sistema rechaza el comando sin saltar ni abrir una pregunta adicional

#### Scenario: Última pregunta
- **WHEN** el anfitrión avanza tras cerrar la última pregunta
- **THEN** la partida alcanza su estado final y resultados recibe el mismo identificador de sesión y las contribuciones de cada ronda para procesarlas una sola vez

### Requirement: Vistas de juego
La interfaz SHALL mostrar el enunciado, imagen si existe y tiempo restante en computadora y celular. El participante SHALL tener dos botones grandes, Verdadero y Falso. La vista SHALL indicar desconexión, envío pendiente, respuesta confirmada y cierre. El anfitrión SHALL disponer del control Siguiente o Finalizar después del cierre.

#### Scenario: Confirmación desde un celular
- **WHEN** el jugador pulsa Verdadero y el servidor acepta
- **THEN** la vista confirma el envío y deja ambos botones deshabilitados durante esa ronda
