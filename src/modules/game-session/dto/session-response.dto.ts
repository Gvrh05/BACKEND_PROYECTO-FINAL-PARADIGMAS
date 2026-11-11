import type { LiveGame } from '../engine/live-game';
import { SessionStatus } from '../entities/game-session.entity';
import { ParticipantDto } from './participant.dto';

export class SessionResponseDto {
  sessionId: string;
  roomCode: string;
  status: SessionStatus;
  hostId: string;
  quizId: string;
}

export class SessionSnapshotDto extends SessionResponseDto {
  participants: ParticipantDto[];
  startedAt?: string;
  game?: ReturnType<LiveGame['snapshot']>;
}

export class StartedSessionDto extends SessionResponseDto {
  startedAt: string;
}

export class JoinSessionResponseDto {
  added: boolean;
  player: ParticipantDto;
}

export class AvailableQuizDto {
  id: string;
  title: string;
}
