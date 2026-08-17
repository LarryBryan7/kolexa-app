import { IsString, IsNotEmpty } from 'class-validator';

export class ImportStudentsDto {
  @IsString()
  @IsNotEmpty({ message: 'El contenido CSV es requerido' })
  csv: string;
}
