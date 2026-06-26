import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Course } from '../models/Course';
import { Lecture } from '../models/Lecture';
import { requireSheikh, getUserByClerkId } from '../middleware/roleAuth';
import { requireAuth, AuthenticatedRequest } from '../middleware/clerkAuth';

export async function courseRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/courses', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!await requireSheikh(request, reply)) return;
    const body = request.body as { title: string; description?: string; coverImage?: string; category?: string };
    const course = await Course.create({
      sheikhId: (request as AuthenticatedRequest).userId,
      title: body.title,
      description: body.description || '',
      coverImage: body.coverImage || '',
      category: body.category || '',
    });
    return reply.status(201).send(course);
  });

  fastify.get<{ Querystring: { sheikhId?: string; category?: string; page?: string; limit?: string } }>(
    '/api/courses',
    async (request, reply) => {
      const { sheikhId, category } = request.query;
      const page = parseInt(request.query.page || '1', 10);
      const limit = parseInt(request.query.limit || '12', 10);
      const filter: Record<string, unknown> = {};
      if (sheikhId) filter.sheikhId = sheikhId;
      if (category) filter.category = category;
      const skip = (page - 1) * limit;
      const [courses, total] = await Promise.all([
        Course.find(filter).populate('lectures', 'title order').skip(skip).limit(limit).lean(),
        Course.countDocuments(filter),
      ]);
      return reply.send({ courses, total, page, pages: Math.ceil(total / limit) });
    }
  );

  fastify.get<{ Params: { id: string } }>('/api/courses/:id', async (request, reply) => {
    const course = await Course.findById(request.params.id).populate('lectures').lean();
    if (!course) return reply.status(404).send({ error: 'الدورة غير موجودة' });
    return reply.send(course);
  });

  fastify.get<{ Params: { id: string } }>('/api/courses/:id/public', async (request, reply) => {
    const course = await Course.findById(request.params.id).populate('lectures', 'title order description').lean();
    if (!course) return reply.status(404).send({ error: 'الدورة غير موجودة' });
    return reply.send(course);
  });

  fastify.patch<{ Params: { id: string } }>('/api/courses/:id', async (request, reply) => {
    if (!await requireSheikh(request, reply)) return;
    const body = request.body as { title?: string; description?: string; coverImage?: string; category?: string };
    const course = await Course.findById(request.params.id);
    if (!course) return reply.status(404).send({ error: 'الدورة غير موجودة' });
    if (course.sheikhId !== (request as AuthenticatedRequest).userId) {
      return reply.status(403).send({ error: 'غير مصرح بتعديل هذه الدورة' });
    }
    Object.assign(course, body);
    await course.save();
    return reply.send(course);
  });

  fastify.delete<{ Params: { id: string } }>('/api/courses/:id', async (request, reply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    const user = await getUserByClerkId(userId);
    const course = await Course.findById(request.params.id);
    if (!course) return reply.status(404).send({ error: 'الدورة غير موجودة' });
    if (course.sheikhId !== userId && user?.role !== 'super_admin') {
      return reply.status(403).send({ error: 'غير مصرح بحذف هذه الدورة' });
    }
    await Course.findByIdAndDelete(request.params.id);
    return reply.send({ success: true });
  });

  fastify.post<{ Params: { id: string } }>('/api/courses/:id/enroll', async (request, reply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    const course = await Course.findByIdAndUpdate(
      request.params.id,
      { $addToSet: { enrolledStudents: userId } },
      { new: true }
    );
    if (!course) return reply.status(404).send({ error: 'الدورة غير موجودة' });
    return reply.send({ success: true, enrolled: true });
  });
}
