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

  @IsIn(['teacher', 'parent', 'school_admin'], {
    message: 'Rol inválido. Debe ser teacher, parent o school_admin',
  })
  role: 'teacher' | 'parent' | 'school_admin';
}
