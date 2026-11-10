import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../../shared/guards/jwt-auth.guard';
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
@UseGuards(JwtAuthGuard)
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
  get(@Param() { roomCode }: RoomCodeDto): SessionSnapshotDto {
    return this.sessions.getSessionByCode(roomCode);
  }

  @Get(':roomCode/participants')
  participants(@Param() { roomCode }: RoomCodeDto): ParticipantDto[] {
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
      name: body.name,
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
