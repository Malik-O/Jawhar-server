/** Ensures the uploads directory exists */
export declare function ensureUploadDir(): void;
/** Generates a unique temp file path with the given extension */
export declare function getTempFilePath(extension: string): string;
/** Safely deletes a file if it exists */
export declare function cleanupFile(filePath: string): void;
/** Detects file type based on extension */
export declare function getFileCategory(fileName: string): 'audio' | 'video';
/** Gets the MIME type for audio files sent to Gemini */
export declare function getAudioMimeType(filePath: string): string;
//# sourceMappingURL=fileManager.d.ts.map