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
const prisma_module_1 = require("../prisma/prisma.module");
const fl_service_1 = require("./fl.service");
const fl_controller_1 = require("./fl.controller");
let FlModule = class FlModule {
};
exports.FlModule = FlModule;
exports.FlModule = FlModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, axios_1.HttpModule],
        providers: [fl_service_1.FlService],
        controllers: [fl_controller_1.FlController],
        exports: [fl_service_1.FlService],
    })
], FlModule);
//# sourceMappingURL=fl.module.js.map