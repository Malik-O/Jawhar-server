import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { envConfig } from '../config/env';

const groq = new Groq({ apiKey: envConfig.groqApiKey });

const MAX_FILE_SIZE = 24 * 1024 * 1024; // 24MB — Groq limit is 25MB

export interface TranscribeResult {
  text: string;
  words: { word: string; start: number; end: number }[];
}

/**
 * Transcribes an audio file using Groq's Whisper large-v3-turbo.
 * Handles files > 25MB by splitting them into chunks via FFmpeg.
 */
export async function transcribeWithGroq(audioPath: string): Promise<TranscribeResult> {
  const fileSize = fs.statSync(audioPath).size;

  if (fileSize > MAX_FILE_SIZE) {
    return transcribeChunked(audioPath);
  }

  return transcribeSingle(audioPath);
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
 * Splits large files into chunks and transcribes each.
 * Uses FFmpeg to split by duration to stay under 25MB.
 */
async function transcribeChunked(audioPath: string): Promise<TranscribeResult> {
  console.log('📦 File too large, splitting into chunks...');

  const ffmpeg = await import('fluent-ffmpeg');
  const ffmpegStatic = await import('ffmpeg-static');

  if (ffmpegStatic.default) {
    ffmpeg.default.setFfmpegPath(ffmpegStatic.default as string);
  }

  const chunkDuration = 600; // 10 minutes per chunk
  const chunkDir = path.join(envConfig.uploadDir, 'chunks');

  if (!fs.existsSync(chunkDir)) {
    fs.mkdirSync(chunkDir, { recursive: true });
  }

  const chunkPattern = path.join(chunkDir, 'chunk_%03d.mp3');

  // Split audio into chunks
  await new Promise<void>((resolve, reject) => {
    ffmpeg.default(audioPath)
      .outputOptions([
        '-f', 'segment',
        '-segment_time', String(chunkDuration),
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

  // Transcribe each chunk sequentially
  const transcripts: string[] = [];
  let allWords: { word: string; start: number; end: number }[] = [];

  for (let i = 0; i < chunkFiles.length; i++) {
    console.log(`🎤 Transcribing chunk ${i + 1}/${chunkFiles.length}...`);
    const result = await transcribeSingle(chunkFiles[i], i * chunkDuration);
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
