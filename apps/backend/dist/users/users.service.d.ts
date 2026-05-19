import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    findById(id: string): Promise<{
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.Role;
        hospitalId: string | null;
        id: string;
        passwordHash: string;
        onboardingDone: boolean;
        casesContributed: number;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    updateMe(id: string, data: any): Promise<{
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.Role;
        hospitalId: string | null;
        id: string;
        passwordHash: string;
        onboardingDone: boolean;
        casesContributed: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
//# sourceMappingURL=users.service.d.ts.map