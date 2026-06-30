import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pipeline } from 'stream/promises';
import fs from 'fs';
import path from 'path';
import { getTempFilePath, getFileCategory } from '../services/fileManager';
import { extractAudio, getAudioDuration } from '../services/audioExtractor';
import { transcribeWithGroq } from '../services/groqTranscriber';
import { summarizeWithGroq, fixTranscript } from '../services/geminiProcessor';
import { enrichQuranTags } from '../services/quranService';
import { Session } from '../models/Session';
import { emitProgress, emitError } from '../services/socketManager';
import { runPipeline, cancelProcessing, isProcessing } from '../services/processingManager';
import { requireAuthHook, AuthenticatedRequest } from '../middleware/clerkAuth';

export async function uploadRoutes(fastify: FastifyInstance): Promise<void> {
  // ──────────────────────────────────────────────
  // Audio streaming for playback (Public/Unprotected for wavesurfer/audio tags)
  // ──────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/api/sessions/:id/audio',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session || !session.audioPath) {
        return reply.status(404).send({ error: 'ملف الصوت غير موجود' });
      }



      if (!fs.existsSync(session.audioPath)) {
        return reply.status(404).send({ error: 'ملف الصوت تم حذفه' });
      }

      const stat = fs.statSync(session.audioPath);
      const ext = path.extname(session.audioPath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
      };

      reply.header('Content-Type', mimeMap[ext] || 'audio/mpeg');
      reply.header('Content-Length', stat.size);
      reply.header('Accept-Ranges', 'bytes');

      return reply.send(fs.createReadStream(session.audioPath));
    }
  );

  fastify.get<{ Params: { key: string } }>(
    '/api/sessions/public/:key/audio',
    async (request, reply) => {
      const session = await Session.findOne({ publicKey: request.params.key });
      if (!session || !session.audioPath) {
        return reply.status(404).send({ error: 'ملف الصوت غير موجود' });
      }

      if (!fs.existsSync(session.audioPath)) {
        return reply.status(404).send({ error: 'ملف الصوت تم حذفه' });
      }

      const stat = fs.statSync(session.audioPath);
      const ext = path.extname(session.audioPath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
      };

      reply.header('Content-Type', mimeMap[ext] || 'audio/mpeg');
      reply.header('Content-Length', stat.size);
      reply.header('Accept-Ranges', 'bytes');

      return reply.send(fs.createReadStream(session.audioPath));
    }
  );

  fastify.addHook('preHandler', requireAuthHook);



  // ──────────────────────────────────────────────
  // Step 1: Upload file and create session
  // ──────────────────────────────────────────────
  fastify.post('/api/sessions/start', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'لم يتم رفع ملف' });
    }

    const originalFileName = file.filename;
    const fileCategory = getFileCategory(originalFileName);
    const ext = originalFileName.substring(originalFileName.lastIndexOf('.'));
    const tempInputPath = getTempFilePath(ext);

    try {
      await pipeline(file.file, fs.createWriteStream(tempInputPath));

      const session = await Session.create({
        originalFileName,
        fileType: fileCategory,
        status: 'uploaded',
        tempFilePath: tempInputPath,
        audioPath: fileCategory === 'audio' ? tempInputPath : '',
        sheikhId: request.userId,
      });

      const sessionId = String(session._id);
      emitProgress(sessionId, 'uploaded', { progress: 10, status: 'uploaded' });

      return reply.status(201).send({
        sessionId: session._id,
        status: session.status,
        originalFileName: session.originalFileName,
        fileType: session.fileType,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل رفع الملف';
      return reply.status(500).send({ error: message });
    }
  });

  // ──────────────────────────────────────────────
  // Start autonomous processing (fire-and-forget)
  // Backend runs the full pipeline; frontend only listens via Socket.IO
  // ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/process',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      if (session.sheikhId !== (request as AuthenticatedRequest).userId) {
        return reply.status(403).send({ error: 'غير مصرح' });
      }

      const sessionId = String(session._id);

      // Don't start if already processing
      if (isProcessing(sessionId)) {
        return reply.status(409).send({ error: 'المعالجة جارية بالفعل' });
      }

      // Don't start if already done
      if (session.status === 'summarized') {
        return reply.status(409).send({ error: 'المعالجة مكتملة بالفعل' });
      }

      // Fire-and-forget: run pipeline in background
      runPipeline(sessionId).catch((err) => {
        console.error(`Pipeline error for ${sessionId}:`, err);
      });

      return reply.status(202).send({ sessionId, status: 'processing' });
    }
  );

  // ──────────────────────────────────────────────
  // Stop/cancel active processing
  // ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/stop',
    async (request, reply) => {
      const sessionId = request.params.id;
      const cancelled = cancelProcessing(sessionId);

      if (cancelled) {
        return reply.send({ sessionId, status: 'cancelling' });
      }
      return reply.status(404).send({ error: 'لا توجد معالجة جارية' });
    }
  );

  // ──────────────────────────────────────────────
  // Check if session is currently processing
  // ──────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/api/sessions/:id/status',
    async (request, reply) => {
      const sessionId = request.params.id;
      const processing = isProcessing(sessionId);
      const session = await Session.findById(sessionId).lean();
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }
      return reply.send({
        sessionId,
        processing,
        status: session.status,
        failedAt: session.failedAt,
      });
    }
  );

  // ──────────────────────────────────────────────
  // Step 2: Extract audio from video
  // ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/extract',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      if (session.sheikhId !== (request as AuthenticatedRequest).userId) {
        return reply.status(403).send({ error: 'غير مصرح' });
      }

      const sessionId = String(session._id);
      try {
        emitProgress(sessionId, 'extracting', { progress: 15, status: 'extracting' });

        if (session.fileType === 'audio') {
          session.audioPath = session.tempFilePath;
          session.status = 'extracted';

          try {
            session.duration = await getAudioDuration(session.tempFilePath);
            console.log(`⏱️ Audio duration: ${Math.round(session.duration)}s`);
          } catch { /* duration is optional */ }

          await session.save();
          emitProgress(sessionId, 'extracted', { progress: 20, status: 'extracted', duration: session.duration });
          return reply.send({ status: 'extracted', skipped: true });
        }

        const { audioPath } = await extractAudio(session.tempFilePath, session.originalFileName);
        session.audioPath = audioPath;
        session.status = 'extracted';

        // Get audio duration
        try {
          session.duration = await getAudioDuration(audioPath);
          console.log(`⏱️ Audio duration: ${Math.round(session.duration)}s`);
        } catch { /* duration is optional */ }

        await session.save();

        emitProgress(sessionId, 'extracted', { progress: 20, status: 'extracted', duration: session.duration });
        return reply.send({ status: 'extracted', skipped: false });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'extract';
        await session.save();
        const message = error instanceof Error ? error.message : 'فشل استخراج الصوت';
        emitError(sessionId, message, 'extract');
        return reply.status(500).send({ error: message, failedAt: 'extract' });
      }
    }
  );

  // ──────────────────────────────────────────────
  // Step 3: Transcribe with WhisperX (diarization) or Groq fallback
  // ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/transcribe',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      if (session.sheikhId !== (request as AuthenticatedRequest).userId) {
        return reply.status(403).send({ error: 'غير مصرح' });
      }

      if (!session.audioPath) {
        return reply.status(400).send({ error: 'يجب استخراج الصوت أولاً' });
      }

      const sessionId = String(session._id);
      try {
        emitProgress(sessionId, 'transcribing', { progress: 25, status: 'transcribing' });

        const { text: rawTranscript, words } = await transcribeWithGroq(session.audioPath, sessionId);
        session.rawTranscript = rawTranscript;
        session.words = words;
        session.speakerSegments = []; // Groq doesn't return speaker segments currently

        emitProgress(sessionId, 'fixing', { progress: 70, status: 'fixing' });
        console.log('📝 Fixing transcript and formatting with LLM...');
        const formattedTranscript = await fixTranscript(rawTranscript);
        session.transcript = formattedTranscript;

        session.status = 'transcribed';
        await session.save();

        emitProgress(sessionId, 'transcribed', { progress: 65, status: 'transcribed' });
        return reply.send({ status: 'transcribed', transcript: formattedTranscript });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'transcribe';
        await session.save();
        const message = error instanceof Error ? error.message : 'فشل تفريغ النص';
        emitError(sessionId, message, 'transcribe');
        return reply.status(500).send({ error: message, failedAt: 'transcribe' });
      }
    }
  );

  // ──────────────────────────────────────────────
  // Step 4: Enrich Quran verses with Uthmani text & references
  // ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/enrich-verses',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      if (session.sheikhId !== (request as AuthenticatedRequest).userId) {
        return reply.status(403).send({ error: 'غير مصرح' });
      }

      if (!session.transcript) {
        return reply.status(400).send({ error: 'يجب تفريغ النص أولاً' });
      }

      const sessionId = String(session._id);
      try {
        emitProgress(sessionId, 'enriching', { progress: 80, status: 'enriching' });
        console.log('📖 Enriching Quran verses with Uthmani text...');
        const { enrichedTranscript, quranVerses } = await enrichQuranTags(session.transcript);

        session.transcript = enrichedTranscript;
        session.quranVerses = quranVerses;
        session.status = 'enriched';
        await session.save();

        console.log(`✅ Enriched ${quranVerses.length} Quran verses`);
        emitProgress(sessionId, 'enriched', { progress: 85, status: 'enriched', quranVerses });
        return reply.send({
          status: 'enriched',
          quranVerses,
          transcript: enrichedTranscript,
        });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'enrich';
        await session.save();
        const message = error instanceof Error ? error.message : 'فشل استخراج الآيات';
        emitError(sessionId, message, 'enrich');
        return reply.status(500).send({ error: message, failedAt: 'enrich' });
      }
    }
  );

  // ──────────────────────────────────────────────
  // Step 5: Summarize with Gemini
  // ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/summarize',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      if (session.sheikhId !== (request as AuthenticatedRequest).userId) {
        return reply.status(403).send({ error: 'غير مصرح' });
      }

      if (!session.transcript) {
        return reply.status(400).send({ error: 'يجب تفريغ النص أولاً' });
      }

      const sessionId = String(session._id);
      try {
        emitProgress(sessionId, 'summarizing', { progress: 90, status: 'summarizing' });
        const { title, summary, keyPoints } = await summarizeWithGroq(session.transcript);
        session.title = title;
        session.summary = summary;
        session.keyPoints = keyPoints;
        session.status = 'summarized';
        await session.save();

        emitProgress(sessionId, 'summarized', { progress: 100, status: 'summarized', title, summary, keyPoints });
        return reply.send({ status: 'summarized', title, summary, keyPoints });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'summarize';
        await session.save();
        const message = error instanceof Error ? error.message : 'فشل التلخيص';
        emitError(sessionId, message, 'summarize');
        return reply.status(500).send({ error: message, failedAt: 'summarize' });
      }
    }
  );

  // ──────────────────────────────────────────────
  // List & Get & Delete
  // ──────────────────────────────────────────────
  fastify.get<{ Querystring: { archived?: string } }>(
    '/api/sessions',
    async (request: AuthenticatedRequest, reply) => {
      const showArchived = (request.query as any).archived === 'true';
      const filter: any = { sheikhId: request.userId };
      if (showArchived) {
        filter.archived = true;
      } else {
        filter.archived = { $ne: true };
      }
      const sessions = await Session.find(filter)
        .select('title originalFileName fileType status failedAt duration archived createdAt lectureId publicKey visibility')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      return reply.send(sessions);
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const session = await Session.findById(request.params.id).lean();
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }
      return reply.send(session);
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const deleted = await Session.findByIdAndDelete(request.params.id);
      if (!deleted) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }
      return reply.send({ success: true });
    }
  );

  // ──────────────────────────────────────────────
  // Archive / Unarchive a session
  // ──────────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: { archived: boolean } }>(
    '/api/sessions/:id/archive',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      if (session.sheikhId !== (request as AuthenticatedRequest).userId) {
        return reply.status(403).send({ error: 'غير مصرح' });
      }

      const body = request.body as { archived?: boolean };
      session.archived = !!body.archived;
      await session.save();

      return reply.send({ success: true, archived: session.archived });
    }
  );

  // ──────────────────────────────────────────────
  // Update session metadata (title / summary)
  // ──────────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: { title?: string; summary?: string } }>(
    '/api/sessions/:id/metadata',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      if (session.sheikhId !== (request as AuthenticatedRequest).userId) {
        return reply.status(403).send({ error: 'غير مصرح' });
      }

      const body = request.body as { title?: string; summary?: string };
      if (typeof body.title === 'string') session.title = body.title;
      if (typeof body.summary === 'string') session.summary = body.summary;
      await session.save();

      return reply.send({ status: 'updated', title: session.title, summary: session.summary });
    }
  );

  // ──────────────────────────────────────────────
  // Update session visibility
  // ──────────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: { visibility: 'public' | 'private' | 'unlisted' } }>(
    '/api/sessions/:id/visibility',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      if (session.sheikhId !== (request as AuthenticatedRequest).userId) {
        return reply.status(403).send({ error: 'غير مصرح' });
      }

      const body = request.body;
      if (body.visibility && ['public', 'private', 'unlisted'].includes(body.visibility)) {
        session.visibility = body.visibility;
        await session.save();
      }

      return reply.send({ success: true, visibility: session.visibility });
    }
  );

  // Audio streaming moved to top

  // ──────────────────────────────────────────────
  // Update transcript (user edits)
  // ──────────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: { transcript: string } }>(
    '/api/sessions/:id/transcript',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      if (session.sheikhId !== (request as AuthenticatedRequest).userId) {
        return reply.status(403).send({ error: 'غير مصرح' });
      }

      const body = request.body as { transcript?: string };
      if (!body?.transcript) {
        return reply.status(400).send({ error: 'النص مطلوب' });
      }

      session.transcript = body.transcript;
      await session.save();
      return reply.send({ status: 'updated' });
    }
  );

  // ──────────────────────────────────────────────
  // Public Access by Key
  // ──────────────────────────────────────────────
  fastify.get<{ Params: { key: string } }>(
    '/api/sessions/public/:key',
    async (request, reply) => {
      const session = await Session.findOne({ publicKey: request.params.key })
        .select('title summary keyPoints transcript quranVerses duration publicKey').lean();
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }
      return reply.send(session);
    }
  );

  // ──────────────────────────────────────────────
  // Sidebar Data (Courses, Standalone Lectures, Sessions)
  // ──────────────────────────────────────────────
  fastify.get(
    '/api/sidebar-data',
    async (request: AuthenticatedRequest, reply) => {
      const { Course } = await import('../models/Course');
      const { Lecture } = await import('../models/Lecture');
      
      const courses = await Course.find({ sheikhId: request.userId })
        .populate({ path: 'lectures', select: 'title order description sessionId publicKey createdAt', options: { sort: { order: 1 } } })
        .sort({ createdAt: -1 })
        .lean();
      
      const standaloneLectures = await Lecture.find({ sheikhId: request.userId, courseId: null })
        .sort({ createdAt: -1 })
        .lean();
      
      const unlinkedSessions = await Session.find({ sheikhId: request.userId, lectureId: null, archived: { $ne: true } })
        .select('title originalFileName fileType status failedAt duration archived createdAt publicKey visibility')
        .sort({ createdAt: -1 })
        .lean();
      
      return reply.send({ courses, standaloneLectures, unlinkedSessions });
    }
  );
}
