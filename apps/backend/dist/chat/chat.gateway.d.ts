import { OnGatewayConnection } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
interface ChatMessagePayload {
    content: string;
    caseId?: string;
    role: 'doctor' | 'patient';
}
export declare class ChatGateway implements OnGatewayConnection {
    private chatService;
    private jwtService;
    server: Server;
    private logger;
    constructor(chatService: ChatService, jwtService: JwtService);
    handleConnection(socket: Socket): Promise<void>;
    handleMessage(payload: ChatMessagePayload, socket: Socket): Promise<void>;
}
export {};
//# sourceMappingURL=chat.gateway.d.ts.map