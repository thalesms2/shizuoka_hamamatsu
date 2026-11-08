import { Module } from '@nestjs/common';
import { AccessHistoriesService } from './access-histories.service.js';

@Module({
  providers: [AccessHistoriesService],
  exports: [AccessHistoriesService],
})
export class AccessHistoriesModule {}
