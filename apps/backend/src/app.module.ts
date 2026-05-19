import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { CasesModule } from './cases/cases.module';
import { FlModule } from './fl/fl.module';
import { ChatModule } from './chat/chat.module';
import { ModelModule } from './model/model.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    HealthModule,
    CasesModule,
    FlModule,
    ChatModule,
    ModelModule,
  ],
})
export class AppModule {}
