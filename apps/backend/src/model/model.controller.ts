import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModelService } from './model.service';

@Controller('model')
@UseGuards(JwtAuthGuard)
export class ModelController {
  constructor(private modelService: ModelService) {}

  @Get('history')
  async history() {
    return this.modelService.getHistory();
  }

  @Get('per-class')
  async perClass() {
    return this.modelService.getPerClass();
  }

  @Get('confusion-matrix')
  async confusion() {
    return this.modelService.getConfusionMatrix();
  }

  @Get('comparison')
  async comparison() {
    return this.modelService.getComparison();
  }
}
