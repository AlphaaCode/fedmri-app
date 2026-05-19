import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

interface ChatMessagePayload {
  content: string;
  caseId?: string;
  role: 'doctor' | 'patient';
}

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private logger = new Logger(ChatGateway.name);

  constructor(
    private chatService: ChatService,
    private jwtService: JwtService,
  ) {}

  async handleConnection(socket: Socket) {
    const token =
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.headers?.authorization as string)?.replace(/^Bearer\s+/i, '');

    if (!token) {
      socket.disconnect(true);
      return;
    }

    try {
      const payload: any = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'dev-secret',
      });
      (socket.data as any).user = {
        id: payload.sub,
        role: payload.role,
        hospitalId: payload.hospitalId,
      };
    } catch {
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('chat:message')
  async handleMessage(
    @MessageBody() payload: ChatMessagePayload,
    @ConnectedSocket() socket: Socket,
  ) {
    const user = (socket.data as any).user;
    if (!user) {
      socket.emit('chat:error', { code: 'UNAUTHORIZED' });
      return;
    }

    const allowed = await this.chatService.checkRateLimit(user.id);
    if (!allowed) {
      socket.emit('chat:error', { code: 'RATE_LIMIT', message: 'Too many messages — wait a minute' });
      return;
    }

    try {
      for await (const chunk of this.chatService.streamResponse(
        user.id,
        payload.role ?? (user.role === 'DOCTOR' ? 'doctor' : 'patient'),
        payload.content,
        payload.caseId,
      )) {
        socket.emit('chat:token', chunk);
        if (chunk.done) break;
      }
    } catch (err: any) {
      this.logger.error(`Stream error for user ${user.id}: ${err?.message}`);
      socket.emit('chat:error', { code: 'STREAM_ERROR', message: 'AI response failed' });
    }
  }
}
