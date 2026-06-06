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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fl_service_1 = require("./fl.service");
let FlController = class FlController {
    constructor(flService, configService) {
        this.flService = flService;
        this.configService = configService;
    }
    verifySecret(secret) {
        const expected = this.configService.get('FL_WEBHOOK_SECRET', '');
        if (!secret || secret !== expected) {
            throw new common_1.BadRequestException('Invalid FL webhook secret');
        }
    }
    async progress(body, secret) {
        this.verifySecret(secret);
        await this.flService.handleProgress(body);
        return { status: 'ok' };
    }
    async roundComplete(body, secret) {
        this.verifySecret(secret);
        await this.flService.handleRoundComplete(body);
        return { status: 'ok' };
    }
    async testProgress(body, secret) {
        this.verifySecret(secret);
        await this.flService.handleTestProgress(body);
        return { ok: true };
    }
};
exports.FlController = FlController;
__decorate([
    (0, common_1.Post)('progress'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-fl-secret')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], FlController.prototype, "progress", null);
__decorate([
    (0, common_1.Post)('round-complete'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-fl-secret')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], FlController.prototype, "roundComplete", null);
__decorate([
    (0, common_1.Post)('test-progress'),
    (0, common_1.HttpCode)(202),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-fl-secret')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], FlController.prototype, "testProgress", null);
exports.FlController = FlController = __decorate([
    (0, common_1.Controller)('internal/fl'),
    __metadata("design:paramtypes", [fl_service_1.FlService,
        config_1.ConfigService])
], FlController);
//# sourceMappingURL=fl.controller.js.map