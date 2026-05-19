"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HospitalSiloGuard = void 0;
const common_1 = require("@nestjs/common");
let HospitalSiloGuard = class HospitalSiloGuard {
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const caseData = request.body || request.params;
        if (!user) {
            throw new common_1.ForbiddenException('User not authenticated');
        }
        if (user.role === 'ADMIN') {
            return true;
        }
        if (user.role === 'DOCTOR') {
            if (caseData.hospitalId && caseData.hospitalId !== user.hospitalId) {
                throw new common_1.ForbiddenException('Cannot access cases from other hospitals');
            }
        }
        if (user.role === 'PATIENT') {
            if (caseData.userId && caseData.userId !== user.id) {
                throw new common_1.ForbiddenException('Cannot access other users\' cases');
            }
        }
        return true;
    }
};
exports.HospitalSiloGuard = HospitalSiloGuard;
exports.HospitalSiloGuard = HospitalSiloGuard = __decorate([
    (0, common_1.Injectable)()
], HospitalSiloGuard);
//# sourceMappingURL=hospital-silo.guard.js.map