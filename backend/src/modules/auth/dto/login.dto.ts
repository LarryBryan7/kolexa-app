// login.dto.ts — Data Transfer Object para el login

import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { NormalizeEmail } from '../../../common/decorators/normalize-email.decorator';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  email: string;

  // @MinLength(6) requiere mínimo 6 caracteres
  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @IsOptional()
  @IsString()
  firebaseToken?: string;
}
