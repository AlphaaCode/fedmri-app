"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const jwt_1 = require("@nestjs/jwt");
const prisma_module_1 = require("../prisma/prisma.module");
const auth_module_1 = require("../auth/auth.module");
const fl_service_1 = require("./fl.service");
const fl_controller_1 = require("./fl.controller");
const fl_public_controller_1 = require("./fl-public.controller");
const fl_gateway_1 = require("./fl.gateway");
let FlModule = class FlModule {
};
exports.FlModule = FlModule;
exports.FlModule = FlModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            axios_1.HttpModule,
            auth_module_1.AuthModule,
            jwt_1.JwtModule.register({
                secret: process.env.JWT_ACCESS_SECRET || 'dev-secret',
            }),
        ],
        providers: [fl_service_1.FlService, fl_gateway_1.FlGateway],
        controllers: [fl_controller_1.FlController, fl_public_controller_1.FlPublicController],
        exports: [fl_service_1.FlService],
    })
], FlModule);
//# sourceMappingURL=fl.module.js.map