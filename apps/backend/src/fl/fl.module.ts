import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FlService } from './fl.service';
import { FlController } from './fl.controller';
import { FlPublicController } from './fl-public.controller';
import { FlGateway } from './fl.gateway';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    AuthModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'dev-secret',
    }),
  ],
  providers: [FlService, FlGateway],
  controllers: [FlController, FlPublicController],
  exports: [FlService, FlGateway],
})
export class FlModule {}
