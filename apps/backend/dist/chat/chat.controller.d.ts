import { ChatService } from './chat.service';
export declare class ChatController {
    private chatService;
    constructor(chatService: ChatService);
    getHistory(user: any, limit?: string): Promise<any[]>;
}
//# sourceMappingURL=chat.controller.d.ts.map