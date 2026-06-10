import { UsersService } from './users.service';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getMe(req: any): Promise<any>;
    updateMe(req: any, data: any): Promise<{
        id: string;
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.Role;
        hospitalId: string | null;
        onboardingDone: boolean;
    }>;
}
//# sourceMappingURL=users.controller.d.ts.map