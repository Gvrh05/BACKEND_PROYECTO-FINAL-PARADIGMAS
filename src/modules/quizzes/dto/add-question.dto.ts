export class AddQuestionDto {
  questionText: string;
  timeLimitSeconds: number;
  points: number;
  options: {
    text: string;
    isCorrect: boolean;
  }[];
  imageUrl?: string;
}
