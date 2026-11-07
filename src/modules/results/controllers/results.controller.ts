import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ResultsService } from '../services/results.service';
import { ExportReportDto } from '../dto/export-report.dto';

@Controller('results')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Get(':pin')
  findByPin(@Param('pin') pin: string) {
    return this.resultsService.findByPin(pin);
  }

  @Post('export')
  exportReport(@Body() exportReportDto: ExportReportDto) {
    return this.resultsService.exportReport(exportReportDto);
  }
}
