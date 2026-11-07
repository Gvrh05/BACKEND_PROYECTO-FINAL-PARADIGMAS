import { Module, Global } from '@nestjs/common';

/**
 * DatabaseModule
 * Módulo global para la conexión y configuración de la base de datos (Prisma / TypeORM).
 */
@Global()
@Module({
  providers: [],
  exports: [],
})
export class DatabaseModule {}
