"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InferenceModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const inference_service_1 = require("./inference.service");
let InferenceModule = class InferenceModule {
};
exports.InferenceModule = InferenceModule;
exports.InferenceModule = InferenceModule = __decorate([
    (0, common_1.Module)({
        imports: [axios_1.HttpModule],
        providers: [inference_service_1.InferenceService],
        exports: [inference_service_1.InferenceService],
    })
], InferenceModule);
//# sourceMappingURL=inference.module.js.map