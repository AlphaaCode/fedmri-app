import { ModelService } from './model.service';
export declare class ModelController {
    private modelService;
    constructor(modelService: ModelService);
    history(): Promise<any>;
    perClass(): Promise<any>;
    confusion(): Promise<any>;
    comparison(): Promise<any>;
}
//# sourceMappingURL=model.controller.d.ts.map