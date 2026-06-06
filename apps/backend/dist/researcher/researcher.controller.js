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
exports.ResearcherController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const researcher_service_1 = require("./researcher.service");
let ResearcherController = class ResearcherController {
    constructor(svc) {
        this.svc = svc;
    }
    overview() {
        return this.svc.getOverview();
    }
    trainingLog(page, limit) {
        return this.svc.getTrainingLog(page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 20);
    }
    modelVersions() {
        return this.svc.getModelVersions();
    }
    flExperiments() {
        return this.svc.getFlExperiments();
    }
    flTest(body) {
        return this.svc.runFlTest(body?.strategy, body?.rounds ?? 10);
    }
    topology() {
        return this.svc.getTopology();
    }
    datasets() {
        return this.svc.getDatasets();
    }
    systemLogs(page, limit, severity) {
        return this.svc.getSystemLogs(page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 50, severity);
    }
};
exports.ResearcherController = ResearcherController;
__decorate([
    (0, common_1.Get)('overview'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ResearcherController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('training-log'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ResearcherController.prototype, "trainingLog", null);
__decorate([
    (0, common_1.Get)('model-versions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ResearcherController.prototype, "modelVersions", null);
__decorate([
    (0, common_1.Get)('fl-experiments'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ResearcherController.prototype, "flExperiments", null);
__decorate([
    (0, common_1.Post)('fl-test'),
    (0, common_1.HttpCode)(202),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ResearcherController.prototype, "flTest", null);
__decorate([
    (0, common_1.Get)('topology'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ResearcherController.prototype, "topology", null);
__decorate([
    (0, common_1.Get)('datasets'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ResearcherController.prototype, "datasets", null);
__decorate([
    (0, common_1.Get)('system-logs'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('severity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], ResearcherController.prototype, "systemLogs", null);
exports.ResearcherController = ResearcherController = __decorate([
    (0, common_1.Controller)('researcher'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('RESEARCHER'),
    __metadata("design:paramtypes", [researcher_service_1.ResearcherService])
], ResearcherController);
//# sourceMappingURL=researcher.controller.js.map