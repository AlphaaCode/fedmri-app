import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FlService } from './fl.service';

@Controller('fl')
@UseGuards(JwtAuthGuard)
export class FlPublicController {
  constructor(private flService: FlService) {}

  @Get('rounds')
  async listRounds(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.flService.findRounds(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('rounds/:id')
  async getRound(@Param('id') id: string) {
    return this.flService.findRound(id);
  }

  @Get('hospital/contribution')
  async hospitalContribution(@CurrentUser() user: any) {
    if (user.role !== 'DOCTOR' || !user.hospitalId) {
      throw new ForbiddenException('Doctors only');
    }
    return this.flService.getHospitalContribution(user.hospitalId);
  }

  @Get('privacy-log')
  async privacyLog(@CurrentUser() user: any) {
    if (user.role !== 'DOCTOR' || !user.hospitalId) {
      throw new ForbiddenException('Doctors only');
    }
    return this.flService.getPrivacyLog(user.hospitalId);
  }
}
