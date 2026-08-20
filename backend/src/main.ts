// main.ts — Punto de entrada del servidor NestJS

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  // Crea la aplicación NestJS usando el módulo raíz (AppModule)
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // TODOS los usuarios juntos (comparten la IP aparente del proxy) en vez
  app.set('trust proxy', 1);

  // Sirve archivos subidos desde la carpeta uploads/ en la ruta /uploads/
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // ── Prefijo global ──────────────────────────────────────
  // Todas las rutas tendrán el prefijo /api/v1/
  // Ejemplo: /api/v1/auth/login, /api/v1/attendance
  app.setGlobalPrefix('api/v1');

  // ── Validación global ───────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist: true → elimina campos que no están en el DTO
      // Evita que lleguen campos maliciosos al backend
      whitelist: true,

      // forbidNonWhitelisted: true → lanza error si llegan
      // campos que no están en el DTO (más estricto que whitelist)
      forbidNonWhitelisted: true,

      transform: true,
    }),
  );

  // ── Filtro global de excepciones ────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── CORS ────────────────────────────────────────────────
  const corsOrigin = process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGINS ?? 'https://kolexa.pe').split(',').map(s => s.trim())
    : '*';

  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Lee el puerto del archivo .env, o usa 3000 por defecto
  const port = process.env.PORT ?? 3000;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Kolexa Backend corriendo en: http://0.0.0.0:${port}/api/v1`);
}

// Ejecuta la función bootstrap para arrancar el servidor
bootstrap();
