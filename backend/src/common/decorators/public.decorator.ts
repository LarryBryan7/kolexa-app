// public.decorator.ts — Decorador @Public()

import { SetMetadata } from '@nestjs/common';

// Clave usada por JwtAuthGuard para leer este metadato
export const IS_PUBLIC_KEY = 'isPublic';

// @Public() es un alias de @SetMetadata('isPublic', true)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
