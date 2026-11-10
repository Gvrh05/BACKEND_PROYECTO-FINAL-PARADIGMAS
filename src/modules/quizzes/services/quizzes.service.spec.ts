import { Repository } from 'typeorm';
import { Quiz } from '../entities/quiz.entity';
import { QuizzesService } from './quizzes.service';

describe('QuizzesService additive ownership queries', () => {
  const own = { id: 'own', ownerId: 'host', title: 'Owned' } as Quiz;
  const other = {
    id: 'other',
    ownerId: 'another-host',
    title: 'Other',
  } as Quiz;
  let service: QuizzesService;
  let repository: {
    findOneBy: jest.Mock;
    existsBy: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(() => {
    const quizzes = [own, other];
    repository = {
      findOneBy: jest.fn(
        async (where) =>
          quizzes.find(
            (q) => q.id === where.id && q.ownerId === where.ownerId,
          ) ?? null,
      ),
      existsBy: jest.fn(async (where) =>
        quizzes.some((q) => q.id === where.id && q.ownerId === where.ownerId),
      ),
      find: jest.fn(async ({ where }) =>
        quizzes.filter((q) => q.ownerId === where.ownerId),
      ),
    };
    service = new QuizzesService(repository as unknown as Repository<Quiz>);
  });

  it('findOneByOwner includes both id and ownerId and returns null for another owner or an absent quiz', async () => {
    await expect(service.findOneByOwner('own', 'host')).resolves.toBe(own);
    expect(repository.findOneBy).toHaveBeenCalledWith({
      id: 'own',
      ownerId: 'host',
    });
    await expect(service.findOneByOwner('other', 'host')).resolves.toBeNull();
    await expect(service.findOneByOwner('absent', 'host')).resolves.toBeNull();
  });

  it('existsAndOwnedBy queries ownership as well as existence', async () => {
    await expect(service.existsAndOwnedBy('own', 'host')).resolves.toBe(true);
    await expect(service.existsAndOwnedBy('other', 'host')).resolves.toBe(
      false,
    );
    expect(repository.existsBy).toHaveBeenCalledWith({
      id: 'other',
      ownerId: 'host',
    });
  });

  it('findAllByOwner returns only the requested owner, without a fallback to findAll', async () => {
    const publicList = jest.spyOn(service, 'findAll');
    await expect(service.findAllByOwner('host')).resolves.toEqual([own]);
    expect(repository.find).toHaveBeenCalledWith({
      where: { ownerId: 'host' },
      order: { createdAt: 'ASC' },
    });
    expect(publicList).not.toHaveBeenCalled();
    await expect(service.findAllByOwner('nobody')).resolves.toEqual([]);
  });

  it('preserves all four existing mock methods and does not call the repository from them', async () => {
    const create = { title: 'Original' };
    const question = { questionText: 'Original?' };
    await expect(
      service.create(create as Parameters<QuizzesService['create']>[0]),
    ).resolves.toEqual({ message: 'Quiz created successfully', data: create });
    await expect(service.findAll()).resolves.toEqual([]);
    await expect(service.findOne('quiz')).resolves.toEqual({
      id: 'quiz',
      title: 'Sample Quiz',
    });
    await expect(
      service.addQuestion(
        'quiz',
        question as Parameters<QuizzesService['addQuestion']>[1],
      ),
    ).resolves.toEqual({ quizId: 'quiz', question });
    for (const mock of Object.values(repository))
      expect(mock).not.toHaveBeenCalled();
  });
});
