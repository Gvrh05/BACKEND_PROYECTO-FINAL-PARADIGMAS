export function questionBody(questionText = '¿Cuál es la correcta?') {
  return {
    questionText,
    options: Array.from({ length: 4 }, (_, index) => ({
      text: `Opción ${index + 1}`,
      isCorrect: index === 0,
    })),
  };
}
