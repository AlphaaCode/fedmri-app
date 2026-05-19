import { UsersService } from './users.service';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getMe(req: any): Promise<any>;
    updateMe(req: any, data: any): Promise<{
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
//# sourceMappingURL=users.controller.d.ts.map