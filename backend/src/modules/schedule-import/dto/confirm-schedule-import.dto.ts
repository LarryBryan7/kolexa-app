// confirm-schedule-import.dto.ts

import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmScheduleBlockDto {
  @IsInt()
  @Min(1)
  @Max(5)
  dayOfWeek!: number;

  @IsString()
  @IsNotEmpty()
  startTime!: string;

  @IsString()
  @IsNotEmpty()
  endTime!: string;

  @IsIn(['class', 'recess', 'break', 'lunch', 'activity'])
  type!: 'class' | 'recess' | 'break' | 'lunch' | 'activity';

  // Se reciben como string: los ids son BigInt en BD y JSON no los soporta.
  @IsOptional()
  @IsString()
  courseId?: string | null;

  @IsOptional()
  @IsString()
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  label?: string | null;
}

export class ConfirmScheduleImportDto {
  @IsString()
  @IsNotEmpty()
  classroomId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmScheduleBlockDto)
  blocks!: ConfirmScheduleBlockDto[];
}
