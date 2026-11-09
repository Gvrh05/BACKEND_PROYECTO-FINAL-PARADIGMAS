import type { DataSource } from 'typeorm';
import { FileCleanupWorker } from './file-cleanup.worker';
import type { ImageStorage } from './image-storage.service';

describe('FileCleanupWorker lifecycle', () => {
  it('runs on production startup, schedules retries and stops its timer on shutdown', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.useFakeTimers();
    const worker = new FileCleanupWorker({} as DataSource, {} as ImageStorage);
    const run = jest.spyOn(worker, 'runOnce').mockResolvedValue();
    try {
      await worker.onApplicationBootstrap();
      expect(run).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(60000);
      expect(run).toHaveBeenCalledTimes(2);
      await worker.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(60000);
      expect(run).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
