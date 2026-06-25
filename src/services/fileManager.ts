import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { envConfig } from '../config/env';

/** Ensures the uploads directory exists */
export function ensureUploadDir(): void {
  if (!fs.existsSync(envConfig.uploadDir)) {
    fs.mkdirSync(envConfig.uploadDir, { recursive: true });
  }
}

/** Generates a unique temp file path with the given extension */
export function getTempFilePath(extension: string): string {
  const fileName = `${uuidv4()}${extension}`;
  return path.join(envConfig.uploadDir, fileName);
}

/** Safely deletes a file if it exists */
export function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`Failed to cleanup file: ${filePath}`, error);
  }
}

/** Detects file type based on extension */
export function getFileCategory(fileName: string): 'audio' | 'video' {
  const videoExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv'];
  const ext = path.extname(fileName).toLowerCase();
  return videoExtensions.includes(ext) ? 'video' : 'audio';
}

/** Gets the MIME type for audio files sent to Gemini */
export function getAudioMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp3': 'audio/mp3',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.wma': 'audio/x-ms-wma',
  };
  return mimeMap[ext] || 'audio/mp3';
}
