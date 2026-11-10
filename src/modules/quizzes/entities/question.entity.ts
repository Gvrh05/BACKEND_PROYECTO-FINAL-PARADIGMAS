import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Quiz } from './quiz.entity';
import { QuestionOption } from './question-option.entity';

export enum QuestionKind {
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  TRUE_FALSE = 'TRUE_FALSE',
}

@Entity('questions')
@Index(['quizId', 'createdAt', 'id'])
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'quiz_id', type: 'uuid' })
  quizId: string;

  @ManyToOne(() => Quiz, (quiz) => quiz.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quiz_id' })
  quiz: Relation<Quiz>;

  @Column({ type: 'text', default: QuestionKind.MULTIPLE_CHOICE })
  kind: QuestionKind;

  @Column({ name: 'question_text', type: 'text' })
  questionText: string;

  @Column({ name: 'time_limit_seconds', type: 'int', default: 20 })
  timeLimitSeconds: number;

  @Column({ type: 'int', default: 1000 })
  points: number;

  @OneToMany(() => QuestionOption, (option) => option.question)
  options: Relation<QuestionOption[]>;

  @Column({
    name: 'image_storage_key',
    type: 'text',
    nullable: true,
    unique: true,
  })
  imageStorageKey: string | null;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ name: 'image_mime_type', type: 'text', nullable: true })
  imageMimeType: string | null;

  @Column({ name: 'image_size', type: 'int', nullable: true })
  imageSize: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
