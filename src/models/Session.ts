import mongoose, { Schema, Document, Types } from 'mongoose';

export type SessionStatus = 'uploaded' | 'extracted' | 'transcribed' | 'enriched' | 'summarized' | 'failed';

export interface QuranVerse {
  ref: string;
  surah: number;
  ayah: number;
  surahName: string;
  uthmani: string;
  transcriptText: string;
}

export interface SpeakerSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface ISession extends Document {
  originalFileName: string;
  fileType: 'audio' | 'video';
  status: SessionStatus;
  failedAt: string;
  tempFilePath: string;
  audioPath: string;
  title: string;
  transcript: string;
  rawTranscript: string;
  words: { word: string; start: number; end: number; speaker: string }[];
  speakerSegments: SpeakerSegment[];
  duration: number;
  summary: string;
  keyPoints: string[];
  quranVerses: QuranVerse[];
  archived: boolean;
  sheikhId: string;
  lectureId: Types.ObjectId | null;
  createdAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    originalFileName: { type: String, required: true },
    fileType: { type: String, enum: ['audio', 'video'], required: true },
    status: { type: String, enum: ['uploaded', 'extracted', 'transcribed', 'enriched', 'summarized', 'failed'], default: 'uploaded' },
    failedAt: { type: String, default: '' },
    tempFilePath: { type: String, default: '' },
    audioPath: { type: String, default: '' },
    title: { type: String, default: '' },
    transcript: { type: String, default: '' },
    rawTranscript: { type: String, default: '' },
    words: [{ word: String, start: Number, end: Number, speaker: String }],
    speakerSegments: [{
      speaker: String,
      start: Number,
      end: Number,
      text: String,
    }],
    duration: { type: Number, default: 0 },
    summary: { type: String, default: '' },
    keyPoints: { type: [String], default: [] },
    quranVerses: [{
      ref: String,
      surah: Number,
      ayah: Number,
      surahName: String,
      uthmani: String,
      transcriptText: String,
    }],
    archived: { type: Boolean, default: false },
    sheikhId: { type: String, default: '', index: true },
    lectureId: { type: Schema.Types.ObjectId, ref: 'Lecture', default: null },
  },
  {
    timestamps: true,
  }
);

export const Session = mongoose.model<ISession>('Session', sessionSchema);
