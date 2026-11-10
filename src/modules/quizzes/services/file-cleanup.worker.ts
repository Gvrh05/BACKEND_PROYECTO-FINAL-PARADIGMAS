import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Question } from '../entities/question.entity';
import { FileCleanupJob } from '../entities/file-cleanup-job.entity';
import { ImageStorage } from './image-storage.service';
import { enqueueCleanup } from './enqueue-cleanup';

@Injectable()
export class FileCleanupWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(FileCleanupWorker.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: ImageStorage,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Tests explicitly control time and call runOnce; production always schedules it.
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.runOnce().catch(() =>
        this.logger.warn(
          'Limpieza pendiente; se reintentará en el próximo ciclo',
        ),
      );
    }, 60000);
    this.timer.unref();
    await this.runOnce().catch(() =>
      this.logger.warn('Limpieza inicial pendiente; se reintentará'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  runOnce(now = new Date()): Promise<void> {
    if (this.running) return this.running;
    this.running = this.processBatch(now).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async processBatch(now: Date): Promise<void> {
    for (let index = 0; index < 25; index++) {
      const found = await this.dataSource.transaction(async (manager) => {
        const job = await manager
          .getRepository(FileCleanupJob)
          .createQueryBuilder('job')
          .where('job.nextAttemptAt <= :now', { now })
          .orderBy('job.nextAttemptAt', 'ASC')
          .addOrderBy('job.id', 'ASC')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getOne();
        if (!job) return false;
        // Never unlink a currently-associated image, even if a stale job exists.
        const active = await manager.exists(Question, {
          where: { imageStorageKey: job.storageKey },
        });
        if (active) {
          await manager.delete(FileCleanupJob, job.id);
          return true;
        }
        try {
          await this.storage.discard(job.storageKey);
          await manager.delete(FileCleanupJob, job.id);
        } catch {
          job.attempts++;
          const delay = Math.min(
            86400000,
            1000 * 2 ** Math.min(job.attempts, 17),
          );
          job.nextAttemptAt = new Date(now.getTime() + delay);
          await manager.save(FileCleanupJob, job);
          this.logger.warn('Archivo descartado pendiente de reintento');
        }
        return true;
      });
      if (!found) break;
    }
    const candidates = await this.storage.staleCandidates(now);
    for (const path of candidates.stagedPaths)
      await this.storage.discardStaged(path);
    for (const key of candidates.keys) {
      await this.dataSource.transaction(async (manager) => {
        if (
          !(await manager.exists(Question, { where: { imageStorageKey: key } }))
        ) {
          await enqueueCleanup(manager, [key]);
        }
      });
    }
  }
}
