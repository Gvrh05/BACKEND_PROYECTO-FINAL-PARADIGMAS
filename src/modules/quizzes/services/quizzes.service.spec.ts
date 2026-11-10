import { DataSource } from 'typeorm';
import { Quiz } from '../entities/quiz.entity';
import { QuizzesService } from './quizzes.service';
import { PUNTO3_DEMO_AUTHOR_ID } from '../../../shared/database/punto3-demo-owner';

describe('QuizzesService additive ownership queries against the authoring schema', () => {
  const host = '7ac9810a-b36c-4c85-8b58-b296434f0300';
  const otherHost = '7ac9810a-b36c-4c85-8b58-b296434f0400';
  const own = { id: 'own', authorId: host, title: 'Owned' };
  const other = { id: 'other', authorId: otherHost, title: 'Other' };
  let service: QuizzesService;
  let repository: {
    findOneBy: jest.Mock;
    existsBy: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(() => {
    const quizzes = [own, other];
    repository = {
      findOneBy: jest.fn((where: { id: string; authorId: string }) =>
        Promise.resolve(
          quizzes.find(
            (q) => q.id === where.id && q.authorId === where.authorId,
          ) ?? null,
        ),
      ),
      existsBy: jest.fn((where: { id: string; authorId: string }) =>
        Promise.resolve(
          quizzes.some(
            (q) => q.id === where.id && q.authorId === where.authorId,
          ),
        ),
      ),
      find: jest.fn(({ where }: { where: { authorId: string } }) =>
        Promise.resolve(quizzes.filter((q) => q.authorId === where.authorId)),
      ),
    };
    service = new QuizzesService({
      getRepository: (entity: unknown) => {
        expect(entity).toBe(Quiz);
        return repository;
      },
    } as unknown as DataSource);
  });

  it('queries id and authorId, returning null for absent/foreign quizzes', async () => {
    await expect(service.findOneByOwner('own', host)).resolves.toBe(own);
    expect(repository.findOneBy).toHaveBeenCalledWith({
      id: 'own',
      authorId: host,
    });
    await expect(service.findOneByOwner('other', host)).resolves.toBeNull();
    await expect(service.findOneByOwner('absent', host)).resolves.toBeNull();
  });

  it('checks ownership as well as existence', async () => {
    await expect(service.existsAndOwnedBy('own', host)).resolves.toBe(true);
    await expect(service.existsAndOwnedBy('other', host)).resolves.toBe(false);
    expect(repository.existsBy).toHaveBeenCalledWith({
      id: 'other',
      authorId: host,
    });
  });

  it('lists only the owner without falling back to the authoring public/demo list', async () => {
    const publicList = jest.spyOn(service, 'findAll');
    await expect(service.findAllByOwner(host)).resolves.toEqual([own]);
    expect(repository.find).toHaveBeenCalledWith({
      where: { authorId: host },
      order: { createdAt: 'ASC' },
    });
    expect(publicList).not.toHaveBeenCalled();
    await expect(service.findAllByOwner('invalid-subject')).resolves.toEqual(
      [],
    );
  });

  it('keeps the signed DEV host compatible but never enables its alias in production', async () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      await service.findAllByOwner('test-host-id');
      expect(repository.find).toHaveBeenCalledWith({
        where: { authorId: PUNTO3_DEMO_AUTHOR_ID },
        order: { createdAt: 'ASC' },
      });
      jest.clearAllMocks();
      process.env.NODE_ENV = 'production';
      await expect(
        service.findOneByOwner('own', 'test-host-id'),
      ).resolves.toBeNull();
      await expect(
        service.existsAndOwnedBy('own', 'test-host-id'),
      ).resolves.toBe(false);
      await expect(service.findAllByOwner('test-host-id')).resolves.toEqual([]);
      expect(repository.find).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
