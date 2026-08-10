// auth.controller.ts — Controlador de autenticación

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterWithTokenDto } from './dto/register.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, UserPayload } from '../../common/decorators/current-user.decorator';

// @Controller('auth') → todas las rutas tienen el prefijo /auth
// Combinado con el prefijo global /api/v1 → /api/v1/auth/...
@Controller('auth')
export class AuthController {
  // NestJS inyecta AuthService automáticamente (Dependency Injection)
  constructor(private readonly authService: AuthService) {}

  // ── POST /api/v1/auth/login ────────────────────────────
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    // @Body() extrae el body del request y lo valida con LoginDto
    // Si la validación falla, ValidationPipe lanza 400 automáticamente
    return this.authService.login(dto);
  }

  // ── POST /api/v1/auth/refresh ──────────────────────────
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body('refreshToken') refreshToken: string) {
    if (!refreshToken) throw new BadRequestException('refreshToken requerido');
    return this.authService.refresh(refreshToken);
  }

  // ── POST /api/v1/auth/register ────────────────────────
  // Registro con token de invitación — no requiere JWT
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterWithTokenDto) {
    return this.authService.registerWithToken(dto);
  }

  // ── POST /api/v1/auth/logout ───────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @CurrentUser() user: UserPayload,
    @Body('firebaseToken') firebaseToken?: string,
  ) {
    return this.authService.logout(BigInt(user.sub), firebaseToken);
  }

  // ── POST /api/v1/auth/change-password ─────────────────
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: UserPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.sub, dto);
  }
}
