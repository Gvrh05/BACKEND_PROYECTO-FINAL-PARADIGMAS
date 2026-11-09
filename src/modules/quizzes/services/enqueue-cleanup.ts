import type { EntityManager } from 'typeorm';
import { FileCleanupJob } from '../entities/file-cleanup-job.entity';

export async function enqueueCleanup(
  manager: EntityManager,
  keys: string[],
): Promise<void> {
  if (!keys.length) return;
  await manager
    .createQueryBuilder()
    .insert()
    .into(FileCleanupJob)
    .values([...new Set(keys)].map((storageKey) => ({ storageKey })))
    .orIgnore()
    .execute();
}
