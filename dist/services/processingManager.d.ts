/** Check if a session's processing was cancelled */
export declare function isCancelled(sessionId: string): boolean;
/** Cancel an active processing job */
export declare function cancelProcessing(sessionId: string): boolean;
/** Check if a session is currently being processed */
export declare function isProcessing(sessionId: string): boolean;
/**
 * Runs the full processing pipeline for a session in the background.
 * Determines the starting point based on current session status.
 * Emits Socket.IO progress events at each step.
 * Respects cancellation requests between steps.
 */
export declare function runPipeline(sessionId: string): Promise<void>;
//# sourceMappingURL=processingManager.d.ts.map