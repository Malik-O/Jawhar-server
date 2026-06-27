"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.envConfig = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
function loadEnvConfig() {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
        throw new Error('GROQ_API_KEY is required. Get a free key at https://console.groq.com');
    }
    return {
        groqApiKey,
        mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lecture-tool',
        port: parseInt(process.env.PORT || '4000', 10),
        uploadDir: path_1.default.resolve(__dirname, '../../uploads'),
        whisperxServiceUrl: process.env.WHISPERX_SERVICE_URL || 'http://127.0.0.1:5001',
        clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
        clerkSuperAdminId: process.env.CLERK_SUPER_ADMIN_ID || '',
    };
}
exports.envConfig = loadEnvConfig();
//# sourceMappingURL=env.js.map