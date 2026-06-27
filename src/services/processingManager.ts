import { Session } from '../models/Session';
import { extractAudio, getAudioDuration } from './audioExtractor';
import { transcribeWithGroq } from './groqTranscriber';
import { summarizeWithGroq, fixTranscript } from './geminiProcessor';
import { enrichQuranTags } from './quranService';
import { emitProgress, emitError } from './socketManager';

// In-memory tracking of active processing jobs for cancellation
const activeJobs = new Map<string, { cancelled: boolean }>();

/** Check if a session's processing was cancelled */
export function isCancelled(sessionId: string): boolean {
  const job = activeJobs.get(sessionId);
  return job?.cancelled ?? false;
}

/** Cancel an active processing job */
export function cancelProcessing(sessionId: string): boolean {
  const job = activeJobs.get(sessionId);
  if (job) {
    job.cancelled = true;
    return true;
  }
  return false;
}

/** Check if a session is currently being processed */
export function isProcessing(sessionId: string): boolean {
  return activeJobs.has(sessionId);
}

/**
 * Runs the full processing pipeline for a session in the background.
 * Determines the starting point based on current session status.
 * Emits Socket.IO progress events at each step.
 * Respects cancellation requests between steps.
 */
export async function runPipeline(sessionId: string): Promise<void> {
  const job = { cancelled: false };
  activeJobs.set(sessionId, job);

  try {
    const session = await Session.findById(sessionId);
    if (!session) {
      emitError(sessionId, 'الجلسة غير موجودة');
      return;
    }

    // Determine starting point based on current status
    const status = session.status;
    const failedAt = session.failedAt;

    // ── Step 1: Extract ──
    if (status === 'uploaded' || (status === 'failed' && failedAt === 'extract')) {
      if (isCancelled(sessionId)) { emitProgress(sessionId, 'cancelled', { progress: 0, status: 'cancelled' }); return; }

      emitProgress(sessionId, 'extracting', { progress: 15, status: 'extracting' });
      try {
        if (session.fileType === 'audio') {
          session.audioPath = session.tempFilePath;
          try {
            session.duration = await getAudioDuration(session.tempFilePath);
          } catch { /* optional */ }
        } else {
          const { audioPath } = await extractAudio(session.tempFilePath, session.originalFileName);
          session.audioPath = audioPath;
          try {
            session.duration = await getAudioDuration(audioPath);
          } catch { /* optional */ }
        }
        session.status = 'extracted';
        session.failedAt = '';
        await session.save();
        emitProgress(sessionId, 'extracted', { progress: 20, status: 'extracted', duration: session.duration });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'extract';
        await session.save();
        const msg = error instanceof Error ? error.message : 'فشل استخراج الصوت';
        emitError(sessionId, msg, 'extract');
        return;
      }
    }

    // ── Step 2: Transcribe + Fix ──
    if (isCancelled(sessionId)) { emitProgress(sessionId, 'cancelled', { progress: 0, status: 'cancelled' }); return; }

    if (session.status === 'extracted' || (session.status === 'failed' && failedAt === 'transcribe')) {
      emitProgress(sessionId, 'transcribing', { progress: 25, status: 'transcribing' });
      try {
        const { text: rawTranscript, words } = await transcribeWithGroq(session.audioPath, sessionId);
        session.rawTranscript = rawTranscript;
        session.words = words;
        session.speakerSegments = []; // Groq doesn't return speaker segments currently

        if (isCancelled(sessionId)) { emitProgress(sessionId, 'cancelled', { progress: 0, status: 'cancelled' }); return; }

        emitProgress(sessionId, 'fixing', { progress: 70, status: 'fixing' });
        const formattedTranscript = await fixTranscript(rawTranscript);
        session.transcript = formattedTranscript;
        session.status = 'transcribed';
        session.failedAt = '';
        await session.save();
        emitProgress(sessionId, 'transcribed', { progress: 75, status: 'transcribed' });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'transcribe';
        await session.save();
        const msg = error instanceof Error ? error.message : 'فشل تفريغ النص';
        emitError(sessionId, msg, 'transcribe');
        return;
      }
    }

    // ── Step 3: Enrich ──
    if (isCancelled(sessionId)) { emitProgress(sessionId, 'cancelled', { progress: 0, status: 'cancelled' }); return; }

    if (session.status === 'transcribed' || (session.status === 'failed' && failedAt === 'enrich')) {
      emitProgress(sessionId, 'enriching', { progress: 80, status: 'enriching' });
      try {
        const { enrichedTranscript, quranVerses } = await enrichQuranTags(session.transcript);
        session.transcript = enrichedTranscript;
        session.quranVerses = quranVerses;
        session.status = 'enriched';
        session.failedAt = '';
        await session.save();
        emitProgress(sessionId, 'enriched', { progress: 85, status: 'enriched', quranVerses });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'enrich';
        await session.save();
        const msg = error instanceof Error ? error.message : 'فشل استخراج الآيات';
        emitError(sessionId, msg, 'enrich');
        return;
      }
    }

    // ── Step 4: Summarize ──
    if (isCancelled(sessionId)) { emitProgress(sessionId, 'cancelled', { progress: 0, status: 'cancelled' }); return; }

    if (session.status === 'enriched' || (session.status === 'failed' && failedAt === 'summarize')) {
      emitProgress(sessionId, 'summarizing', { progress: 90, status: 'summarizing' });
      try {
        const { title, summary, keyPoints } = await summarizeWithGroq(session.transcript);
        session.title = title;
        session.summary = summary;
        session.keyPoints = keyPoints;
        session.status = 'summarized';
        session.failedAt = '';
        await session.save();
        emitProgress(sessionId, 'summarized', { progress: 100, status: 'summarized', title, summary, keyPoints });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'summarize';
        await session.save();
        const msg = error instanceof Error ? error.message : 'فشل التلخيص';
        emitError(sessionId, msg, 'summarize');
        return;
      }
    }

    // Already done
    if (session.status === 'summarized') {
      emitProgress(sessionId, 'summarized', {
        progress: 100, status: 'summarized',
        title: session.title, summary: session.summary, keyPoints: session.keyPoints,
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'خطأ غير متوقع';
    emitError(sessionId, msg);
  } finally {
    activeJobs.delete(sessionId);
  }
}
