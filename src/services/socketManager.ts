import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketIOServer | null = null;

/** Initialize Socket.IO server attached to the given HTTP server */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:4000'],
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    socket.on('join:session', (sessionId: string) => {
      if (sessionId) {
        socket.join(`session:${sessionId}`);
        console.log(`📡 Socket ${socket.id} joined session:${sessionId}`);
      }
    });

    socket.on('leave:session', (sessionId: string) => {
      if (sessionId) {
        socket.leave(`session:${sessionId}`);
        console.log(`📡 Socket ${socket.id} left session:${sessionId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

/** Get the Socket.IO server instance */
export function getIO(): SocketIOServer | null {
  return io;
}

/** Emit a progress event to a specific session room */
export function emitProgress(
  sessionId: string,
  event: string,
  data: Record<string, any> = {}
): void {
  if (!io) return;
  io.to(`session:${sessionId}`).emit(event, {
    sessionId,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/** Emit an error event to a specific session room */
export function emitError(
  sessionId: string,
  message: string,
  step?: string
): void {
  emitProgress(sessionId, 'error', { message, step });
}
