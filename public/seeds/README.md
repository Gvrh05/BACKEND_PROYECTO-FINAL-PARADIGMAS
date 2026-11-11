# Imágenes del quiz demo

Se incluyen diez ilustraciones PNG originales, generadas localmente para las
preguntas de cultura general: `q1.png` … `q10.png`. No dependen de servicios
externos ni fotografías de terceros. El generador reproducible es
`node scripts/generate-demo-images.cjs` (regenera los archivos fuente incluidos).

Al iniciar el servicio `quiz-seed`, se validan y copian a
`uploads/questions/`. Ese directorio está en el volumen persistente `uploads_data`
y se sirve públicamente desde `/uploads/questions/`.

Un archivo presente pero inválido hace fallar el seed. Para un demo ya existente,
volver a ejecutar `quiz-seed` añade únicamente las imágenes que faltan, emparejando
por el enunciado exacto. No cambia preguntas, opciones, IDs ni imágenes existentes.
Tampoco sobrescribe archivos ya presentes en uploads. El quiz sigue siendo de
solo lectura para MASTER y PROFESOR mediante HTTP/UI.
