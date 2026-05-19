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

  private verifySecret(secret: string): void {
    const expected = this.configService.get<string>('FL_WEBHOOK_SECRET', '');
    if (!secret || secret !== expected) {
      throw new BadRequestException('Invalid FL webhook secret');
    }
  }

  @Post('progress')
  @HttpCode(200)
  async progress(
    @Body() body: any,
    @Headers('x-fl-secret') secret: string,
  ) {
    this.verifySecret(secret);
    await this.flService.handleProgress(body);
    return { status: 'ok' };
  }

  @Post('round-complete')
  @HttpCode(200)
  async roundComplete(
    @Body() body: any,
    @Headers('x-fl-secret') secret: string,
  ) {
    this.verifySecret(secret);
    await this.flService.handleRoundComplete(body);
    return { status: 'ok' };
  }
}
