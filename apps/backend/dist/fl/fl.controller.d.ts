import { ConfigService } from '@nestjs/config';
import { FlService } from './fl.service';
export declare class FlController {
    private flService;
    private configService;
    constructor(flService: FlService, configService: ConfigService);
    private verifySecret;
    progress(body: any, secret: string): Promise<{
        status: string;
    }>;
    roundComplete(body: any, secret: string): Promise<{
        status: string;
    }>;
}
//# sourceMappingURL=fl.controller.d.ts.map