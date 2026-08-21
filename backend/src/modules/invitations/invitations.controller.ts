import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { ValidateInvitationDto } from './dto/validate-invitation.dto';
import { CurrentUser, UserPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

  @Post()
  @Roles('school_admin')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: UserPayload, @Body() dto: CreateInvitationDto) {
    return this.service.create(
      {
        schoolId: user.schoolId!,
        email: dto.email,
        role: dto.role, // opcional cuando dto.parentId está presente
        parentId: dto.parentId ? BigInt(dto.parentId) : undefined,
      },
      user.sub,
    );
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validate(@Body() dto: ValidateInvitationDto) {
    return this.service.validate(dto.token);
  }

  @Get('parent/:parentId')
  @Roles('school_admin')
  findActiveForParent(
    @CurrentUser() user: UserPayload,
    @Param('parentId', ParseBigIntPipe) parentId: bigint,
  ) {
    return this.service.findActiveForParent(user.schoolId!, parentId);
  }

  // Equivalente al de arriba, para invitaciones GENÉRICAS (docente/director).
  @Get('user/:userId')
  @Roles('school_admin')
  findActiveForUser(
    @CurrentUser() user: UserPayload,
    @Param('userId', ParseBigIntPipe) userId: bigint,
  ) {
    return this.service.findActiveForUser(user.schoolId!, userId);
  }
}
