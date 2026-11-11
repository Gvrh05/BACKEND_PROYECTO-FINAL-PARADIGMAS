# Imágenes del quiz demo

Opcionalmente coloca aquí imágenes PNG válidas con estos nombres exactos:
`q1.png`, `q2.png`, ..., `q10.png`. Las preguntas sin archivo se crean sin imagen;
no es necesario descargar ni generar imágenes para iniciar los servicios.

Al iniciar el servicio `quiz-seed`, se validan y copian a
`uploads/questions/`. Ese directorio está en el volumen persistente `uploads_data`
y se sirve públicamente desde `/uploads/questions/`.

Un archivo presente pero inválido hace fallar el seed. El seed no sobrescribe un
cuestionario existente: agregar archivos posteriormente no modifica sus preguntas.
