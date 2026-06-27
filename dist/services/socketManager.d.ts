import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
/** Initialize Socket.IO server attached to the given HTTP server */
export declare function initSocketServer(httpServer: HttpServer): SocketIOServer;
/** Get the Socket.IO server instance */
export declare function getIO(): SocketIOServer | null;
/** Emit a progress event to a specific session room */
export declare function emitProgress(sessionId: string, event: string, data?: Record<string, any>): void;
/** Emit an error event to a specific session room */
export declare function emitError(sessionId: string, message: string, step?: string): void;
//# sourceMappingURL=socketManager.d.ts.map