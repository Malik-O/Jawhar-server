"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeWithGroq = transcribeWithGroq;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const env_1 = require("../config/env");
const socketManager_1 = require("./socketManager");
// Point fluent-ffmpeg to the bundled binary
if (ffmpeg_static_1.default) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
}
const groq = new groq_sdk_1.default({ apiKey: env_1.envConfig.groqApiKey });
const MAX_FILE_SIZE = 24 * 1024 * 1024; // 24MB — Groq limit is 25MB
const MAX_CHUNK_DURATION = 300; // 5 minutes in seconds
/**
 * Gets audio duration in seconds using ffprobe.
 */
function getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
        fluent_ffmpeg_1.default.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(new Error(`Failed to get duration: ${err.message}`));
                return;
            }
            resolve(metadata.format.duration || 0);
        });
    });
}
/**
 * Transcribes an audio file using Groq's Whisper large-v3-turbo.
 * First splits by duration (>5 min), then by file size (>25MB) for each chunk.
 * Emits socket progress events if sessionId is provided.
 */
async function transcribeWithGroq(audioPath, sessionId) {
    // Step 1: Check duration — split if > 5 minutes
    let duration = 0;
    try {
        duration = await getAudioDuration(audioPath);
    }
    catch {
        // If we can't get duration, fall back to file-size-only chunking
    }
    if (duration > MAX_CHUNK_DURATION) {
        const chunkCount = Math.ceil(duration / MAX_CHUNK_DURATION);
        const chunkDuration = duration / chunkCount; // equal chunks
        console.log(`📦 Audio is ${Math.round(duration)}s, splitting into ${chunkCount} chunks of ${Math.round(chunkDuration)}s each`);
        return transcribeDurationChunked(audioPath, sessionId, chunkCount, chunkDuration);
    }
    // Step 2: Check file size — split if > 25MB
    const fileSize = fs_1.default.statSync(audioPath).size;
    if (fileSize > MAX_FILE_SIZE) {
        return transcribeFileSizeChunked(audioPath, sessionId);
    }
    // No chunking needed — single transcription
    if (sessionId) {
        (0, socketManager_1.emitProgress)(sessionId, 'transcribing_chunk', {
            chunk: 1, total: 1, progress: 25,
        });
    }
    return transcribeSingle(audioPath, 0);
}
/** Transcribes a single audio file (< 25MB) */
async function transcribeSingle(audioPath, timeOffset = 0) {
    console.log('🎤 Transcribing with Groq Whisper large-v3-turbo...');
    const transcription = await groq.audio.transcriptions.create({
        file: fs_1.default.createReadStream(audioPath),
        model: 'whisper-large-v3-turbo',
        language: 'ar',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
        temperature: 0,
    });
    console.log('✅ Groq transcription complete');
    const words = transcription.words || [];
    const offsetWords = words.map((w) => ({
        word: w.word,
        start: w.start + timeOffset,
        end: w.end + timeOffset,
    }));
    let text = transcription.text || '';
    if (words.length > 0) {
        const textWordCount = text.trim().split(/\s+/).filter(Boolean).length;
        if (!text || textWordCount < words.length * 0.5) {
            console.warn('⚠️ Transcript text appears to be missing spaces, reconstructing from words array');
            text = words.map((w) => w.word).join(' ');
        }
    }
    return { text, words: offsetWords };
}
/**
 * Splits audio by duration into N equal chunks and transcribes each.
 * Emits socket progress for each chunk.
 */
