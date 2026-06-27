"use strict";
/**
 * HTTP client for the Python WhisperX microservice.
 * Handles transcription + speaker diarization in one call.
 * Falls back to Groq Whisper if the WhisperX service is unavailable.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWhisperXAvailable = isWhisperXAvailable;
exports.transcribeWithDiarization = transcribeWithDiarization;
const env_1 = require("../config/env");
const groqTranscriber_1 = require("./groqTranscriber");
const fs_1 = __importDefault(require("fs"));
const form_data_1 = __importDefault(require("form-data"));
const SERVICE_URL = env_1.envConfig.whisperxServiceUrl;
const REQUEST_TIMEOUT_MS = 600000; // 10 min — diarization can be slow on CPU
/** Check if the WhisperX Python service is running */
async function isWhisperXAvailable() {
    if (!SERVICE_URL)
        return false;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${SERVICE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        return res.ok;
    }
    catch {
        return false;
    }
}
/** Transcribe audio using the WhisperX Python service */
async function transcribeWithWhisperX(audioPath) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        // Try the upload endpoint first (for cloud deployment like HF Spaces)
        const form = new form_data_1.default();
        form.append('audio_file', fs_1.default.createReadStream(audioPath));
        form.append('language', 'ar');
        const res = await fetch(`${SERVICE_URL}/transcribe-upload`, {
            method: 'POST',
            body: form,
            signal: controller.signal,
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`WhisperX service error (${res.status}): ${body}`);
        }
        const data = await res.json();
        console.log(`✅ WhisperX done: ${data.segments.length} segments, ${data.numSpeakers} speakers, ${data.words.length} words`);
        return data;
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Transcribe audio with speaker diarization.
 * Tries WhisperX first, falls back to Groq Whisper (no diarization) if unavailable.
 */
async function transcribeWithDiarization(audioPath, sessionId) {
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
        }
        catch (error) {
            console.warn(`⚠️ WhisperX failed, falling back to Groq: ${error instanceof Error ? error.message : error}`);
        }
    }
    else {
        console.log('⚠️ WhisperX service not available, using Groq Whisper (no diarization)');
    }
    // Fallback: Groq Whisper (no speaker diarization)
    const { text, words } = await (0, groqTranscriber_1.transcribeWithGroq)(audioPath, sessionId);
    const wordsWithSpeaker = words.map(w => ({ ...w, speaker: 'SPEAKER_00' }));
    // Build a single segment for the whole transcript
    const singleSegment = {
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
//# sourceMappingURL=whisperxClient.js.map