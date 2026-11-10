import { Transform } from 'class-transformer';
import { ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';

export const TrimText = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

@ValidatorConstraint({ name: 'exactlyOneCorrect', async: false })
export class ExactlyOneCorrect implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.filter(
        (option: unknown) =>
          typeof option === 'object' &&
          option !== null &&
          'isCorrect' in option &&
          option.isCorrect === true,
      ).length === 1
    );
  }

  defaultMessage(): string {
    return 'options debe contener exactamente una respuesta correcta';
  }
}
