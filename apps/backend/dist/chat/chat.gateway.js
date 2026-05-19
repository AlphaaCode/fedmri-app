"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChatGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const socket_io_1 = require("socket.io");
const chat_service_1 = require("./chat.service");
let ChatGateway = ChatGateway_1 = class ChatGateway {
    constructor(chatService, jwtService) {
        this.chatService = chatService;
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(ChatGateway_1.name);
    }
    async handleConnection(socket) {
        const token = socket.handshake.auth?.token ||
            socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
        if (!token) {
            socket.disconnect(true);
            return;
        }
        try {
            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_ACCESS_SECRET || 'dev-secret',
            });
            socket.data.user = {
                id: payload.sub,
                role: payload.role,
                hospitalId: payload.hospitalId,
            };
        }
        catch {
            socket.disconnect(true);
        }
    }
    async handleMessage(payload, socket) {
        const user = socket.data.user;
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
            for await (const chunk of this.chatService.streamResponse(user.id, payload.role ?? (user.role === 'DOCTOR' ? 'doctor' : 'patient'), payload.content, payload.caseId)) {
                socket.emit('chat:token', chunk);
                if (chunk.done)
                    break;
            }
        }
        catch (err) {
            this.logger.error(`Stream error for user ${user.id}: ${err?.message}`);
            socket.emit('chat:error', { code: 'STREAM_ERROR', message: 'AI response failed' });
        }
    }
};
exports.ChatGateway = ChatGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ChatGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('chat:message'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleMessage", null);
exports.ChatGateway = ChatGateway = ChatGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/chat', cors: { origin: '*' } }),
    __metadata("design:paramtypes", [chat_service_1.ChatService,
        jwt_1.JwtService])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map