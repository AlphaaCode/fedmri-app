import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    findById(id: string): Promise<{
        id: string;
        email: string;
        passwordHash: string;
        name: string;
        role: import(".prisma/client").$Enums.Role;
        hospitalId: string | null;
        onboardingDone: boolean;
        casesContributed: number;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    updateMe(id: string, data: any): Promise<{
        id: string;
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.Role;
        hospitalId: string | null;
        onboardingDone: boolean;
    }>;
}
//# sourceMappingURL=users.service.d.ts.map