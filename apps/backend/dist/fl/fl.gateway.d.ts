import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
export declare class FlGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private jwtService;
    server: Server;
    private logger;
    constructor(jwtService: JwtService);
    handleConnection(socket: Socket): Promise<void>;
    handleDisconnect(socket: Socket): void;
    emitRoundStarted(payload: {
        roundId: string;
        hospitalId: string;
        caseId: string;
    }): void;
    emitProgress(payload: {
        roundId: string;
        hospitalId: string;
        phase: string;
        epochsDone: number;
    }): void;
    emitRoundComplete(payload: {
        roundId: string;
        globalF1After: number;
        f1Delta: number;
        modelVersion: number;
    }): void;
    emitTestProgress(payload: {
        testId: string;
        strategy: string;
        round: number;
        f1: number;
        auc: number;
        accuracy: number;
        clientSizes: number[];
    }): void;
    emitTestComplete(payload: {
        testId: string;
        strategy: string;
        finalF1: number;
    }): void;
}
//# sourceMappingURL=fl.gateway.d.ts.map