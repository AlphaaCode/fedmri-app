import { FlService } from './fl.service';
export declare class FlPublicController {
    private flService;
    constructor(flService: FlService);
    listRounds(page?: string, limit?: string): Promise<{
        data: any[];
        total: number;
    }>;
    getRound(id: string): Promise<any>;
    hospitalContribution(user: any): Promise<any>;
    privacyLog(user: any): Promise<any[]>;
}
//# sourceMappingURL=fl-public.controller.d.ts.map