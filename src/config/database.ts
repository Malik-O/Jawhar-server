import mongoose from 'mongoose';
import { envConfig } from './env';

// Track connection state across serverless function invocations
let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected || mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  try {
    const db = await mongoose.connect(envConfig.mongodbUri, {
      serverSelectionTimeoutMS: 5000, // Fail fast if we can't connect
      socketTimeoutMS: 45000,
    });
    
    isConnected = db.connections[0].readyState === 1;
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
    throw error; // Throw error in serverless environment instead of exiting process
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected');
    isConnected = false;
  });
}
