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
var AlService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const fl_gateway_1 = require("../fl/fl.gateway");
let AlService = AlService_1 = class AlService {
    constructor(config, http, prisma, gateway) {
        this.config = config;
        this.http = http;
        this.prisma = prisma;
        this.gateway = gateway;
        this.logger = new common_1.Logger(AlService_1.name);
        this.mlServiceUrl = this.config.get('ML_SERVICE_URL', 'http://localhost:8001');
    }
    /**
     * Fire-and-forget AL fine-tune trigger after a doctor disputes a prediction.
     * Same pattern as FL round trigger — returns immediately, work happens async.
     */
    triggerUpdate(caseId, correctSubtype, predictedSubtype, feedbackId, kind = 'DISPUTE') {
        Promise.resolve().then(async () => {
            try {
                const resp = await (0, rxjs_1.firstValueFrom)(this.http.post(`${this.mlServiceUrl}/feedback`, {
                    case_id: caseId,
                    correct_subtype: correctSubtype,
                    predicted_subtype: predictedSubtype,
                    feedback_type: kind,
                }));
                const data = resp.data;
                const f1Macro = data.f1_macro;
                const f1PerClass = data.f1_per_class;
                const accuracy = data.accuracy;
                // Allocate the next version from our own metrics history (not the
                // ml-service's in-memory counter, which resets on restart). Retry on the
                // unique modelVersion constraint so concurrent feedback can't lose an
                // update — two near-simultaneous fine-tunes would otherwise collide.
                let newVersion = 0;
                let prevF1 = f1Macro;
                for (let attempt = 0;; attempt++) {
                    const top = await this.prisma.modelMetrics.findFirst({
                        orderBy: { modelVersion: 'desc' },
                    });
                    newVersion = (top?.modelVersion ?? 1) + 1;
                    prevF1 = top?.f1Macro ?? f1Macro;
                    try {
                        await this.prisma.modelMetrics.create({
                            data: {
                                id: (0, crypto_1.randomUUID)(),
                                modelVersion: newVersion,
                                flRound: 0, // 0 indicates AL update (not FL round)
                                accuracy,
                                f1Macro,
                                f1PerClass: f1PerClass,
                                strategy: 'AL',
                            },
                        });
                        break;
                    }
                    catch (e) {
                        if (e?.code === 'P2002' && attempt < 4)
                            continue; // version taken, retry
                        throw e;
                    }
                }
                await this.prisma.feedback.update({
                    where: { id: feedbackId },
                    data: { newModelVersion: newVersion },
                });
                const f1Delta = Number((f1Macro - prevF1).toFixed(4));
                this.gateway.server.to('doctors').emit('model:updated', {
                    modelVersion: newVersion,
                    f1Macro,
                    f1Delta,
                    correctedSubtype: correctSubtype,
                    kind,
                    caseId,
                });
                this.logger.log(`AL ${kind}: model v${newVersion}, F1 ${f1Macro.toFixed(4)} (Δ ${f1Delta >= 0 ? '+' : ''}${f1Delta.toFixed(4)})`);
            }
            catch (err) {
                this.logger.error(`AL trigger failed: ${err?.message}`);
            }
        });
    }
};
exports.AlService = AlService;
exports.AlService = AlService = AlService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService,
        prisma_service_1.PrismaService,
        fl_gateway_1.FlGateway])
], AlService);
//# sourceMappingURL=al.service.js.map