interface ExtractionResult {
    audioPath: string;
    needsCleanup: boolean;
}
/**
 * Extracts audio from a video file, or returns the path as-is for audio files.
 * Uses ffmpeg-static so no manual FFmpeg install is needed.
 */
export declare function extractAudio(inputPath: string, originalFileName: string): Promise<ExtractionResult>;
/**
 * Gets audio duration in seconds using ffprobe.
 */
export declare function getAudioDuration(filePath: string): Promise<number>;
export {};
//# sourceMappingURL=audioExtractor.d.ts.map