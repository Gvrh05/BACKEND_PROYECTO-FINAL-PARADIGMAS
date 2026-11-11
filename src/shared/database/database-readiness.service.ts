import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseReadiness implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (await this.dataSource.showMigrations()) {
      throw new Error(
        'Hay migraciones pendientes. Ejecuta migration:run antes de iniciar la API.',
      );
    }
  }
}
