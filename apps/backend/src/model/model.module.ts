import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ModelController } from './model.controller';
import { ModelService } from './model.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET || 'dev-secret' }),
  ],
  providers: [ModelService],
  controllers: [ModelController],
})
export class ModelModule {}
