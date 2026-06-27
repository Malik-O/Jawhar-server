"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const upload_1 = require("./routes/upload");
const users_1 = require("./routes/users");
const sheikhs_1 = require("./routes/sheikhs");
const admin_1 = require("./routes/admin");
const courses_1 = require("./routes/courses");
const lectures_1 = require("./routes/lectures");
const progress_1 = require("./routes/progress");
const fileManager_1 = require("./services/fileManager");
const socketManager_1 = require("./services/socketManager");
async function bootstrap() {
    const app = (0, fastify_1.default)({
        logger: true,
        bodyLimit: 500 * 1024 * 1024, // 500MB body limit for large media
    });
    // Plugins
    await app.register(cors_1.default, {
        origin: ['http://localhost:3000', 'http://localhost:4000'],
        methods: ['GET', 'POST', 'DELETE', 'PATCH'],
    });
    await app.register(multipart_1.default, {
        limits: {
            fileSize: 500 * 1024 * 1024, // 500MB file limit
        },
    });
    // Routes
    await app.register(upload_1.uploadRoutes);
    await app.register(users_1.userRoutes);
    await app.register(sheikhs_1.sheikhRoutes);
    await app.register(admin_1.adminRoutes);
    await app.register(courses_1.courseRoutes);
    await app.register(lectures_1.lectureRoutes);
    await app.register(progress_1.progressRoutes);
    // Health check
    app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
    // Startup
    try {
        (0, fileManager_1.ensureUploadDir)();
        await (0, database_1.connectDatabase)();
        await app.listen({ port: env_1.envConfig.port, host: '0.0.0.0' });
        console.log(`🚀 Server running on http://localhost:${env_1.envConfig.port}`);
        // Initialize Socket.IO on the Fastify HTTP server
        const httpServer = app.server;
        (0, socketManager_1.initSocketServer)(httpServer);
        console.log(`🔌 Socket.IO server initialized`);
    }
    catch (error) {
        app.log.error(error);
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=index.js.map