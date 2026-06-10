import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async updateMe(id: string, data: any) {
    // Whitelist: profile fields a user may set on themselves — never role,
    // passwordHash, hospitalId, etc. (mass-assignment guard).
    const updatable: Record<string, any> = {};
    if (typeof data?.name === 'string') updatable.name = data.name;
    if (typeof data?.onboardingDone === 'boolean') updatable.onboardingDone = data.onboardingDone;

    return this.prisma.user.update({
      where: { id },
      data: updatable,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        hospitalId: true,
        onboardingDone: true,
      },
    });
  }
}