async function transcribeDurationChunked(audioPath, sessionId, chunkCount, chunkDuration) {
    const chunkDir = path_1.default.join(env_1.envConfig.uploadDir, 'chunks');
    if (!fs_1.default.existsSync(chunkDir)) {
        fs_1.default.mkdirSync(chunkDir, { recursive: true });
    }
    const chunkPattern = path_1.default.join(chunkDir, 'chunk_%03d.mp3');
    // Split audio into equal-duration chunks
    await new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(audioPath)
            .outputOptions([
            '-f', 'segment',
            '-segment_time', String(Math.ceil(chunkDuration)),
            '-c:a', 'libmp3lame',
            '-b:a', '64k',
            '-ac', '1',
            '-ar', '16000',
        ])
            .output(chunkPattern)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
    });
    // Find all chunk files
    const chunkFiles = fs_1.default.readdirSync(chunkDir)
        .filter((f) => f.startsWith('chunk_') && f.endsWith('.mp3'))
        .sort()
        .map((f) => path_1.default.join(chunkDir, f));
    console.log(`📦 Split into ${chunkFiles.length} chunks`);
    const transcripts = [];
    let allWords = [];
    for (let i = 0; i < chunkFiles.length; i++) {
        const chunkFile = chunkFiles[i];
        const chunkFileSize = fs_1.default.statSync(chunkFile).size;
        if (sessionId) {
            const progress = 25 + Math.round((i / chunkFiles.length) * 40); // 25-65% range
            (0, socketManager_1.emitProgress)(sessionId, 'transcribing_chunk', {
                chunk: i + 1,
                total: chunkFiles.length,
                progress,
            });
        }
        // If a duration-chunk is still >25MB, sub-split it by file size
        if (chunkFileSize > MAX_FILE_SIZE) {
            console.log(`📦 Chunk ${i + 1} is too large (${(chunkFileSize / 1024 / 1024).toFixed(1)}MB), sub-splitting...`);
            const subResults = await transcribeFileSizeChunked(chunkFile, undefined);
            // Adjust word timestamps by the chunk's time offset
            const offsetWords = subResults.words.map(w => ({
                ...w,
                start: w.start + i * chunkDuration,
                end: w.end + i * chunkDuration,
            }));
            transcripts.push(subResults.text);
            allWords = allWords.concat(offsetWords);
        }
        else {
            console.log(`🎤 Transcribing chunk ${i + 1}/${chunkFiles.length}...`);
            const result = await transcribeSingle(chunkFile, i * chunkDuration);
            transcripts.push(result.text);
            allWords = allWords.concat(result.words);
        }
    }
    // Cleanup chunk files
    chunkFiles.forEach((f) => {
        try {
            fs_1.default.unlinkSync(f);
        }
        catch { /* ignore */ }
    });
    try {
        fs_1.default.rmdirSync(chunkDir);
    }
    catch { /* ignore */ }
    return { text: transcripts.join(' '), words: allWords };
}
/**
 * Splits large files into chunks by 10-minute segments and transcribes each.
 * Used when file size > 25MB but duration ≤ 5 minutes (rare edge case).
 */
async function transcribeFileSizeChunked(audioPath, sessionId) {
    console.log('📦 File too large, splitting by file size...');
    const chunkSegmentDuration = 600; // 10 minutes per chunk
    const chunkDir = path_1.default.join(env_1.envConfig.uploadDir, 'chunks');
    if (!fs_1.default.existsSync(chunkDir)) {
        fs_1.default.mkdirSync(chunkDir, { recursive: true });
    }
    const chunkPattern = path_1.default.join(chunkDir, 'chunk_%03d.mp3');
    await new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(audioPath)
            .outputOptions([
            '-f', 'segment',
            '-segment_time', String(chunkSegmentDuration),
            '-c:a', 'libmp3lame',
            '-b:a', '64k',
            '-ac', '1',
            '-ar', '16000',
        ])
            .output(chunkPattern)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
    });
    const chunkFiles = fs_1.default.readdirSync(chunkDir)
        .filter((f) => f.startsWith('chunk_') && f.endsWith('.mp3'))
        .sort()
        .map((f) => path_1.default.join(chunkDir, f));
    console.log(`📦 Split into ${chunkFiles.length} chunks`);
    const transcripts = [];
    let allWords = [];
    for (let i = 0; i < chunkFiles.length; i++) {
        if (sessionId) {
            const progress = 25 + Math.round((i / chunkFiles.length) * 40);
            (0, socketManager_1.emitProgress)(sessionId, 'transcribing_chunk', {
                chunk: i + 1,
                total: chunkFiles.length,
                progress,
            });
        }
        console.log(`🎤 Transcribing chunk ${i + 1}/${chunkFiles.length}...`);
        const result = await transcribeSingle(chunkFiles[i], i * chunkSegmentDuration);
        transcripts.push(result.text);
        allWords = allWords.concat(result.words);
    }
    // Cleanup chunk files
    chunkFiles.forEach((f) => {
        try {
            fs_1.default.unlinkSync(f);
        }
        catch { /* ignore */ }
    });
    try {
        fs_1.default.rmdirSync(chunkDir);
    }
    catch { /* ignore */ }
    return { text: transcripts.join(' '), words: allWords };
}
//# sourceMappingURL=groqTranscriber.js.map