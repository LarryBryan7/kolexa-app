// prisma.service.ts — Servicio de conexión a la base de datos

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  // Logger de NestJS para mostrar mensajes en consola con contexto
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Pasamos configuración a PrismaClient
    super({
      log: [
        // En desarrollo mostramos todas las queries SQL para depurar
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    try {
      // $connect() establece la conexión con PostgreSQL
      await this.$connect();
      this.logger.log('✅ Conectado a PostgreSQL via Prisma');
    } catch (error) {
      this.logger.error('❌ Error al conectar a PostgreSQL', error);
      // Si no se puede conectar, el servidor no debería arrancar
      throw error;
    }
  }

  async beforeApplicationShutdown() {
    await this.$disconnect();
    this.logger.log('🔌 Desconectado de PostgreSQL');
  }
}
