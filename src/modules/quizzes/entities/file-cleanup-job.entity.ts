import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('file_cleanup_jobs')
@Index(['nextAttemptAt'])
export class FileCleanupJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'storage_key', type: 'text', unique: true })
  storageKey: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({
    name: 'next_attempt_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  nextAttemptAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
