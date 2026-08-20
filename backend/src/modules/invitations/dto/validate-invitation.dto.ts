import { IsString, IsNotEmpty } from 'class-validator';

export class ValidateInvitationDto {
  @IsString()
  @IsNotEmpty({ message: 'El token es requerido' })
  token: string;
}
