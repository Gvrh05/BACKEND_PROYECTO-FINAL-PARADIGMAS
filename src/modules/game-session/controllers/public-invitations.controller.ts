import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../shared/decorators/public.decorator';
import { GameSessionService } from '../services/game-session.service';

@Public()
@Controller('public/invitations')
export class PublicInvitationsController {
  constructor(private readonly sessions: GameSessionService) {}
  @Get(':invitationId')
  get(@Param('invitationId') id: string, @Req() request: Request) {
    return this.sessions.publicInvitation(id, request.ip ?? 'unknown');
  }
  @Post(':invitationId/participants')
  create(
    @Param('invitationId') id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !('username' in body)
    )
      throw new BadRequestException('Envía únicamente username');
    return this.sessions.createGuest(
      id,
      body.username,
      request.ip ?? 'unknown',
    );
  }
}
