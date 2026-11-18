import type { LiveGame } from '../engine/live-game';
import type { GoalKickGame } from '../engine/goal-kick-game';
import { SessionStatus } from '../entities/game-session.entity';
import { ParticipantDto } from './participant.dto';

export class SessionResponseDto {
  invitationId: string;
  sessionId: string;
  roomCode: string;
  status: SessionStatus;
  hostId: string;
  quizId: string | null;
  activity?: 'GOAL_KICK';
  roomDetails?: { name: string; description: string; coverImageUrl?: string };
}

export class SessionSnapshotDto extends SessionResponseDto {
  participants: ParticipantDto[];
  startedAt?: string;
  game?: ReturnType<LiveGame['snapshot']>;
  goalKick?: ReturnType<GoalKickGame['snapshot']>;
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
