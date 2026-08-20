// google-login.dto.ts — DTO para el login con Google

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class GoogleLoginDto {
  // ID Token de Google (JWT firmado por Google).
  // El backend lo valida con google-auth-library.
  @IsString()
  @IsNotEmpty({ message: 'El ID Token de Google es requerido' })
  idToken: string;

  // Código de invitación entregado por el colegio. Obligatorio para el
  // flujo de padre (se valida en AuthService.loginWithGoogle, no aquí).
  @IsOptional()
  @IsString()
  invitationToken?: string;

  // Token de Firebase para push notifications (opcional, igual que login).
  @IsOptional()
  @IsString()
  firebaseToken?: string;
}
