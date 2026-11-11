import type { Question } from '../modules/quizzes/entities/question.entity';

/** Internal seed only: never replace any existing image association or question content. */
export function missingDemoImagePatch(
  question: Pick<
    Question,
    'imageUrl' | 'imageStorageKey' | 'imageMimeType' | 'imageSize'
  >,
  index: number,
  size: number | null,
) {
  if (
    !size ||
    question.imageUrl ||
    question.imageStorageKey ||
    question.imageMimeType ||
    question.imageSize !== null
  )
    return null;
  return {
    imageStorageKey: `q${index + 1}.png`,
    imageUrl: `/uploads/questions/q${index + 1}.png`,
    imageMimeType: 'image/png',
    imageSize: size,
  };
}
