import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ResearcherService } from './researcher.service';

@Controller('researcher')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESEARCHER')
export class ResearcherController {
  constructor(private svc: ResearcherService) {}

  @Get('overview')
  overview() {
    return this.svc.getOverview();
  }

  @Get('training-log')
  trainingLog(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getTrainingLog(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('model-versions')
  modelVersions() {
    return this.svc.getModelVersions();
  }

  @Get('fl-experiments')
  flExperiments() {
    return this.svc.getFlExperiments();
  }

  @Post('fl-test')
  @HttpCode(202)
  flTest(@Body() body: { strategy?: string; rounds?: number; alpha?: number }) {
    return this.svc.runFlTest(body?.strategy, body?.rounds ?? 10, body?.alpha);
  }

  @Get('topology')
  topology() {
    return this.svc.getTopology();
  }

  @Get('node-audit/:flClientId')
  nodeAudit(@Param('flClientId') flClientId: string) {
    return this.svc.getNodeAudit(flClientId);
  }

  @Get('node-audit/:flClientId/report')
  async nodeAuditReport(
    @Param('flClientId') flClientId: string,
    @Res() res: Response,
  ) {
    const r = await this.svc.getNodeAuditReport(flClientId);
    if (!r) {
      res.status(404).json({ message: 'Node not found' });
      return;
    }
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${r.filename}"`,
      'Content-Length': r.buffer.length,
    });
    res.end(r.buffer);
  }

  @Get('insights')
  insights(@Query('limit') limit?: string) {
    return this.svc.getInsights(limit ? parseInt(limit, 10) : 10);
  }

  @Get('datasets')
  datasets() {
    return this.svc.getDatasets();
  }

  @Get('system-logs')
  systemLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('severity') severity?: string,
  ) {
    return this.svc.getSystemLogs(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      severity,
    );
  }
}
