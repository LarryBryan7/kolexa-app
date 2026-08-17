import { IsString, IsNotEmpty } from 'class-validator';

export class ImportClassroomsDto {
  @IsString()
  @IsNotEmpty({ message: 'El contenido CSV es requerido' })
  csv: string;
}
