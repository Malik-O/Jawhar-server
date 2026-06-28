import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface EnvConfig {
  groqApiKey: string;
  mongodbUri: string;
  port: number;
  uploadDir: string;
  whisperxServiceUrl: string;
  clerkSecretKey: string;
  clerkSuperAdminId: string;
  frontendUrl: string[];
}

function loadEnvConfig(): EnvConfig {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY is required. Get a free key at https://console.groq.com');
  }

  const frontendUrlString = process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:4000';
  const frontendUrl = frontendUrlString.split(',').map(url => url.trim());

  return {
    groqApiKey,
    mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lecture-tool',
    port: parseInt(process.env.PORT || '4000', 10),
    uploadDir: process.env.VERCEL ? '/tmp/uploads' : path.resolve(__dirname, '../../uploads'),
    whisperxServiceUrl: process.env.WHISPERX_SERVICE_URL || 'http://127.0.0.1:5001',
    clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
    clerkSuperAdminId: process.env.CLERK_SUPER_ADMIN_ID || '',
    frontendUrl,
  };
}

export const envConfig = loadEnvConfig();
