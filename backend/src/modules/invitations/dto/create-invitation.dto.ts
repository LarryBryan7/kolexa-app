import { IsEmail, IsIn, IsString, IsOptional } from 'class-validator';
import { IsBigIntString } from '../../../common/validators/is-bigint-string.validator';
import { NormalizeEmail } from '../../../common/decorators/normalize-email.decorator';

export class CreateInvitationDto {
  @IsOptional()
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email inválido' })
  email?: string;

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsIn(['teacher', 'school_admin'], { message: 'role debe ser teacher o school_admin' })
  role?: 'teacher' | 'school_admin';

  @IsOptional()
  @IsBigIntString()
  parentId?: string;
}
