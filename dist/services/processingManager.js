"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCancelled = isCancelled;
exports.cancelProcessing = cancelProcessing;
exports.isProcessing = isProcessing;
exports.runPipeline = runPipeline;
const Session_1 = require("../models/Session");
const audioExtractor_1 = require("./audioExtractor");
const groqTranscriber_1 = require("./groqTranscriber");
const geminiProcessor_1 = require("./geminiProcessor");
const quranService_1 = require("./quranService");
const socketManager_1 = require("./socketManager");
// In-memory tracking of active processing jobs for cancellation
const activeJobs = new Map();
/** Check if a session's processing was cancelled */
function isCancelled(sessionId) {
    const job = activeJobs.get(sessionId);
    return job?.cancelled ?? false;
}
/** Cancel an active processing job */
function cancelProcessing(sessionId) {
    const job = activeJobs.get(sessionId);
    if (job) {
        job.cancelled = true;
        return true;
    }
    return false;
}
/** Check if a session is currently being processed */
function isProcessing(sessionId) {
    return activeJobs.has(sessionId);
}
/**
 * Runs the full processing pipeline for a session in the background.
 * Determines the starting point based on current session status.
 * Emits Socket.IO progress events at each step.
 * Respects cancellation requests between steps.
 */
async function runPipeline(sessionId) {
    const job = { cancelled: false };
    activeJobs.set(sessionId, job);
    try {
        const session = await Session_1.Session.findById(sessionId);
        if (!session) {
            (0, socketManager_1.emitError)(sessionId, 'الجلسة غير موجودة');
            return;
        }
        // Determine starting point based on current status
        const status = session.status;
        const failedAt = session.failedAt;
        // ── Step 1: Extract ──
        if (status === 'uploaded' || (status === 'failed' && failedAt === 'extract')) {
            if (isCancelled(sessionId)) {
                (0, socketManager_1.emitProgress)(sessionId, 'cancelled', { progress: 0, status: 'cancelled' });
                return;
            }
            (0, socketManager_1.emitProgress)(sessionId, 'extracting', { progress: 15, status: 'extracting' });
            try {
                if (session.fileType === 'audio') {
                    session.audioPath = session.tempFilePath;
                    try {
                        session.duration = await (0, audioExtractor_1.getAudioDuration)(session.tempFilePath);
                    }
                    catch { /* optional */ }
                }
                else {
                    const { audioPath } = await (0, audioExtractor_1.extractAudio)(session.tempFilePath, session.originalFileName);
                    session.audioPath = audioPath;
                    try {
                        session.duration = await (0, audioExtractor_1.getAudioDuration)(audioPath);
                    }
                    catch { /* optional */ }
                }
                session.status = 'extracted';
                session.failedAt = '';
                await session.save();
                (0, socketManager_1.emitProgress)(sessionId, 'extracted', { progress: 20, status: 'extracted', duration: session.duration });
            }
            catch (error) {
                session.status = 'failed';
                session.failedAt = 'extract';
                await session.save();
                const msg = error instanceof Error ? error.message : 'فشل استخراج الصوت';
                (0, socketManager_1.emitError)(sessionId, msg, 'extract');
                return;
            }
        }
        // ── Step 2: Transcribe + Fix ──
        if (isCancelled(sessionId)) {
            (0, socketManager_1.emitProgress)(sessionId, 'cancelled', { progress: 0, status: 'cancelled' });
            return;
        }
        if (session.status === 'extracted' || (session.status === 'failed' && failedAt === 'transcribe')) {
            (0, socketManager_1.emitProgress)(sessionId, 'transcribing', { progress: 25, status: 'transcribing' });
            try {
                const { text: rawTranscript, words } = await (0, groqTranscriber_1.transcribeWithGroq)(session.audioPath, sessionId);
                session.rawTranscript = rawTranscript;
                session.words = words;
                session.speakerSegments = []; // Groq doesn't return speaker segments currently
                if (isCancelled(sessionId)) {
                    (0, socketManager_1.emitProgress)(sessionId, 'cancelled', { progress: 0, status: 'cancelled' });
                    return;
                }
                (0, socketManager_1.emitProgress)(sessionId, 'fixing', { progress: 70, status: 'fixing' });
                const formattedTranscript = await (0, geminiProcessor_1.fixTranscript)(rawTranscript);
                session.transcript = formattedTranscript;
                session.status = 'transcribed';
                session.failedAt = '';
                await session.save();
                (0, socketManager_1.emitProgress)(sessionId, 'transcribed', { progress: 75, status: 'transcribed' });
            }
            catch (error) {
                session.status = 'failed';
                session.failedAt = 'transcribe';
                await session.save();
                const msg = error instanceof Error ? error.message : 'فشل تفريغ النص';
                (0, socketManager_1.emitError)(sessionId, msg, 'transcribe');
                return;
            }
        }
        // ── Step 3: Enrich ──
        if (isCancelled(sessionId)) {
            (0, socketManager_1.emitProgress)(sessionId, 'cancelled', { progress: 0, status: 'cancelled' });
            return;
        }
        if (session.status === 'transcribed' || (session.status === 'failed' && failedAt === 'enrich')) {
            (0, socketManager_1.emitProgress)(sessionId, 'enriching', { progress: 80, status: 'enriching' });
            try {
                const { enrichedTranscript, quranVerses } = await (0, quranService_1.enrichQuranTags)(session.transcript);
                session.transcript = enrichedTranscript;
                session.quranVerses = quranVerses;
                session.status = 'enriched';
                session.failedAt = '';
                await session.save();
                (0, socketManager_1.emitProgress)(sessionId, 'enriched', { progress: 85, status: 'enriched', quranVerses });
            }
            catch (error) {
                session.status = 'failed';
                session.failedAt = 'enrich';
                await session.save();
                const msg = error instanceof Error ? error.message : 'فشل استخراج الآيات';
                (0, socketManager_1.emitError)(sessionId, msg, 'enrich');
                return;
            }
        }
        // ── Step 4: Summarize ──
        if (isCancelled(sessionId)) {
            (0, socketManager_1.emitProgress)(sessionId, 'cancelled', { progress: 0, status: 'cancelled' });
            return;
        }
        if (session.status === 'enriched' || (session.status === 'failed' && failedAt === 'summarize')) {
            (0, socketManager_1.emitProgress)(sessionId, 'summarizing', { progress: 90, status: 'summarizing' });
            try {
                const { title, summary, keyPoints } = await (0, geminiProcessor_1.summarizeWithGroq)(session.transcript);
                session.title = title;
                session.summary = summary;
                session.keyPoints = keyPoints;
                session.status = 'summarized';
                session.failedAt = '';
                await session.save();
                (0, socketManager_1.emitProgress)(sessionId, 'summarized', { progress: 100, status: 'summarized', title, summary, keyPoints });
            }
            catch (error) {
                session.status = 'failed';
                session.failedAt = 'summarize';
                await session.save();
                const msg = error instanceof Error ? error.message : 'فشل التلخيص';
                (0, socketManager_1.emitError)(sessionId, msg, 'summarize');
                return;
            }
        }
        // Already done
        if (session.status === 'summarized') {
            (0, socketManager_1.emitProgress)(sessionId, 'summarized', {
                progress: 100, status: 'summarized',
                title: session.title, summary: session.summary, keyPoints: session.keyPoints,
            });
        }
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : 'خطأ غير متوقع';
        (0, socketManager_1.emitError)(sessionId, msg);
    }
    finally {
        activeJobs.delete(sessionId);
    }
}
//# sourceMappingURL=processingManager.js.map