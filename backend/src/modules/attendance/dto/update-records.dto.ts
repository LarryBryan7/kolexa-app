// update-records.dto.ts — DTO para actualizar registros de asistencia

import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { UpdateAttendanceRecordDto } from './create-attendance.dto';

export class UpdateAttendanceRecordsDto {
  @IsArray({ message: 'records debe ser un array' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un registro' })
  @ValidateNested({ each: true })
  @Type(() => UpdateAttendanceRecordDto)
  records: UpdateAttendanceRecordDto[];
}
