import { IsEmail, IsInt, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
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
  @IsInt()
  @Type(() => Number)
  roleId?: number;

  @IsOptional()
  @IsBigIntString()
  parentId?: string;
}
