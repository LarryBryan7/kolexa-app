// parse-bigint.pipe.ts — ParseBigIntPipe

import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';

const POSTGRES_BIGINT_MAX = 9223372036854775807n;

@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string, metadata: ArgumentMetadata): bigint {
    const field = metadata.data ?? 'El identificador';
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      throw new BadRequestException(`${field} debe ser un identificador numérico válido`);
    }
    const parsed = BigInt(value);
    if (parsed > POSTGRES_BIGINT_MAX) {
      throw new BadRequestException(`${field} excede el rango permitido`);
    }
    return parsed;
  }
}
