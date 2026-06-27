import mongoose, { Document, Types } from 'mongoose';
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
    words: {
        word: string;
        start: number;
        end: number;
        speaker?: string;
    }[];
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
export declare const Session: mongoose.Model<ISession, {}, {}, {}, mongoose.Document<unknown, {}, ISession, {}, {}> & ISession & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Session.d.ts.map