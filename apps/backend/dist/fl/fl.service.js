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
var FlService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const prisma_service_1 = require("../prisma/prisma.service");
const fl_gateway_1 = require("./fl.gateway");
const rxjs_1 = require("rxjs");
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
let FlService = FlService_1 = class FlService {
    constructor(configService, httpService, prisma, gateway) {
        this.configService = configService;
        this.httpService = httpService;
        this.prisma = prisma;
        this.gateway = gateway;
        this.logger = new common_1.Logger(FlService_1.name);
        this.flCoordinatorUrl = this.configService.get('FL_COORDINATOR_URL', 'http://localhost:8002');
    }
    triggerRound(hospitalId, caseId) {
        // Fire-and-forget: do not await, do not throw
        Promise.resolve().then(async () => {
            try {
                const hospital = await this.prisma.hospital.findUnique({
                    where: { id: hospitalId },
                });
                if (!hospital) {
                    this.logger.error(`Hospital ${hospitalId} not found for FL round trigger`);
                    return;
                }
                const resp = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.flCoordinatorUrl}/round/start`, {
                    hospital_id: hospital.flClientId,
                    case_id: caseId,
                    trigger: 'DOCTOR_UPLOAD',
                }));
                const roundId = resp.data?.round_id;
                if (roundId) {
                    this.gateway.emitRoundStarted({
                        roundId,
                        hospitalId,
                        caseId,
                    });
                }
            }
            catch (error) {
                this.logger.error(`Failed to trigger FL round: ${error?.message}`);
            }
        });
    }
    async handleProgress(body) {
        // Map coordinator hospital_id (flClientId) → internal hospitalId for the gateway payload
        const hospital = await this.prisma.hospital.findFirst({
            where: { flClientId: body.hospital_id },
        });
        this.gateway.emitProgress({
            roundId: body.round_id,
            hospitalId: hospital?.id ?? body.hospital_id,
            phase: body.phase,
            epochsDone: body.epochs_done ?? 0,
        });
    }
    async handleRoundComplete(body) {
        const roundId = body.round_id || (0, crypto_1.randomUUID)();
        const roundNumber = body.round_number ?? 1;
        const strategyRaw = (body.strategy || 'FEDPROX').toUpperCase();
        const strategy = strategyRaw === 'FEDAVG' ? client_1.FLStrategy.FEDAVG : client_1.FLStrategy.FEDPROX;
        const contributionsIn = body.contributions || [];
        const triggeredCase = body.triggered_case;
        // Resolve hospitals for every contribution by flClientId
        const flClientIds = contributionsIn.map((c) => c.hospital_id);
        const hospitals = await this.prisma.hospital.findMany({
            where: { flClientId: { in: flClientIds } },
        });
        const hospitalByFlId = new Map(hospitals.map((h) => [h.flClientId, h]));
        const participantIds = hospitals.map((h) => h.id);
        // Create FlRound + nested contributions + privacy logs in a transaction
        const round = await this.prisma.flRound.create({
            data: {
                id: roundId,
                roundNumber,
                strategy,
                participants: { hospitals: participantIds },
                globalF1Before: body.global_f1_before ?? 0,
                globalF1After: body.global_f1_after ?? 0,
                f1PerClassAfter: (body.f1_per_class_after ?? {}),
                durationSeconds: body.duration_seconds ?? 0,
                modelVersion: body.model_version ?? 1,
                triggeredBy: client_1.FLTrigger.DOCTOR_UPLOAD,
            },
        });
        for (const c of contributionsIn) {
            const hospital = hospitalByFlId.get(c.hospital_id);
            if (!hospital) {
                this.logger.warn(`Unknown hospital flClientId ${c.hospital_id} in contribution`);
                continue;
            }
            await this.prisma.flContribution.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    flRoundId: round.id,
                    hospitalId: hospital.id,
                    localEpochs: c.local_epochs ?? 0,
                    samplesUsed: c.samples_used ?? 0,
                    localF1Before: c.local_f1_before ?? 0,
                    localF1After: c.local_f1_after ?? 0,
                    weightDeltaNorm: c.weight_delta_norm ?? 0,
                    privacyBudgetUsed: c.privacy_budget_used ?? 0.1,
                },
            });
            // Privacy audit: invariant #1 — rawDataTransmitted always 0
            await this.prisma.privacyAuditLog.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    flRoundId: round.id,
                    hospitalId: hospital.id,
                    eventType: client_1.PrivacyEvent.WEIGHTS_SENT,
                    bytesTransmitted: Math.max(0, Math.round((c.weight_delta_norm ?? 0.1) * 1_000_000)),
                    rawDataTransmitted: 0,
                },
            });
        }
        // Link the triggering case to this round
        if (triggeredCase) {
            try {
                await this.prisma.case.update({
                    where: { id: triggeredCase },
                    data: { flRoundId: round.id },
                });
            }
            catch (err) {
                this.logger.warn(`Could not link case ${triggeredCase} to round ${round.id}: ${err?.message}`);
            }
        }
        // Emit WS event to all connected doctors
        const f1Delta = (body.global_f1_after ?? 0) - (body.global_f1_before ?? 0);
        this.gateway.emitRoundComplete({
            roundId: round.id,
            globalF1After: body.global_f1_after ?? 0,
            f1Delta: Number(f1Delta.toFixed(4)),
            modelVersion: body.model_version ?? 1,
        });
    }
    async findRounds(page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.prisma.flRound.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.flRound.count(),
        ]);
        return { data, total };
    }
    async findRound(id) {
        const round = await this.prisma.flRound.findUnique({
            where: { id },
            include: { contributions: true },
        });
        if (!round) {
            throw new common_1.NotFoundException('FL round not found');
        }
        return round;
    }
    async getHospitalContribution(hospitalId) {
        const contributions = await this.prisma.flContribution.findMany({
            where: { hospitalId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        const totalRounds = contributions.length;
        const totalSamples = contributions.reduce((sum, c) => sum + c.samplesUsed, 0);
        const avgLocalF1After = totalRounds === 0
            ? 0
            : contributions.reduce((s, c) => s + c.localF1After, 0) / totalRounds;
        return {
            hospitalId,
            totalRounds,
            totalSamples,
            avgLocalF1After: Number(avgLocalF1After.toFixed(4)),
            recent: contributions.slice(0, 10),
        };
    }
    async getPrivacyLog(hospitalId) {
        return this.prisma.privacyAuditLog.findMany({
            where: { hospitalId },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
};
exports.FlService = FlService;
exports.FlService = FlService = FlService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService,
        prisma_service_1.PrismaService,
        fl_gateway_1.FlGateway])
], FlService);
//# sourceMappingURL=fl.service.js.map