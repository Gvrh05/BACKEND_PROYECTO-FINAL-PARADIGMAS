import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { ResultsService } from '../services/results.service';
import { ExportReportDto } from '../dto/export-report.dto';

@Controller('results')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Get(':pin')
  findByPin(@Param('pin') pin: string, @CurrentUser('userId') userId: string) {
    return this.resultsService.findByPin(pin, userId);
  }

  @Post('export')
  exportReport(
    @Body() exportReportDto: ExportReportDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.resultsService.exportReport(exportReportDto, userId);
  }
}
