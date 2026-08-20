// is-bigint-string.validator.ts — @IsBigIntString()

import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

const POSTGRES_BIGINT_MAX = 9223372036854775807n;

export function IsBigIntString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBigIntString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !/^\d+$/.test(value)) return false;
          try {
            return BigInt(value) <= POSTGRES_BIGINT_MAX;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe ser un identificador numérico BigInt válido`;
        },
      },
    });
  };
}
