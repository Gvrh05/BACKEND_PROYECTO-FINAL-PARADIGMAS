export const PUNTO3_DEMO_AUTHOR_ID = '7ac9810a-b36c-4c85-8b58-b296434f0100';

/** Compatibility for the signed DEV-only Punto 3 identity, never in production. */
export function quizAuthorId(subject: string): string | null {
  if (process.env.NODE_ENV !== 'production' && subject === 'test-host-id') {
    return PUNTO3_DEMO_AUTHOR_ID;
  }
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
    subject,
  )
    ? subject
    : null;
}
