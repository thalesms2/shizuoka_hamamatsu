import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { ZApiClient } from './z-api.client.js';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, ZApiClient],
  exports: [MessagesService],
})
export class MessagingModule {}
