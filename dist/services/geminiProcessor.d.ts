import type { WhisperXSegment } from './whisperxClient';
export interface SummaryResult {
    title: string;
    summary: string;
    keyPoints: string[];
}
/**
 * Summarizes a transcript using Groq LLMs.
 * Tries each free model in order — if one is rate-limited, moves to the next.
 * Throws only if ALL models fail.
 */
export declare function summarizeWithGroq(transcript: string): Promise<SummaryResult>;
/**
 * Fixes misheard words and formats the transcript using Groq models.
 */
export declare function fixTranscript(transcript: string): Promise<string>;
/**
 * Fixes transcript with speaker diarization markers.
 * Sends segments with [SPEAKER_XX] markers to LLM, preserves markers in output.
 * Returns formatted transcript with speaker tags embedded.
 */
export declare function fixTranscriptWithSpeakers(segments: WhisperXSegment[]): Promise<string>;
//# sourceMappingURL=geminiProcessor.d.ts.map