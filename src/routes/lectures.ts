import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Lecture } from '../models/Lecture';
import { Course } from '../models/Course';
import { Session } from '../models/Session';
import { Progress } from '../models/Progress';
import { requireSheikh, getUserByClerkId } from '../middleware/roleAuth';
import { requireAuth, AuthenticatedRequest } from '../middleware/clerkAuth';

export async function lectureRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/lectures', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!await requireSheikh(request, reply)) return;
    const body = request.body as { sessionId: string; courseId?: string; title: string; description?: string };
    const session = await Session.findById(body.sessionId);
    if (!session) return reply.status(404).send({ error: 'الجلسة غير موجودة' });
    if (session.status !== 'summarized') return reply.status(400).send({ error: 'المعالجة لم تكتمل بعد' });
    const userId = (request as AuthenticatedRequest).userId!;
    const count = await Lecture.countDocuments({ courseId: body.courseId || null });
    const lecture = await Lecture.create({
      sheikhId: userId,
      courseId: body.courseId || null,
      sessionId: body.sessionId,
      title: body.title,
      description: body.description || '',
      order: count,
    });
    session.lectureId = lecture._id;
    await session.save();
    if (body.courseId) {
      await Course.findByIdAndUpdate(body.courseId, { $addToSet: { lectures: lecture._id } });
    }
    return reply.status(201).send(lecture);
  });

  fastify.get<{ Params: { id: string } }>('/api/lectures/:id', async (request, reply) => {
    const lecture = await Lecture.findById(request.params.id).lean();
    if (!lecture) return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
    const session = await Session.findById(lecture.sessionId).lean();
    return reply.send({ ...lecture, session });
  });

  fastify.get<{ Params: { id: string } }>('/api/lectures/:id/public', async (request, reply) => {
    const lecture = await Lecture.findById(request.params.id).lean();
    if (!lecture) return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
    const session = await Session.findById(lecture.sessionId)
      .select('title summary keyPoints transcript quranVerses duration').lean();
    return reply.send({ ...lecture, session });
  });

  fastify.get<{ Params: { key: string } }>('/api/lectures/public/:key', async (request, reply) => {
    const lecture = await Lecture.findOne({ publicKey: request.params.key }).lean();
    if (!lecture) return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
    const session = await Session.findById(lecture.sessionId)
      .select('title summary keyPoints transcript quranVerses duration').lean();
    return reply.send({ ...lecture, session });
  });

  fastify.patch<{ Params: { id: string } }>('/api/lectures/:id', async (request, reply) => {
    if (!await requireSheikh(request, reply)) return;
    const body = request.body as { title?: string; description?: string; order?: number };
    const lecture = await Lecture.findById(request.params.id);
    if (!lecture) return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
    if (lecture.sheikhId !== (request as AuthenticatedRequest).userId) {
      return reply.status(403).send({ error: 'غير مصرح بتعديل هذه المحاضرة' });
    }
    Object.assign(lecture, body);
    await lecture.save();
    return reply.send(lecture);
  });

  fastify.delete<{ Params: { id: string } }>('/api/lectures/:id', async (request, reply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    const user = await getUserByClerkId(userId);
    const lecture = await Lecture.findById(request.params.id);
    if (!lecture) return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
    if (lecture.sheikhId !== userId && user?.role !== 'super_admin') {
      return reply.status(403).send({ error: 'غير مصرح بحذف هذه المحاضرة' });
    }
    if (lecture.courseId) {
      await Course.findByIdAndUpdate(lecture.courseId, { $pull: { lectures: lecture._id } });
    }
    await Lecture.findByIdAndDelete(request.params.id);
    return reply.send({ success: true });
  });

  fastify.post<{ Params: { id: string } }>('/api/lectures/:id/complete', async (request, reply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    const lecture = await Lecture.findById(request.params.id);
    if (!lecture) return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
    await Progress.findOneAndUpdate(
      { studentId: userId, lectureId: lecture._id },
      { $set: { completed: true, completedAt: new Date(), courseId: lecture.courseId } },
      { upsert: true }
    );
    return reply.send({ success: true, completed: true });
  });

  fastify.get<{ Params: { id: string } }>('/api/lectures/:id/progress', async (request, reply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    const progress = await Progress.findOne({ studentId: userId, lectureId: request.params.id }).lean();
    return reply.send({ completed: !!progress?.completed });
  });
}
