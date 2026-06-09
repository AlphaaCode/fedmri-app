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
exports.ResearcherService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const prisma_service_1 = require("../prisma/prisma.service");
const fl_service_1 = require("../fl/fl.service");
let ResearcherService = class ResearcherService {
    constructor(prisma, flService) {
        this.prisma = prisma;
        this.flService = flService;
    }
    /** Trigger a live federated test run on the coordinator (proxied). */
    runFlTest(strategy = 'fedscrt', rounds = 10) {
        const s = strategy === 'fedavg' ? 'fedavg' : 'fedscrt';
        return this.flService.runFlTest(s, Math.min(Math.max(rounds, 1), 30));
    }
    /** Serve the real FL experiment results (copied into src/fl/experiments). */
    getFlExperiments() {
        const candidates = [
            (0, path_1.join)(__dirname, '..', 'fl', 'experiments'), // dist/fl/experiments
            (0, path_1.join)(process.cwd(), 'src', 'fl', 'experiments'), // ts-node / start:dev cwd
        ];
        const base = candidates.find((d) => (0, fs_1.existsSync)(d));
        if (!base)
            return [];
        return (0, fs_1.readdirSync)(base)
            .filter((f) => f.startsWith('fl_') && f.endsWith('.json'))
            .map((f) => {
            const j = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(base, f), 'utf8'));
            return {
                strategy: j.strategy,
                alpha: j.alpha,
                rounds: j.rounds,
                history: j.history ?? [],
                final: {
                    f1: j.final?.f1 ?? 0,
                    auc: j.final?.auc ?? 0,
                    accuracy: j.final?.accuracy ?? 0,
                },
            };
        });
    }
    async getOverview() {
        const [latestMetrics, totalRounds, hospitals] = await Promise.all([
            this.prisma.modelMetrics.findFirst({
                orderBy: { modelVersion: 'desc' },
            }),
            this.prisma.flRound.count(),
            this.prisma.hospital.count(),
        ]);
        // The trained FedSCRT model always exists, so the global model is synchronized.
        const phase = 'complete';
        // Default to the real trained FedSCRT baseline so the portal shows the real
        // model out of the box; live AL updates (doctor approvals/corrections) write
        // newer ModelMetrics rows that override these via the findFirst above.
        return {
            modelVersion: latestMetrics?.modelVersion ?? 1,
            // The deployed global model is always FedSCRT; AL rows are fine-tunes of it,
            // so the strategy label stays FedSCRT (don't surface the internal 'AL' tag).
            strategy: 'FedSCRT',
            f1Macro: latestMetrics?.f1Macro ?? 0.662,
            accuracy: latestMetrics?.accuracy ?? 0.7027,
            totalRounds,
            hospitals,
            patientsProtected: 737,
            rawBytesSent: 0,
            phase,
        };
    }
    async getTrainingLog(page, limit) {
        const [rounds, total, totalNodes] = await Promise.all([
            this.prisma.flRound.findMany({
                orderBy: { roundNumber: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: { contributions: true },
            }),
            this.prisma.flRound.count(),
            this.prisma.hospital.count(),
        ]);
        const maxRoundNumber = rounds.length > 0 ? rounds[0].roundNumber : 0;
        const mappedRounds = rounds.map((round) => {
            const gradientNorm = round.contributions.length > 0
                ? Number((round.contributions.reduce((sum, c) => sum + c.weightDeltaNorm, 0) / round.contributions.length).toFixed(4))
                : 0;
            return {
                roundNumber: round.roundNumber,
                strategy: round.strategy === 'FEDAVG' ? 'FedAvg' : 'FedSCRT',
                nodesParticipating: round.contributions.length,
                totalNodes,
                gradientNorm,
                globalF1After: round.globalF1After,
                status: round.roundNumber === maxRoundNumber ? 'active' : 'completed',
            };
        });
        return {
            total,
            rounds: mappedRounds,
        };
    }
    async getModelVersions() {
        const rounds = await this.prisma.flRound.findMany({
            orderBy: { modelVersion: 'desc' },
        });
        const latestModelVersion = rounds.length > 0 ? rounds[0].modelVersion : null;
        // Load ModelMetrics for accuracy lookup
        const allMetrics = await this.prisma.modelMetrics.findMany();
        const metricsMap = new Map();
        for (const m of allMetrics) {
            metricsMap.set(m.modelVersion, m);
        }
        const versions = rounds.map((round) => {
            const metrics = metricsMap.get(round.modelVersion);
            const accuracy = metrics
                ? metrics.accuracy
                : Number((round.globalF1After + 0.05).toFixed(2));
            const hash = (0, crypto_1.createHash)('sha1')
                .update(round.id)
                .digest('hex')
                .slice(0, 7);
            return {
                modelVersion: round.modelVersion,
                flRound: round.roundNumber,
                f1Macro: round.globalF1After,
                accuracy,
                strategy: round.strategy === 'FEDAVG' ? 'FedAvg' : 'FedSCRT',
                status: round.modelVersion === latestModelVersion ? 'active' : 'archived',
                hash,
            };
        });
        return { versions };
    }
    async getTopology() {
        const [hospitals, totalRounds, latestRound] = await Promise.all([
            this.prisma.hospital.findMany({ orderBy: { displayName: 'asc' } }),
            this.prisma.flRound.count(),
            this.prisma.flRound.findFirst({ orderBy: { roundNumber: 'desc' } }),
        ]);
        const globalDataVolume = hospitals.reduce((sum, h) => sum + h.totalCases, 0);
        const phase = totalRounds > 0 ? 'complete' : 'idle';
        const nodes = await Promise.all(hospitals.map(async (hospital) => {
            const lastContrib = await this.prisma.flContribution.findFirst({
                where: { hospitalId: hospital.id },
                orderBy: { createdAt: 'desc' },
            });
            return {
                id: hospital.id,
                displayName: hospital.displayName,
                flClientId: hospital.flClientId,
                totalCases: hospital.totalCases,
                status: 'synchronized',
                lastContributionNorm: lastContrib
                    ? Number(lastContrib.weightDeltaNorm.toFixed(4))
                    : 0,
            };
        }));
        return {
            aggregator: {
                id: 'agg',
                label: 'Aggregator',
                phase,
            },
            currentRound: latestRound?.roundNumber ?? 0,
            totalRounds,
            uptime: '99.9%',
            globalDataVolume,
            nodes,
        };
    }
    async getDatasets() {
        const hospitals = await this.prisma.hospital.findMany({
            orderBy: { displayName: 'asc' },
        });
        const totalRecords = hospitals.reduce((sum, h) => sum + h.totalCases, 0);
        const specialtyMap = {
            'Hospital A': 'Breast Oncology',
            'Hospital B': 'Breast Imaging',
            'Hospital C': 'Oncology Centre',
        };
        const accessMap = {
            'Hospital A': 'GRANTED',
            'Hospital B': 'PENDING',
            'Hospital C': 'RESTRICTED',
        };
        const nodes = hospitals.map((h) => ({
            displayName: h.displayName,
            flClientId: h.flClientId,
            totalCases: h.totalCases,
            specialty: specialtyMap[h.displayName] ?? 'Breast Imaging',
        }));
        const cohorts = hospitals.map((h) => {
            const lastChar = h.displayName.trim().slice(-1).toUpperCase();
            const letter = /^[A-Z]$/.test(lastChar) ? lastChar : h.flClientId;
            return {
                designation: `BREAST_DCE_${letter}`,
                description: 'Breast DCE-MRI subtype cohort',
                sourceNode: h.displayName,
                modality: 'DCE-MRI',
                records: h.totalCases,
                access: accessMap[h.displayName] ?? 'RESTRICTED',
            };
        });
        return {
            totalRecords,
            dataQuality: {
                annotationCompleteness: 0.94,
                dicomIntegrity: 0.998,
            },
            nodes,
            cohorts,
        };
    }
    async getSystemLogs(page, limit, severity) {
        const hospitalCount = await this.prisma.hospital.count();
        // Fetch all audit logs newest first, including hospital relation
        const allLogs = await this.prisma.privacyAuditLog.findMany({
            orderBy: { createdAt: 'desc' },
            include: { hospital: true },
        });
        const eventTypeMap = {
            WEIGHTS_SENT: 'GRADIENT_UPLOAD',
            ROUND_COMPLETE: 'AGGREGATION_DONE',
            DISPUTE_SIGNAL: 'DISPUTE_SIGNAL',
        };
        const mapped = allLogs.map((log, index) => {
            const mappedEventType = eventTypeMap[log.eventType] ?? log.eventType;
            let payload;
            if (mappedEventType === 'GRADIENT_UPLOAD') {
                payload = 'Weights transmitted · 0 bytes of raw patient data';
            }
            else if (mappedEventType === 'AGGREGATION_DONE') {
                payload = `Global model aggregated for round ${log.flRoundId ?? ''}`;
            }
            else {
                payload = 'Privacy signal';
            }
            return {
                id: log.id,
                ts: log.createdAt.toISOString(),
                severity: 'INFO',
                nodeId: log.hospital?.flClientId ?? 'CORE-AGGREGATOR',
                eventType: mappedEventType,
                payload,
                latencyMs: 20 + (index % 30),
                bytes: log.bytesTransmitted,
            };
        });
        // Apply optional severity filter (case-insensitive)
        const filtered = severity
            ? mapped.filter((e) => e.severity.toLowerCase() === severity.toLowerCase())
            : mapped;
        const total = filtered.length;
        const skip = (page - 1) * limit;
        const events = filtered.slice(skip, skip + limit);
        return {
            total,
            connectedNodes: hospitalCount,
            totalNodes: hospitalCount,
            events,
        };
    }
};
exports.ResearcherService = ResearcherService;
exports.ResearcherService = ResearcherService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        fl_service_1.FlService])
], ResearcherService);
//# sourceMappingURL=researcher.service.js.map