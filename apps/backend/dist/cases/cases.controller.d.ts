import { CasesService } from './cases.service';
export declare class CasesController {
    private casesService;
    constructor(casesService: CasesService);
    create(user: any, file: Express.Multer.File): Promise<any>;
    findAll(user: any, page?: number, limit?: number): Promise<{
        data: any[];
        total: number;
    }>;
    findOne(user: any, id: string): Promise<any>;
    getAttention(user: any, id: string): Promise<{
        attention: number[];
        size: number;
    }>;
}
//# sourceMappingURL=cases.controller.d.ts.map