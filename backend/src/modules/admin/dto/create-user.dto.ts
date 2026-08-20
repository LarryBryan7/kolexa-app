import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsIn,
  MaxLength,
} from 'class-validator';
import { NormalizeEmail } from '../../../common/decorators/normalize-email.decorator';

export class CreateUserDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dni?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  // Rol del usuario dentro del colegio: 'teacher' (docente) o 'parent' (padre).
  // El rol 'school_admin' no se asigna desde aquí.
  @IsIn(['teacher', 'parent'], { message: 'Rol inválido. Debe ser teacher o parent' })
  role: 'teacher' | 'parent';
}
