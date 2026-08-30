import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateThreadDto {
  @IsInt()
  recipientId!: number;

  @IsOptional()
  @IsInt()
  studentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  firstMessageBody!: string;
}
