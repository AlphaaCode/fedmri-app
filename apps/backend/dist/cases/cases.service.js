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
const al_service_1 = require("./al.service");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const client_1 = require("@prisma/client");
let CasesService = class CasesService {
    constructor(prisma, inferenceService, flService, alService) {
        this.prisma = prisma;
        this.inferenceService = inferenceService;
        this.flService = flService;
        this.alService = alService;
        this.samplesDir = process.env.SAMPLES_DIR || '';
    }
    /** List bundled sample MRI volumes (for the "Use a sample scan" picker). */
    listSamples() {
        if (!this.samplesDir || !(0, fs_1.existsSync)(this.samplesDir))
            return [];
        return (0, fs_1.readdirSync)(this.samplesDir)
            .filter((f) => f.endsWith('.mha') || f.endsWith('.nii') || f.endsWith('.nii.gz'))
            .slice(0, 12)
            .map((name) => ({ name }));
    }
    /** Create a case from a bundled sample volume (runs the same real pipeline). */
    async createFromSample(user, name, meta) {
        if (!/^[\w.-]+\.(mha|nii|nii\.gz)$/.test(name)) {
            throw new common_1.ForbiddenException('bad sample name');
        }
        const path = (0, path_1.join)(this.samplesDir, name);
        if (!(0, fs_1.existsSync)(path))
            throw new common_1.ForbiddenException('sample not found');
        // Reuse create() with a multer-shaped object pointing at the sample on disk.
        return this.create(user, { path, originalname: name }, meta);
    }
    async create(user, file, meta) {
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
        // Subject attribution. Doctors tag who/what a scan is for (a patient study
        // vs a TEST run); patient self-uploads are always their own PATIENT study.
        let subjectType;
        let subjectLabel;
        if (user.role === 'DOCTOR') {
            subjectType = meta?.subjectType === 'TEST' ? 'TEST' : 'PATIENT';
            const label = (meta?.subjectLabel ?? '').toString().trim().slice(0, 120);
            subjectLabel = label || (subjectType === 'TEST' ? 'Test scan' : null);
        }
        else {
            subjectType = 'PATIENT';
            subjectLabel = null;
        }
        // Save case to DB
        const caseData = {
            id: caseId,
            scope,
            status: client_1.CaseStatus.PENDING,
            imagePath: finalPath,
            subjectType,
            subjectLabel,
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
        // Return case to client immediately. f1/auc/hormoneTherapy are additive
        // real-mode fields surfaced transiently (not persisted — no schema change).
        const returnCase = {
            ...savedCase,
            probs: savedCase.probs, // Ensure probs is returned as array
            f1: predictionResult.f1,
            auc: predictionResult.auc,
            hormoneTherapy: predictionResult.hormone_therapy,
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
        // Reuse findOne for silo enforcement (throws ForbiddenException on mismatch);
        // it returns the case with imagePath, which real-mode attention needs.
        const c = await this.findOne(user, id);
        return this.inferenceService.getAttention(id, c.imagePath);
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
            probs: caseData.probs,
        };
    }
    /**
     * Update editable, doctor-owned fields of a case: the clinical note and the
     * subject attribution (patient label / TEST). Silo-checked via findOne, and
     * only the owning role may edit (doctors edit hospital cases; patients can
     * annotate their own). Never touches prediction/privacy fields.
     */
    async updateCase(user, id, body) {
        await this.findOne(user, id); // silo enforcement (throws on mismatch)
        const data = {};
        if (body.clinicalNote !== undefined) {
            data.clinicalNote = body.clinicalNote.toString().slice(0, 2000) || null;
        }
        // Subject attribution is a doctor concept; patients can't reclassify a study.
        if (user.role === 'DOCTOR') {
            if (body.subjectType !== undefined) {
                data.subjectType = body.subjectType === 'TEST' ? 'TEST' : 'PATIENT';
            }
            if (body.subjectLabel !== undefined) {
                data.subjectLabel = body.subjectLabel.toString().trim().slice(0, 120) || null;
            }
        }
        const updated = await this.prisma.case.update({ where: { id }, data });
        return { ...updated, probs: updated.probs };
    }
    async verifyImage(file) {
        return this.inferenceService.verifyImage(file.buffer, file.originalname || 'scan.jpg');
    }
    async submitFeedback(user, id, body) {
        // Silo check — reuse findOne (throws ForbiddenException on cross-hospital access)
        const caseRow = await this.findOne(user, id);
        const isDispute = body.type === 'DISPUTE';
        if (isDispute && !body.correctSubtype) {
            throw new common_1.ForbiddenException('correctSubtype is required for DISPUTE feedback');
        }
        const feedback = await this.prisma.feedback.create({
            data: {
                id: (0, crypto_1.randomUUID)(),
                caseId: id,
                doctorId: user.id,
                feedbackType: isDispute ? client_1.FeedbackType.DISPUTE : client_1.FeedbackType.VALIDATE,
                correctedSubtype: body.correctSubtype ?? null,
                evidenceTypes: [],
                justification: body.justification ?? null,
                // Both paths feed the model: a correction relabels, a confirmation
                // reinforces the prediction. Either way an AL fine-tune is triggered.
                alTriggered: true,
            },
        });
        await this.prisma.case.update({
            where: { id },
            data: { status: isDispute ? client_1.CaseStatus.DISPUTED : client_1.CaseStatus.VALIDATED },
        });
        // Fire-and-forget active-learning fine-tune. DISPUTE relabels the case to the
        // corrected subtype; VALIDATE confirms the predicted subtype as ground truth
        // (a confirmed label is training signal too — the model learns on approval).
        const confirmedSubtype = isDispute ? body.correctSubtype : caseRow.predictedSubtype;
        this.alService.triggerUpdate(id, confirmedSubtype, caseRow.predictedSubtype, feedback.id, isDispute ? 'DISPUTE' : 'VALIDATE');
        return feedback;
    }
};
exports.CasesService = CasesService;
exports.CasesService = CasesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        inference_service_1.InferenceService,
        fl_service_1.FlService,
        al_service_1.AlService])
], CasesService);
//# sourceMappingURL=cases.service.js.map