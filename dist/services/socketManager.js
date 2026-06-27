"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
exports.getIO = getIO;
exports.emitProgress = emitProgress;
exports.emitError = emitError;
const socket_io_1 = require("socket.io");
let io = null;
/** Initialize Socket.IO server attached to the given HTTP server */
function initSocketServer(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: ['http://localhost:3000', 'http://localhost:4000'],
            methods: ['GET', 'POST'],
        },
    });
    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: ${socket.id}`);
        socket.on('join:session', (sessionId) => {
            if (sessionId) {
                socket.join(`session:${sessionId}`);
                console.log(`📡 Socket ${socket.id} joined session:${sessionId}`);
            }
        });
        socket.on('leave:session', (sessionId) => {
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
function getIO() {
    return io;
}
/** Emit a progress event to a specific session room */
function emitProgress(sessionId, event, data = {}) {
    if (!io)
        return;
    io.to(`session:${sessionId}`).emit(event, {
        sessionId,
        ...data,
        timestamp: new Date().toISOString(),
    });
}
/** Emit an error event to a specific session room */
function emitError(sessionId, message, step) {
    emitProgress(sessionId, 'error', { message, step });
}
//# sourceMappingURL=socketManager.js.map