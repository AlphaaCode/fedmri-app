import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ResearcherController } from './researcher.controller';
import { ResearcherService } from './researcher.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ResearcherController],
  providers: [ResearcherService],
})
export class ResearcherModule {}
