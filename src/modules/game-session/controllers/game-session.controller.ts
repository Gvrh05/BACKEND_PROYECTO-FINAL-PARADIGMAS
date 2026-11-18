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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateGoalKickRoomDto } from '../dto/create-goal-kick-room.dto';
import { GoalKickRoomImages } from '../services/goal-kick-room-images.service';
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
  constructor(
    private readonly sessions: GameSessionService,
    private readonly roomImages: GoalKickRoomImages,
  ) {}

  @Post('goal-kick')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 2,
        fieldSize: 8192,
        parts: 4,
      },
    }),
  )
  async createGoalKick(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateGoalKickRoomDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<SessionResponseDto> {
    const cover = await this.roomImages.prepare(file);
    return this.sessions.createGoalKickRoom(
      request.user.sub,
      body.name,
      body.description,
      cover,
    );
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateGameSessionDto,
  ): Promise<SessionResponseDto> {
    return this.sessions.createSession(
      request.user.sub,
      body.quizId,
      body.scoringMode,
    );
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
      avatarId: request.user.avatarId,
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
