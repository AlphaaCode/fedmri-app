import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class FlGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private logger = new Logger(FlGateway.name);

  constructor(private jwtService: JwtService) {}

  async handleConnection(socket: Socket) {
    const token =
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.headers?.authorization as string)?.replace(
        /^Bearer\s+/i,
        '',
      );

    if (!token) {
      this.logger.warn(`Socket ${socket.id} rejected: no token`);
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

      if (payload.role === 'DOCTOR') {
        socket.join('doctors');
        this.logger.log(`Doctor ${payload.sub} joined room 'doctors'`);
      } else {
        this.logger.warn(`Non-doctor ${payload.sub} connected (no room)`);
      }
    } catch (err: any) {
      this.logger.warn(`Socket ${socket.id} rejected: ${err?.message}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    this.logger.log(`Socket ${socket.id} disconnected`);
  }

  emitRoundStarted(payload: {
    roundId: string;
    hospitalId: string;
    caseId: string;
  }): void {
    this.server.to('doctors').emit('fl:round:started', payload);
  }

  emitProgress(payload: {
    roundId: string;
    hospitalId: string;
    phase: string;
    epochsDone: number;
  }): void {
    this.server.to('doctors').emit('fl:round:progress', payload);
  }

  emitRoundComplete(payload: {
    roundId: string;
    globalF1After: number;
    f1Delta: number;
    modelVersion: number;
  }): void {
    this.server.to('doctors').emit('fl:round:complete', payload);
  }
}
