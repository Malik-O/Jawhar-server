/**
 * HTTP client for the Python WhisperX microservice.
 * Handles transcription + speaker diarization in one call.
 * Falls back to Groq Whisper if the WhisperX service is unavailable.
 */

import { envConfig } from '../config/env';
import { transcribeWithGroq, TranscribeResult } from './groqTranscriber';

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

const SERVICE_URL = envConfig.whisperxServiceUrl;
const REQUEST_TIMEOUT_MS = 600_000; // 10 min — diarization can be slow on CPU

/** Check if the WhisperX Python service is running */
export async function isWhisperXAvailable(): Promise<boolean> {
  if (!SERVICE_URL) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** Transcribe audio using the WhisperX Python service */
async function transcribeWithWhisperX(audioPath: string): Promise<WhisperXResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${SERVICE_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_path: audioPath, language: 'ar' }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WhisperX service error (${res.status}): ${body}`);
    }

    const data = await res.json() as WhisperXResult;
    console.log(`✅ WhisperX done: ${data.segments.length} segments, ${data.numSpeakers} speakers, ${data.words.length} words`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Transcribe audio with speaker diarization.
 * Tries WhisperX first, falls back to Groq Whisper (no diarization) if unavailable.
 */
export async function transcribeWithDiarization(
  audioPath: string,
  sessionId?: string
): Promise<{
  text: string;
  words: { word: string; start: number; end: number; speaker: string }[];
  speakerSegments: WhisperXSegment[];
  usedDiarization: boolean;
}> {
  const available = await isWhisperXAvailable();

  if (available) {
    console.log('🎙️ Using WhisperX for transcription + diarization');
    try {
      const result = await transcribeWithWhisperX(audioPath);
      return {
        text: result.text,
        words: result.words,
        speakerSegments: result.segments,
        usedDiarization: true,
      };
    } catch (error) {
      console.warn(`⚠️ WhisperX failed, falling back to Groq: ${error instanceof Error ? error.message : error}`);
    }
  } else {
    console.log('⚠️ WhisperX service not available, using Groq Whisper (no diarization)');
  }

  // Fallback: Groq Whisper (no speaker diarization)
  const { text, words } = await transcribeWithGroq(audioPath, sessionId);
  const wordsWithSpeaker = words.map(w => ({ ...w, speaker: 'SPEAKER_00' }));

  // Build a single segment for the whole transcript
  const singleSegment: WhisperXSegment = {
    speaker: 'SPEAKER_00',
    start: words[0]?.start ?? 0,
    end: words[words.length - 1]?.end ?? 0,
    text,
    words: wordsWithSpeaker,
  };

  return {
    text,
    words: wordsWithSpeaker,
    speakerSegments: [singleSegment],
    usedDiarization: false,
  };
}
