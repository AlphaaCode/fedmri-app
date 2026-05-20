"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    // CORS — allow web (localhost:3000) and any origin for mobile/Expo dev
    // (RN/Expo doesn't send an Origin header, so this is effectively web-only)
    app.enableCors({
        origin: process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
            : ['http://localhost:3000', /\.expo\.dev$/, /^http:\/\/10\.0\.2\.2/],
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    const port = process.env.PORT || 3001;
    await app.listen(port);
    console.log(`FedMRI backend listening on port ${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map