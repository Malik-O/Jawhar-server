import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { envConfig } from './config/env';
import { connectDatabase } from './config/database';
import { uploadRoutes } from './routes/upload';
import { userRoutes } from './routes/users';
import { sheikhRoutes } from './routes/sheikhs';
import { adminRoutes } from './routes/admin';
import { courseRoutes } from './routes/courses';
import { lectureRoutes } from './routes/lectures';
import { progressRoutes } from './routes/progress';
import { ensureUploadDir } from './services/fileManager';
import { initSocketServer } from './services/socketManager';

const app = Fastify({
  logger: true,
  bodyLimit: 500 * 1024 * 1024, // 500MB body limit for large media
});

async function setup(): Promise<void> {
  // Plugins
  await app.register(cors, {
    origin: envConfig.frontendUrl,
    methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  });

  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB file limit
    },
  });

  // Routes
  await app.register(uploadRoutes);
  await app.register(userRoutes);
  await app.register(sheikhRoutes);
  await app.register(adminRoutes);
  await app.register(courseRoutes);
  await app.register(lectureRoutes);
  await app.register(progressRoutes);

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
}

const setupPromise = setup();

if (!process.env.VERCEL) {
  // Startup locally
  setupPromise.then(async () => {
    try {
      ensureUploadDir();
      await connectDatabase();
      await app.listen({ port: envConfig.port, host: '0.0.0.0' });
      console.log(`🚀 Server running on http://localhost:${envConfig.port}`);

      // Initialize Socket.IO on the Fastify HTTP server
      const httpServer = app.server;
      initSocketServer(httpServer);
      console.log(`🔌 Socket.IO server initialized`);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  });
}

// Vercel Serverless Function entry point
export default async function handler(req: any, res: any) {
  ensureUploadDir();
  await connectDatabase();
  await setupPromise;
  await app.ready();
  app.server.emit('request', req, res);
}
