import { Injectable } from '@nestjs/common';
import { GameResult } from '../entities/game-result.entity';
import { ExportReportDto } from '../dto/export-report.dto';

@Injectable()
export class ResultsService {
  async findByPin(pin: string): Promise<GameResult | null> {
    return {
      id: `result_${pin}`,
      pin,
      quizId: 'quiz_default',
      totalPlayers: 0,
      scores: [],
      createdAt: new Date(),
    };
  }

  async exportReport(dto: ExportReportDto) {
    return {
      sessionId: dto.sessionId,
      format: dto.format,
      downloadUrl: `/uploads/reports/${dto.sessionId}.${dto.format.toLowerCase()}`,
    };
  }
}
