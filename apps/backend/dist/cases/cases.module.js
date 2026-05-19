"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CasesModule = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const axios_1 = require("@nestjs/axios");
const prisma_module_1 = require("../prisma/prisma.module");
const auth_module_1 = require("../auth/auth.module");
const inference_module_1 = require("../inference/inference.module");
const fl_module_1 = require("../fl/fl.module");
const cases_service_1 = require("./cases.service");
const cases_controller_1 = require("./cases.controller");
const al_service_1 = require("./al.service");
const pdf_service_1 = require("./pdf.service");
const multer_config_1 = require("../common/config/multer.config");
let CasesModule = class CasesModule {
};
exports.CasesModule = CasesModule;
exports.CasesModule = CasesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            platform_express_1.MulterModule.register(multer_config_1.multerOptions),
            axios_1.HttpModule,
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            inference_module_1.InferenceModule,
            fl_module_1.FlModule,
        ],
        providers: [cases_service_1.CasesService, al_service_1.AlService, pdf_service_1.PdfService],
        controllers: [cases_controller_1.CasesController],
    })
], CasesModule);
//# sourceMappingURL=cases.module.js.map