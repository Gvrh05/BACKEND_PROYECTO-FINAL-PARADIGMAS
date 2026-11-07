export class Question {
  id: string;
  quizId: string;
  questionText: string;
  timeLimitSeconds: number;
  points: number;
  options: {
    id: string;
    text: string;
    isCorrect: boolean;
  }[];
  imageUrl?: string;
}
