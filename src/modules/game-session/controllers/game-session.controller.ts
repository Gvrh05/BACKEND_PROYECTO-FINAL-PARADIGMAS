import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../shared/auth/game-session-auth.guard';
import { GameSessionService } from '../services/game-session.service';
import { CreateGameSessionDto } from '../dto/create-game-session.dto';
import { JoinSessionDto } from '../dto/join-session.dto';
import { RoomCodeDto } from '../dto/room-code.dto';
import { ParticipantDto } from '../dto/participant.dto';
import {
  AvailableQuizDto,
  JoinSessionResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  StartedSessionDto,
} from '../dto/session-response.dto';

@Controller('game-sessions')
// Local validation preserves the existing contracts of quizzes and results.
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class GameSessionController {
  constructor(private readonly sessions: GameSessionService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateGameSessionDto,
  ): Promise<SessionResponseDto> {
    return this.sessions.createSession(request.user.sub, body.quizId);
  }

  // Static route MUST precede :roomCode; do not use the mock GET /quizzes.
  @Get('available-quizzes')
  availableQuizzes(
    @Req() request: AuthenticatedRequest,
  ): Promise<AvailableQuizDto[]> {
    return this.sessions.listAvailableQuizzes(request.user.sub);
  }

  @Get(':roomCode')
  get(
    @Param() { roomCode }: RoomCodeDto,
    @Req() request: AuthenticatedRequest,
  ): SessionSnapshotDto {
    this.sessions.assertHost(roomCode, request.user.sub);
    return this.sessions.getSessionByCode(roomCode, request.user.sub);
  }

  @Get(':roomCode/participants')
  participants(
    @Param() { roomCode }: RoomCodeDto,
    @Req() request: AuthenticatedRequest,
  ): ParticipantDto[] {
    this.sessions.assertHost(roomCode, request.user.sub);
    return this.sessions.listParticipants(roomCode);
  }

  @Post(':roomCode/join')
  join(
    @Req() request: AuthenticatedRequest,
    @Param() { roomCode }: RoomCodeDto,
    @Body() body: JoinSessionDto,
  ): JoinSessionResponseDto {
    return this.sessions.joinSession({
      roomCode,
      userId: request.user.sub,
      name: body.name ?? request.user.name,
    });
  }

  @Post(':roomCode/start')
  @HttpCode(200)
  start(
    @Req() request: AuthenticatedRequest,
    @Param() { roomCode }: RoomCodeDto,
  ): Promise<StartedSessionDto> {
    return this.sessions.startSession(roomCode, request.user.sub);
  }
}
