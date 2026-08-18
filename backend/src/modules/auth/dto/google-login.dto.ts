// google-login.dto.ts — DTO para el login con Google

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class GoogleLoginDto {
  // ID Token de Google (JWT firmado por Google).
  // El backend lo valida con google-auth-library.
  @IsString()
  @IsNotEmpty({ message: 'El ID Token de Google es requerido' })
  idToken: string;

  // Token de Firebase para push notifications (opcional, igual que login).
  @IsOptional()
  @IsString()
  firebaseToken?: string;
}
