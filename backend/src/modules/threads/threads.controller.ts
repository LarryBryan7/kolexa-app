// threads.controller.ts — Mensajería 1:1

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ThreadsService } from './threads.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { SendThreadMessageDto } from './dto/send-thread-message.dto';
import { CurrentUser, UserPayload } from '../../common/decorators/current-user.decorator';

@Controller()
export class ThreadsController {
  constructor(private readonly service: ThreadsService) {}

  @Get('inbox')
  getInbox(@CurrentUser() user: UserPayload) {
    return this.service.getInbox(user.sub, user.schoolId!);
  }

  @Get('inbox/unread-count')
  getUnreadCount(@CurrentUser() user: UserPayload) {
    return this.service.getUnreadCount(user.sub, user.schoolId!);
  }

  @Get('threads/contacts')
  getContacts(@CurrentUser() user: UserPayload) {
    return this.service.getContacts(user.schoolId!, { id: user.sub, roles: user.roles });
  }

  // Límite propio: es la puerta de entrada para abrir conversaciones nuevas,
  // el punto donde tendría más impacto un intento de spam.
  @Post('threads')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  openThread(@Body() dto: CreateThreadDto, @CurrentUser() user: UserPayload) {
    return this.service.openThread(user.schoolId!, { id: user.sub, roles: user.roles }, {
      recipientId: BigInt(dto.recipientId),
      studentId: dto.studentId !== undefined ? BigInt(dto.studentId) : undefined,
      subject: dto.subject,
      firstMessageBody: dto.firstMessageBody,
    });
  }

  @Get('threads/:id/mentions')
  searchMentions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserPayload,
    @Query('q') q?: string,
  ) {
    return this.service.searchMentions(BigInt(id), user.sub, q ?? '');
  }

  @Get('threads/:id/mentions/gc-coursework/:refId')
  getClassroomTaskLink(
    @Param('id', ParseIntPipe) id: number,
    @Param('refId', ParseIntPipe) refId: number,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.getClassroomTaskLink(BigInt(id), user.sub, BigInt(refId));
  }

  @Get('threads/:id/messages')
  getMessages(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserPayload,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getMessages(
      BigInt(id),
      user.sub,
      before ? BigInt(before) : undefined,
      limit ? Math.min(parseInt(limit, 10), 100) : undefined,
    );
  }

  @Post('threads/:id/messages')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  sendMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendThreadMessageDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.sendMessage(BigInt(id), user.sub, dto.body);
  }

  @Patch('threads/:id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) {
    return this.service.markRead(BigInt(id), user.sub);
  }

  @Patch('threads/:id/mute')
  setMuted(
    @Param('id', ParseIntPipe) id: number,
    @Body('muted') muted: boolean,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.setMuted(BigInt(id), user.sub, !!muted);
  }
}
