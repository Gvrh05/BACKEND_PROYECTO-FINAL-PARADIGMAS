import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Quiz } from './quiz.entity';
import type { Relation } from 'typeorm';

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  quizId: string;

  @ManyToOne(() => Quiz, (quiz) => quiz.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quizId' })
  quiz: Relation<Quiz>;

  @Column({ type: 'text' })
  statement: string;

  @Column({ type: 'boolean' })
  correctAnswer: boolean;

  @Column({ type: 'int' })
  order: number;

  // Legacy properties stay available; the public quiz CRUD remains unchanged.
  @Column({ type: 'text', nullable: true })
  questionText: string;

  @Column({ type: 'int', default: 20 })
  timeLimitSeconds: number;

  @Column({ type: 'int', default: 1000 })
  points: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  options: {
    id: string;
    text: string;
    isCorrect: boolean;
  }[];

  @Column({ type: 'varchar', nullable: true })
  imageUrl?: string;
}
