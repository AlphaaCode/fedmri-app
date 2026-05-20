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
exports.CasesController = void 0;
const common_1 = require("@nestjs/common");
const pdf_service_1 = require("./pdf.service");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const cases_service_1 = require("./cases.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const multer_config_1 = require("../common/config/multer.config");
let CasesController = class CasesController {
    constructor(casesService, pdfService) {
        this.casesService = casesService;
        this.pdfService = pdfService;
    }
    async verify(file) {
        return this.casesService.verifyImage(file);
    }
    async create(user, file) {
        return this.casesService.create(user, file);
    }
    async findAll(user, page, limit) {
        return this.casesService.findAll(user, { page, limit });
    }
    async findOne(user, id) {
        return this.casesService.findOne(user, id);
    }
    async getAttention(user, id) {
        return this.casesService.getAttention(user, id);
    }
    async downloadPdf(user, id, res) {
        const caseData = await this.casesService.findOne(user, id);
        const buf = await this.pdfService.generate(caseData);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="fedmri-case-${id.slice(0, 8)}.pdf"`,
            'Content-Length': buf.length,
        });
        res.end(buf);
    }
    async submitFeedback(user, id, body) {
        return this.casesService.submitFeedback(user, id, body);
    }
};
exports.CasesController = CasesController;
__decorate([
    (0, common_1.Post)('verify'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { storage: (0, multer_1.memoryStorage)() })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CasesController.prototype, "verify", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(201),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', multer_config_1.multerOptions)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CasesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", Promise)
], CasesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CasesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/attention'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CasesController.prototype, "getAttention", null);
__decorate([
    (0, common_1.Get)(':id/pdf'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CasesController.prototype, "downloadPdf", null);
__decorate([
    (0, common_1.Post)(':id/feedback'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CasesController.prototype, "submitFeedback", null);
exports.CasesController = CasesController = __decorate([
    (0, common_1.Controller)('cases'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [cases_service_1.CasesService,
        pdf_service_1.PdfService])
], CasesController);
//# sourceMappingURL=cases.controller.js.map