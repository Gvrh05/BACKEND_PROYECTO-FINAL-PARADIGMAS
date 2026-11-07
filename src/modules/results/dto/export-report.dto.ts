export enum ReportFormat {
  CSV = 'CSV',
  JSON = 'JSON',
  PDF = 'PDF',
}

export class ExportReportDto {
  sessionId: string;
  format: ReportFormat;
}
