import 'dotenv/config';
import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabaseOptions } from './database.config';
import { DatabaseReadiness } from './database-readiness.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ ...getDatabaseOptions(), autoLoadEntities: true }),
    }),
  ],
  providers: [DatabaseReadiness],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
