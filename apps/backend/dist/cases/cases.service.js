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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CasesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const inference_service_1 = require("../inference/inference.service");
const fl_service_1 = require("../fl/fl.service");
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
let CasesService = class CasesService {
    constructor(prisma, inferenceService, flService) {
        this.prisma = prisma;
        this.inferenceService = inferenceService;
        this.flService = flService;
    }
    async create(user, file) {
        if (!file) {
            throw new common_1.InternalServerErrorException('No file provided');
        }
        const caseId = (0, crypto_1.randomUUID)();
        let scope;
        let hospitalId = null;
        let userId = null;
        // Determine scope
        if (user.role === 'DOCTOR') {
            scope = client_1.CaseScope.HOSPITAL;
            hospitalId = user.hospitalId;
        }
        else {
            scope = client_1.CaseScope.PATIENT;
            userId = user.id;
        }
        // Use the file path that multer provides
        const finalPath = file.path;
        // Predict (sync - awaited)
        let predictionResult;
        try {
            predictionResult = await this.inferenceService.predict(finalPath);
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(`Inference failed: ${error?.message || 'Unknown error'}`);
        }
        // Save case to DB
        const caseData = {
            id: caseId,
            scope,
            status: client_1.CaseStatus.PENDING,
            imagePath: finalPath,
            predictedSubtype: predictionResult.predicted_subtype,
            confidence: predictionResult.confidence,
            probs: predictionResult.probs,
            modelVersion: predictionResult.model_version,
            storedLocally: true,
            userId: user.id,
        };
        if (hospitalId) {
            caseData.hospitalId = hospitalId;
        }
        const savedCase = await this.prisma.case.create({
            data: caseData,
        });
        // Return case to client immediately
        const returnCase = {
            ...savedCase,
            probs: savedCase.probs, // Ensure probs is returned as array
        };
        // Fire-and-forget: trigger FL round if DOCTOR
        if (user.role === 'DOCTOR' && hospitalId) {
            this.flService.triggerRound(hospitalId, caseId);
        }
        return returnCase;
    }
    async findAll(user, query = {}) {
        const page = query.page || 1;
        const limit = query.limit || 10;
        const skip = (page - 1) * limit;
        let where = {};
        // Filter by hospital (DOCTOR) or user (PATIENT)
        if (user.role === 'DOCTOR') {
            where.hospitalId = user.hospitalId;
        }
        else {
            where.userId = user.id;
        }
        const [data, total] = await Promise.all([
            this.prisma.case.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.case.count({ where }),
        ]);
        return {
            data: data.map((c) => ({
                ...c,
                probs: c.probs, // Ensure probs is returned as array
            })),
            total,
        };
    }
    async getAttention(user, id) {
        // Reuse findOne for silo enforcement (throws ForbiddenException on mismatch)
        await this.findOne(user, id);
        return this.inferenceService.getAttention(id);
    }
    async findOne(user, id) {
        const caseData = await this.prisma.case.findUnique({
            where: { id },
        });
        if (!caseData) {
            throw new common_1.ForbiddenException('Case not found');
        }
        // Enforce hospital silo
        if (user.role === 'DOCTOR' && caseData.hospitalId !== user.hospitalId) {
            throw new common_1.ForbiddenException('You do not have access to this case');
        }
        // Enforce patient silo
        if (user.role === 'PATIENT' && caseData.userId !== user.id) {
            throw new common_1.ForbiddenException('You do not have access to this case');
        }
        return {
            ...caseData,
            probs: caseData.probs, // Ensure probs is returned as array
        };
    }
};
exports.CasesService = CasesService;
exports.CasesService = CasesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        inference_service_1.InferenceService,
        fl_service_1.FlService])
], CasesService);
//# sourceMappingURL=cases.service.js.map