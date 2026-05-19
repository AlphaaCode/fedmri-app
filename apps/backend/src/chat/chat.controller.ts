import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('history')
  async getHistory(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getHistory(user.id, limit ? parseInt(limit, 10) : 50);
  }
}
