# Preguntas Verdadero y Falso

## Purpose

Permitir la autoría y selección de preguntas binarias para partidas en vivo y conservar el uso de los cuestionarios de cuatro opciones ya existentes.

## ADDED Requirements

### Requirement: Autoría binaria explícita
La autoría SHALL admitir un tipo Verdadero/Falso con exactamente dos valores booleanos distintos y una única respuesta correcta. El formato de cuatro opciones SHALL seguir disponible y los datos previos SHALL conservar su significado.

#### Scenario: Creación y edición de una pregunta binaria
- **WHEN** el autor selecciona el tipo Verdadero/Falso y marca Falso como correcto
- **THEN** el editor guarda y recupera la pregunta con sus dos opciones, Falso como única correcta e imagen opcional

#### Scenario: Datos binarios inválidos
- **WHEN** se envían valores duplicados, opciones adicionales o más de una correcta
- **THEN** la API rechaza el cambio y la pregunta persistida conserva su estado anterior

#### Scenario: Quiz previo de cuatro opciones
- **WHEN** un propietario abre y guarda un quiz anterior con preguntas de cuatro opciones
- **THEN** sigue pudiendo consultar y editar sus opciones y la única correcta con el contrato previo

### Requirement: Selección de cuestionarios aptos para partida
La partida Verdadero/Falso SHALL admitir cuestionarios con al menos una pregunta y con todas sus preguntas en formato binario. El sistema SHALL explicar al anfitrión por qué un quiz es incompatible y comprobar su elegibilidad al iniciar.

#### Scenario: Cambio después de crear la sala
- **WHEN** un quiz inicialmente elegible queda vacío o adquiere una pregunta de cuatro opciones antes de iniciar
- **THEN** el inicio es rechazado con un mensaje claro y la sala permanece en LOBBY

#### Scenario: Cuestionario de demostración
- **WHEN** se prepara el entorno de demo
- **THEN** el anfitrión de prueba dispone de un quiz binario con al menos dos preguntas y una imagen visible desde otro dispositivo
