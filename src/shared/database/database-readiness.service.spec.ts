import type { DataSource } from 'typeorm';
import { DatabaseReadiness } from './database-readiness.service';

describe('DatabaseReadiness', () => {
  it('refuses pending migrations instead of silently synchronizing', async () => {
    const dataSource = { showMigrations: jest.fn().mockResolvedValue(true) };
    await expect(
      new DatabaseReadiness(dataSource as unknown as DataSource).onModuleInit(),
    ).rejects.toThrow('Hay migraciones pendientes');
  });

  it('allows an explicitly migrated database', async () => {
    const dataSource = { showMigrations: jest.fn().mockResolvedValue(false) };
    await expect(
      new DatabaseReadiness(dataSource as unknown as DataSource).onModuleInit(),
    ).resolves.toBeUndefined();
  });
});
