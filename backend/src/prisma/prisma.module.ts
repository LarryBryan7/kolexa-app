// prisma.module.ts — Módulo que expone PrismaService

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() hace que este módulo sea accesible en toda la app
// sin necesidad de importarlo en cada módulo que lo necesite
@Global()
@Module({
  providers: [PrismaService], // PrismaService vive aquí
  exports: [PrismaService],   // y puede ser usado por otros módulos
})
export class PrismaModule {}
