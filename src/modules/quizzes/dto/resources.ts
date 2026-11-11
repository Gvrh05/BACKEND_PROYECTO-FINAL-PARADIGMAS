import type { Quiz } from '../entities/quiz.entity';
import { QuestionKind, type Question } from '../entities/question.entity';

export function serializeQuiz(quiz: Quiz) {
  return {
    id: quiz.id,
    authorId: quiz.authorId,
    isDemo: quiz.isDemo,
    title: quiz.title,
    description: quiz.description ?? null,
    coverImageUrl: quiz.coverImageUrl ?? null,
    createdAt: quiz.createdAt.toISOString(),
    updatedAt: quiz.updatedAt.toISOString(),
  };
}

export function serializeQuestion(question: Question) {
  return {
    id: question.id,
    quizId: question.quizId,
    ...(question.kind === QuestionKind.TRUE_FALSE && { kind: question.kind }),
    questionText: question.questionText,
    timeLimitSeconds: question.timeLimitSeconds,
    points: question.points,
    options: [...question.options]
      .sort((a, b) => a.position - b.position)
      .map((option) => ({
        id: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    imageUrl:
      question.imageUrl ??
      (question.imageStorageKey
        ? `/uploads/questions/${question.imageStorageKey}`
        : null),
  };
}

export function serializeQuizDetail(quiz: Quiz, questions: Question[]) {
  return {
    ...serializeQuiz(quiz),
    questions: questions.map(serializeQuestion),
  };
}

export type QuizSummary = ReturnType<typeof serializeQuiz>;
export type QuestionResource = ReturnType<typeof serializeQuestion>;
export type QuizDetail = ReturnType<typeof serializeQuizDetail>;
