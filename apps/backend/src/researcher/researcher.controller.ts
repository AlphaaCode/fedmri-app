import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
}
