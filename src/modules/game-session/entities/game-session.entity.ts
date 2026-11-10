import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum SessionStatus {
  LOBBY = 'LOBBY',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
}

@Entity('game_sessions')
export class GameSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 6, unique: true })
  roomCode: string;

  // Logical FK: existence/ownership is checked through QuizzesService.
  @Column({ type: 'varchar' })
  quizId: string;

  @Column({ type: 'varchar' })
  hostId: string;

  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.LOBBY })
  status: SessionStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}
