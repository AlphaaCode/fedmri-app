import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InferenceModule } from '../inference/inference.module';
import { FlModule } from '../fl/fl.module';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { multerOptions } from '../common/config/multer.config';

@Module({
  imports: [
    MulterModule.register(multerOptions),
    PrismaModule,
    AuthModule,
    InferenceModule,
    FlModule,
  ],
  providers: [CasesService],
  controllers: [CasesController],
})
export class CasesModule {}
