import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { envConfig } from '../config/env';
import { emitProgress } from './socketManager';

// Point fluent-ffmpeg to the bundled binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const groq = new Groq({ apiKey: envConfig.groqApiKey });

const MAX_FILE_SIZE = 24 * 1024 * 1024; // 24MB — Groq limit is 25MB
const MAX_CHUNK_DURATION = 300; // 5 minutes in seconds

export interface TranscribeResult {
  text: string;
  words: { word: string; start: number; end: number }[];
}

/**
 * Gets audio duration in seconds using ffprobe.
 */
function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
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
export async function transcribeWithGroq(
  audioPath: string,
  sessionId?: string
): Promise<TranscribeResult> {
  // Step 1: Check duration — split if > 5 minutes
  let duration = 0;
  try {
    duration = await getAudioDuration(audioPath);
  } catch {
    // If we can't get duration, fall back to file-size-only chunking
  }

  if (duration > MAX_CHUNK_DURATION) {
    const chunkCount = Math.ceil(duration / MAX_CHUNK_DURATION);
    const chunkDuration = duration / chunkCount; // equal chunks
    console.log(`📦 Audio is ${Math.round(duration)}s, splitting into ${chunkCount} chunks of ${Math.round(chunkDuration)}s each`);
    return transcribeDurationChunked(audioPath, sessionId, chunkCount, chunkDuration);
  }

  // Step 2: Check file size — split if > 25MB
  const fileSize = fs.statSync(audioPath).size;
  if (fileSize > MAX_FILE_SIZE) {
    return transcribeFileSizeChunked(audioPath, sessionId);
  }

  // No chunking needed — single transcription
  if (sessionId) {
    emitProgress(sessionId, 'transcribing_chunk', {
      chunk: 1, total: 1, progress: 25,
    });
  }
  return transcribeSingle(audioPath, 0);
}

/** Transcribes a single audio file (< 25MB) */
async function transcribeSingle(audioPath: string, timeOffset: number = 0): Promise<TranscribeResult> {
  console.log('🎤 Transcribing with Groq Whisper large-v3-turbo...');

  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-large-v3-turbo',
    language: 'ar',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
    temperature: 0,
  });

  console.log('✅ Groq transcription complete');

  const words = (transcription as any).words || [];
  const offsetWords = words.map((w: any) => ({
    word: w.word,
    start: w.start + timeOffset,
    end: w.end + timeOffset,
  }));

  let text = transcription.text || '';
  if (words.length > 0) {
    const textWordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (!text || textWordCount < words.length * 0.5) {
      console.warn('⚠️ Transcript text appears to be missing spaces, reconstructing from words array');
      text = words.map((w: any) => w.word).join(' ');
    }
  }

  return { text, words: offsetWords };
}

/**
 * Splits audio by duration into N equal chunks and transcribes each.
 * Emits socket progress for each chunk.
 */
async function transcribeDurationChunked(
  audioPath: string,
  sessionId: string | undefined,
  chunkCount: number,
  chunkDuration: number
): Promise<TranscribeResult> {
  const chunkDir = path.join(envConfig.uploadDir, 'chunks');
  if (!fs.existsSync(chunkDir)) {
    fs.mkdirSync(chunkDir, { recursive: true });
  }

  const chunkPattern = path.join(chunkDir, 'chunk_%03d.mp3');

  // Split audio into equal-duration chunks
  await new Promise<void>((resolve, reject) => {
    ffmpeg(audioPath)
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
      .on('error', (err: Error) => reject(err))
      .run();
  });

  // Find all chunk files
  const chunkFiles = fs.readdirSync(chunkDir)
    .filter((f) => f.startsWith('chunk_') && f.endsWith('.mp3'))
    .sort()
    .map((f) => path.join(chunkDir, f));

  console.log(`📦 Split into ${chunkFiles.length} chunks`);

  const transcripts: string[] = [];
  let allWords: { word: string; start: number; end: number }[] = [];

  for (let i = 0; i < chunkFiles.length; i++) {
    const chunkFile = chunkFiles[i];
    const chunkFileSize = fs.statSync(chunkFile).size;

    if (sessionId) {
      const progress = 25 + Math.round((i / chunkFiles.length) * 40); // 25-65% range
      emitProgress(sessionId, 'transcribing_chunk', {
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
    } else {
      console.log(`🎤 Transcribing chunk ${i + 1}/${chunkFiles.length}...`);
      const result = await transcribeSingle(chunkFile, i * chunkDuration);
      transcripts.push(result.text);
      allWords = allWords.concat(result.words);
    }
  }

  // Cleanup chunk files
  chunkFiles.forEach((f) => {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  });
  try { fs.rmdirSync(chunkDir); } catch { /* ignore */ }

  return { text: transcripts.join(' '), words: allWords };
}

/**
 * Splits large files into chunks by 10-minute segments and transcribes each.
 * Used when file size > 25MB but duration ≤ 5 minutes (rare edge case).
 */
async function transcribeFileSizeChunked(
  audioPath: string,
  sessionId: string | undefined
): Promise<TranscribeResult> {
  console.log('📦 File too large, splitting by file size...');

  const chunkSegmentDuration = 600; // 10 minutes per chunk
  const chunkDir = path.join(envConfig.uploadDir, 'chunks');

  if (!fs.existsSync(chunkDir)) {
    fs.mkdirSync(chunkDir, { recursive: true });
  }

  const chunkPattern = path.join(chunkDir, 'chunk_%03d.mp3');

  await new Promise<void>((resolve, reject) => {
    ffmpeg(audioPath)
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
      .on('error', (err: Error) => reject(err))
      .run();
  });

  const chunkFiles = fs.readdirSync(chunkDir)
    .filter((f) => f.startsWith('chunk_') && f.endsWith('.mp3'))
    .sort()
    .map((f) => path.join(chunkDir, f));

  console.log(`📦 Split into ${chunkFiles.length} chunks`);

  const transcripts: string[] = [];
  let allWords: { word: string; start: number; end: number }[] = [];

  for (let i = 0; i < chunkFiles.length; i++) {
    if (sessionId) {
      const progress = 25 + Math.round((i / chunkFiles.length) * 40);
      emitProgress(sessionId, 'transcribing_chunk', {
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
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  });
  try { fs.rmdirSync(chunkDir); } catch { /* ignore */ }

  return { text: transcripts.join(' '), words: allWords };
}
