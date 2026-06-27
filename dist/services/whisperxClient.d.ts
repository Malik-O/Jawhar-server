/**
 * HTTP client for the Python WhisperX microservice.
 * Handles transcription + speaker diarization in one call.
 * Falls back to Groq Whisper if the WhisperX service is unavailable.
 */
export interface WhisperXWord {
    word: string;
    start: number;
    end: number;
    speaker: string;
}
export interface WhisperXSegment {
    speaker: string;
    start: number;
    end: number;
    text: string;
    words: WhisperXWord[];
}
export interface WhisperXResult {
    segments: WhisperXSegment[];
    words: WhisperXWord[];
    text: string;
    language: string;
    numSpeakers: number;
}
/** Check if the WhisperX Python service is running */
export declare function isWhisperXAvailable(): Promise<boolean>;
/**
 * Transcribe audio with speaker diarization.
 * Tries WhisperX first, falls back to Groq Whisper (no diarization) if unavailable.
 */
export declare function transcribeWithDiarization(audioPath: string, sessionId?: string): Promise<{
    text: string;
    words: {
        word: string;
        start: number;
        end: number;
        speaker: string;
    }[];
    speakerSegments: WhisperXSegment[];
    usedDiarization: boolean;
}>;
//# sourceMappingURL=whisperxClient.d.ts.map