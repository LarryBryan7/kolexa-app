import { IsString, IsNotEmpty } from 'class-validator';

export class ImportTeachersDto {
  @IsString()
  @IsNotEmpty({ message: 'El contenido CSV es requerido' })
  csv: string;
}
