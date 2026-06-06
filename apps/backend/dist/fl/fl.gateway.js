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
var FlGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const socket_io_1 = require("socket.io");
let FlGateway = FlGateway_1 = class FlGateway {
    constructor(jwtService) {
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(FlGateway_1.name);
    }
    async handleConnection(socket) {
        const token = socket.handshake.auth?.token ||
            socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
        if (!token) {
            this.logger.warn(`Socket ${socket.id} rejected: no token`);
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
            if (payload.role === 'DOCTOR') {
                socket.join('doctors');
                this.logger.log(`Doctor ${payload.sub} joined room 'doctors'`);
            }
            else if (payload.role === 'RESEARCHER') {
                socket.join('researchers');
                this.logger.log(`Researcher ${payload.sub} joined room 'researchers'`);
            }
            else {
                this.logger.warn(`Unhandled role ${payload.sub} connected (no room)`);
            }
        }
        catch (err) {
            this.logger.warn(`Socket ${socket.id} rejected: ${err?.message}`);
            socket.disconnect(true);
        }
    }
    handleDisconnect(socket) {
        this.logger.log(`Socket ${socket.id} disconnected`);
    }
    emitRoundStarted(payload) {
        this.server.to('doctors').emit('fl:round:started', payload);
    }
    emitProgress(payload) {
        this.server.to('doctors').emit('fl:round:progress', payload);
    }
    emitRoundComplete(payload) {
        this.server.to('doctors').emit('fl:round:complete', payload);
    }
    emitTestProgress(payload) {
        this.server.to('researchers').emit('fl:test:progress', payload);
    }
    emitTestComplete(payload) {
        this.server.to('researchers').emit('fl:test:complete', payload);
    }
};
exports.FlGateway = FlGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], FlGateway.prototype, "server", void 0);
exports.FlGateway = FlGateway = FlGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ cors: { origin: '*' } }),
    __metadata("design:paramtypes", [jwt_1.JwtService])
], FlGateway);
//# sourceMappingURL=fl.gateway.js.map