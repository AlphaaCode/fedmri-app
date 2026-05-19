import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { FlService } from './fl.service';
import { FlController } from './fl.controller';

@Module({
  imports: [PrismaModule, HttpModule],
  providers: [FlService],
  controllers: [FlController],
  exports: [FlService],
})
export class FlModule {}
