import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GameSessionEntity } from '../../game-session/entities/game-session.entity';
import type { GameResult } from '../entities/game-result.entity';
import { ExportReportDto } from '../dto/export-report.dto';

@Injectable()
export class ResultsService {
  constructor(private readonly dataSource: DataSource) {}

  async findByPin(pin: string, userId: string): Promise<GameResult> {
    const session = await this.dataSource
      .getRepository(GameSessionEntity)
      .findOneBy({ roomCode: pin });
    if (!session?.result || !session.finishedAt || session.hostId !== userId) {
      throw new NotFoundException('Resultado no encontrado');
    }
    return { ...session.result, createdAt: session.finishedAt };
  }

  async exportReport(dto: ExportReportDto, userId: string) {
    await this.findByPin(dto.sessionId, userId);
    throw new NotImplementedException('Exportación no implementada');
  }
}
