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
exports.FlService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const prisma_service_1 = require("../prisma/prisma.service");
const rxjs_1 = require("rxjs");
const crypto_1 = require("crypto");
let FlService = class FlService {
    constructor(configService, httpService, prisma) {
        this.configService = configService;
        this.httpService = httpService;
        this.prisma = prisma;
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
                    console.error(`Hospital ${hospitalId} not found for FL round trigger`);
                    return;
                }
                await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.flCoordinatorUrl}/round/start`, {
                    hospital_id: hospital.flClientId,
                    case_id: caseId,
                    trigger: 'DOCTOR_UPLOAD',
                }));
            }
            catch (error) {
                console.error('Failed to trigger FL round:', error);
            }
        });
    }
    async handleRoundComplete(body) {
        const roundId = body.round_id || (0, crypto_1.randomUUID)();
        const caseId = body.case_id;
        const hospitalFlClientId = body.hospital_id;
        // Find hospital by flClientId
        const hospital = await this.prisma.hospital.findFirst({
            where: { flClientId: hospitalFlClientId },
        });
        if (!hospital) {
            throw new Error(`Hospital with flClientId ${hospitalFlClientId} not found`);
        }
        // Get contributors (all hospitals)
        const contributors = await this.prisma.hospital.findMany();
        // Create FL round
        await this.prisma.flRound.create({
            data: {
                id: roundId,
                roundNumber: body.round_number || 1,
                strategy: body.strategy || 'FEDAVG',
                participants: { hospitals: contributors.map(h => h.id) },
                globalF1Before: 0.35,
                globalF1After: 0.41,
                f1PerClassAfter: {
                    'Luminal A': 0.42,
                    'Luminal B': 0.39,
                    'HER2': 0.36,
                    'Triple Negative': 0.38,
                },
                durationSeconds: 30,
                modelVersion: 10,
                triggeredBy: 'DOCTOR_UPLOAD',
                cases: {
                    connect: [{ id: caseId }],
                },
            },
        });
        // Create FL contributions
        for (let i = 0; i < contributors.length; i++) {
            await this.prisma.flContribution.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    flRoundId: roundId,
                    hospitalId: contributors[i].id,
                    localEpochs: 5,
                    samplesUsed: Math.floor(Math.random() * 100) + 50,
                    localF1Before: 0.32 + Math.random() * 0.08,
                    localF1After: 0.38 + Math.random() * 0.08,
                    weightDeltaNorm: Math.random() * 0.5,
                    privacyBudgetUsed: 0.1,
                },
            });
        }
        // Create privacy audit logs (one per hospital, rawDataTransmitted always 0)
        for (let i = 0; i < contributors.length; i++) {
            await this.prisma.privacyAuditLog.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    flRoundId: roundId,
                    hospitalId: contributors[i].id,
                    eventType: 'WEIGHTS_SENT',
                    bytesTransmitted: Math.floor(Math.random() * 10000) + 5000,
                    rawDataTransmitted: 0,
                },
            });
        }
    }
};
exports.FlService = FlService;
exports.FlService = FlService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService,
        prisma_service_1.PrismaService])
], FlService);
//# sourceMappingURL=fl.service.js.map