import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { Role } from '../auth/role.enum.js';
import { Roles } from '../auth/roles.decorator.js';
import {
  receivedCallbackSchema,
  sendMessageSchema,
  type ReceivedCallback,
  type SendMessageDto,
} from './message.dto.js';
import { MessagesService } from './messages.service.js';

@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Roles(Role.Admin, Role.Lawyer)
  @Post('messages')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: sendMessageSchema }) dto: SendMessageDto,
  ) {
    return this.messagesService.send(user.tenantId, dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhooks/z-api/:instanceId/:token/received')
  receive(
    @Param('instanceId') instanceId: string,
    @Param('token') token: string,
    @Body({ schema: receivedCallbackSchema }) payload: ReceivedCallback,
  ): Promise<void> {
    return this.messagesService.receive(instanceId, token, payload);
  }
}
