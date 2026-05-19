import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InferenceService } from './inference.service';

@Module({
  imports: [HttpModule],
  providers: [InferenceService],
  exports: [InferenceService],
})
export class InferenceModule {}
