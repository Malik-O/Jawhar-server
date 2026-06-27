export interface TranscribeResult {
    text: string;
    words: {
        word: string;
        start: number;
        end: number;
    }[];
}
/**
 * Transcribes an audio file using Groq's Whisper large-v3-turbo.
 * First splits by duration (>5 min), then by file size (>25MB) for each chunk.
 * Emits socket progress events if sessionId is provided.
 */
export declare function transcribeWithGroq(audioPath: string, sessionId?: string): Promise<TranscribeResult>;
//# sourceMappingURL=groqTranscriber.d.ts.map