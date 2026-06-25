import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { envConfig } from './config/env';
import { connectDatabase } from './config/database';
import { uploadRoutes } from './routes/upload';
import { ensureUploadDir } from './services/fileManager';

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: true,
    bodyLimit: 500 * 1024 * 1024, // 500MB body limit for large media
  });

  // Plugins
  await app.register(cors, {
    origin: ['http://localhost:3000', 'http://localhost:4000'],
    methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  });

  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB file limit
    },
  });

  // Routes
  await app.register(uploadRoutes);

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Startup
  try {
    ensureUploadDir();
    await connectDatabase();
    await app.listen({ port: envConfig.port, host: '0.0.0.0' });
    console.log(`🚀 Server running on http://localhost:${envConfig.port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

bootstrap();
