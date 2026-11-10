import type { EntityManager } from 'typeorm';
import { FileCleanupJob } from '../entities/file-cleanup-job.entity';

export async function enqueueCleanup(
  manager: EntityManager,
  keys: string[],
): Promise<void> {
  const userUploads = keys.filter((key) => !/^q(?:[1-9]|10)\.png$/.test(key));
  if (!userUploads.length) return;
  await manager
    .createQueryBuilder()
    .insert()
    .into(FileCleanupJob)
    .values([...new Set(userUploads)].map((storageKey) => ({ storageKey })))
    .orIgnore()
    .execute();
}
