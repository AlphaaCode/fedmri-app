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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InferenceService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const fs_1 = require("fs");
const path_1 = require("path");
const form_data_1 = __importDefault(require("form-data"));
const rxjs_1 = require("rxjs");
let InferenceService = class InferenceService {
    constructor(configService, httpService) {
        this.configService = configService;
        this.httpService = httpService;
        this.mlServiceUrl = this.configService.get('ML_SERVICE_URL', 'http://localhost:8001');
    }
    async getAttention(caseId) {
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.mlServiceUrl}/attention/${caseId}`));
        return {
            attention: response.data.attention,
            size: response.data.size,
        };
    }
    async verifyImage(buffer, filename) {
        const form = new form_data_1.default();
        form.append('file', buffer, { filename, contentType: 'image/jpeg' });
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.mlServiceUrl}/verify`, form, {
            headers: form.getHeaders(),
        }));
        return response.data;
    }
    async predict(filePath) {
        const fileStream = (0, fs_1.createReadStream)(filePath);
        const fileName = (0, path_1.basename)(filePath);
        const form = new form_data_1.default();
        form.append('file', fileStream, fileName);
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.mlServiceUrl}/predict`, form, {
            headers: form.getHeaders(),
        }));
        return {
            predicted_subtype: response.data.predicted_subtype,
            confidence: response.data.confidence,
            probs: response.data.probs,
            model_version: response.data.model_version,
            strategy: response.data.strategy,
        };
    }
};
exports.InferenceService = InferenceService;
exports.InferenceService = InferenceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService])
], InferenceService);
//# sourceMappingURL=inference.service.js.map