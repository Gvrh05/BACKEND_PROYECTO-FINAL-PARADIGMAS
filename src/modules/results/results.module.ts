import { Module } from '@nestjs/common';
import { ResultsController } from './controllers/results.controller';
import { ResultsService } from './services/results.service';

@Module({
  controllers: [ResultsController],
  providers: [ResultsService],
  exports: [ResultsService],
})
export class ResultsModule {}
