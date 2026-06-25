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

export async function uploadRoutes(fastify: FastifyInstance): Promise<void> {

  // ──────────────────────────────────────────────
  // Step 1: Upload file and create session
  // ──────────────────────────────────────────────
  fastify.post('/api/sessions/start', async (request: FastifyRequest, reply: FastifyReply) => {
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
      });

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
  // Step 2: Extract audio from video
  // ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/extract',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      try {
        if (session.fileType === 'audio') {
          session.audioPath = session.tempFilePath;
          session.status = 'extracted';

          try {
            session.duration = await getAudioDuration(session.tempFilePath);
            console.log(`⏱️ Audio duration: ${Math.round(session.duration)}s`);
          } catch { /* duration is optional */ }

          await session.save();
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

        return reply.send({ status: 'extracted', skipped: false });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'extract';
        await session.save();
        const message = error instanceof Error ? error.message : 'فشل استخراج الصوت';
        return reply.status(500).send({ error: message, failedAt: 'extract' });
      }
    }
  );

  // ──────────────────────────────────────────────
  // Step 3: Transcribe with Groq Whisper
  // ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/transcribe',
    async (request, reply) => {
      const session = await Session.findById(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: 'الجلسة غير موجودة' });
      }

      if (!session.audioPath) {
        return reply.status(400).send({ error: 'يجب استخراج الصوت أولاً' });
      }

      try {
        const { text: rawTranscript, words } = await transcribeWithGroq(session.audioPath);
        session.rawTranscript = rawTranscript;
        session.words = words;
        
        console.log('📝 Fixing transcript and formatting with LLM...');
        const formattedTranscript = await fixTranscript(rawTranscript);
        session.transcript = formattedTranscript;

        session.status = 'transcribed';
        await session.save();

        return reply.send({ status: 'transcribed', transcript: formattedTranscript });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'transcribe';
        await session.save();
        const message = error instanceof Error ? error.message : 'فشل تفريغ النص';
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

      if (!session.transcript) {
        return reply.status(400).send({ error: 'يجب تفريغ النص أولاً' });
      }

      try {
        console.log('📖 Enriching Quran verses with Uthmani text...');
        const { enrichedTranscript, quranVerses } = await enrichQuranTags(session.transcript);

        session.transcript = enrichedTranscript;
        session.quranVerses = quranVerses;
        session.status = 'enriched';
        await session.save();

        console.log(`✅ Enriched ${quranVerses.length} Quran verses`);
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

      if (!session.transcript) {
        return reply.status(400).send({ error: 'يجب تفريغ النص أولاً' });
      }

      try {
        const { title, summary, keyPoints } = await summarizeWithGroq(session.transcript);
        session.title = title;
        session.summary = summary;
        session.keyPoints = keyPoints;
        session.status = 'summarized';
        await session.save();

        return reply.send({ status: 'summarized', title, summary, keyPoints });
      } catch (error) {
        session.status = 'failed';
        session.failedAt = 'summarize';
        await session.save();
        const message = error instanceof Error ? error.message : 'فشل التلخيص';
        return reply.status(500).send({ error: message, failedAt: 'summarize' });
      }
    }
  );

  // ──────────────────────────────────────────────
  // List & Get & Delete
  // ──────────────────────────────────────────────
  fastify.get<{ Querystring: { archived?: string } }>(
    '/api/sessions',
    async (request, reply) => {
      const showArchived = request.query.archived === 'true';
      const filter = showArchived ? { archived: true } : { archived: { $ne: true } };
      const sessions = await Session.find(filter)
        .select('title originalFileName fileType status failedAt duration archived createdAt')
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

      const body = request.body as { archived?: boolean };
      session.archived = !!body.archived;
      await session.save();

      return reply.send({ success: true, archived: session.archived });
    }
  );

  // ──────────────────────────────────────────────
  // Audio streaming for playback
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

      const body = request.body as { transcript?: string };
      if (!body?.transcript) {
        return reply.status(400).send({ error: 'النص مطلوب' });
      }

      session.transcript = body.transcript;
      await session.save();
      return reply.send({ status: 'updated' });
    }
  );
}
