// login.dto.ts — Data Transfer Object para el login

import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  // @IsEmail() verifica que sea un email válido con formato correcto
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
