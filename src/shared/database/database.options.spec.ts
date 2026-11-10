import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database.options';
import { Quiz } from '../../modules/quizzes/entities/quiz.entity';
import { Question } from '../../modules/quizzes/entities/question.entity';
import { GameSessionEntity } from '../../modules/game-session/entities/game-session.entity';

class MetadataOnlyDataSource extends DataSource {
  buildMetadataWithoutConnecting() {
    return this.buildMetadatas();
  }
}

describe('TypeORM configuration and entity mapping (no database connection)', () => {
  const url =
    'postgresql://postgres:postgres@localhost:5432/kahoot_db?schema=public';

  it.each(['development', 'test', 'production'])(
    'preserves DATABASE_URL and only synchronizes outside production: %s',
    (environment) => {
      expect(
        databaseOptions(
          new ConfigService({ DATABASE_URL: url, NODE_ENV: environment }),
        ),
      ).toMatchObject({
        type: 'postgres',
        url,
        schema: 'public',
        synchronize: environment !== 'production',
      });
    },
  );

  it('requires DATABASE_URL instead of silently connecting to defaults', () => {
    expect(() => databaseOptions(new ConfigService())).toThrow();
  });

  it('builds PostgreSQL metadata for relationships, ownership and unique room codes without running a seed', async () => {
    const source = new MetadataOnlyDataSource({
      ...databaseOptions(
        new ConfigService({ DATABASE_URL: url, NODE_ENV: 'test' }),
      ),
      entities: [Quiz, Question, GameSessionEntity],
    });
    await source.buildMetadataWithoutConnecting();
    const quiz = source.getMetadata(Quiz);
    const question = source.getMetadata(Question);
    const session = source.getMetadata(GameSessionEntity);
    expect(quiz.tableName).toBe('quizzes');
    expect(quiz.findColumnWithPropertyName('ownerId')?.type).toBe('varchar');
    expect(question.foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ onDelete: 'CASCADE' }),
      ]),
    );
    expect(
      question.findRelationWithPropertyPath('quiz')?.inverseEntityMetadata,
    ).toBe(quiz);
    expect(
      session.uniques.some((unique) =>
        unique.columns.some((column) => column.propertyName === 'roomCode'),
      ),
    ).toBe(true);
    expect(session.findColumnWithPropertyName('roomCode')?.length).toBe('6');
    expect(session.findColumnWithPropertyName('startedAt')?.isNullable).toBe(
      true,
    );
    expect(session.findColumnWithPropertyName('finishedAt')?.isNullable).toBe(
      true,
    );
    expect(source.isInitialized).toBe(false);
  });
});
