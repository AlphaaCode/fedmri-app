import {
  Controller,
  Post,
  Body,
  HttpCode,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlService } from './fl.service';

@Controller('internal/fl')
export class FlController {
  constructor(
    private flService: FlService,
    private configService: ConfigService,
  ) {}

  @Post('round-complete')
  @HttpCode(200)
  async roundComplete(
    @Body() body: any,
    @Headers('x-fl-secret') secret: string,
  ) {
    const expectedSecret = this.configService.get<string>('FL_WEBHOOK_SECRET', '');

    if (!secret || secret !== expectedSecret) {
      throw new BadRequestException('Invalid FL webhook secret');
    }

    await this.flService.handleRoundComplete(body);
    return { status: 'ok' };
  }
}
