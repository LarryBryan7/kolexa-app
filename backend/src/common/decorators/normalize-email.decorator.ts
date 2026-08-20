// normalize-email.decorator.ts — @NormalizeEmail()

import { Transform } from 'class-transformer';

export function NormalizeEmail() {
  return Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}
