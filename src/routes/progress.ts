import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Progress } from '../models/Progress';
import { Course } from '../models/Course';
import { requireAuth } from '../middleware/clerkAuth';

export async function progressRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { courseId: string } }>(
    '/api/progress/course/:courseId',
    async (request, reply) => {
      const userId = await requireAuth(request, reply);
      if (!userId) return;
      const course = await Course.findById(request.params.courseId).lean();
      if (!course) return reply.status(404).send({ error: 'الدورة غير موجودة' });
      const progress = await Progress.find({
        studentId: userId,
        courseId: request.params.courseId,
      }).lean();
      const completed = progress.filter(p => p.completed).length;
      const total = course.lectures.length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      return reply.send({
        completed,
        total,
        percent,
        lectures: progress.map(p => ({ lectureId: String(p.lectureId), completed: p.completed })),
      });
    }
  );
}
