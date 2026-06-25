import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { getTempFilePath, getFileCategory } from './fileManager';

// Point fluent-ffmpeg to the bundled binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

interface ExtractionResult {
  audioPath: string;
  needsCleanup: boolean;
}

/**
 * Extracts audio from a video file, or returns the path as-is for audio files.
 * Uses ffmpeg-static so no manual FFmpeg install is needed.
 */
export async function extractAudio(
  inputPath: string,
  originalFileName: string
): Promise<ExtractionResult> {
  const category = getFileCategory(originalFileName);

  if (category === 'audio') {
    return { audioPath: inputPath, needsCleanup: false };
  }

  const outputPath = getTempFilePath('.mp3');

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(1)
      .audioFrequency(16000)
      .on('start', (cmd) => {
        console.log(`🎬 Extracting audio: ${cmd}`);
      })
      .on('end', () => {
        console.log('✅ Audio extraction complete');
        resolve({ audioPath: outputPath, needsCleanup: true });
      })
      .on('error', (err) => {
        console.error('❌ FFmpeg error:', err.message);
        reject(new Error(`Audio extraction failed: ${err.message}`));
      })
      .save(outputPath);
  });
}

/**
 * Gets audio duration in seconds using ffprobe.
 */
export function getAudioDuration(filePath: string): Promise<number> {
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
