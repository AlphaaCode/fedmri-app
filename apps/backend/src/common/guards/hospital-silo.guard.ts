import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class HospitalSiloGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const caseData = request.body || request.params;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.role === 'ADMIN') {
      return true;
    }

    if (user.role === 'DOCTOR') {
      if (caseData.hospitalId && caseData.hospitalId !== user.hospitalId) {
        throw new ForbiddenException('Cannot access cases from other hospitals');
      }
    }

    if (user.role === 'PATIENT') {
      if (caseData.userId && caseData.userId !== user.id) {
        throw new ForbiddenException('Cannot access other users\' cases');
      }
    }

    return true;
  }
}
