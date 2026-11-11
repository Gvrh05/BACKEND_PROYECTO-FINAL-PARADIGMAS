export function trueFalseQuestionBody() {
  return {
    kind: 'TRUE_FALSE',
    questionText: 'Una sala tiene un PIN.',
    options: [
      { text: 'Verdadero', isCorrect: true },
      { text: 'Falso', isCorrect: false },
    ],
  };
}

export function questionBody(questionText = '¿Cuál es la correcta?') {
  return {
    questionText,
    options: Array.from({ length: 4 }, (_, index) => ({
      text: `Opción ${index + 1}`,
      isCorrect: index === 0,
    })),
  };
}
