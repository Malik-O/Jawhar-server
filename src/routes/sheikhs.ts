import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { User } from '../models/User';
import { Course } from '../models/Course';

export async function sheikhRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: { page?: string; limit?: string; search?: string } }>(
    '/api/sheikhs',
    async (request, reply) => {
      const page = parseInt(request.query.page || '1', 10);
      const limit = parseInt(request.query.limit || '12', 10);
      const search = request.query.search || '';
      const filter: Record<string, unknown> = { role: 'sheikh', sheikhStatus: 'approved' };
      if (search) filter.name = { $regex: search, $options: 'i' };
      const skip = (page - 1) * limit;
      const [sheikhs, total] = await Promise.all([
        User.find(filter).select('clerkId name bio profileImage followers').skip(skip).limit(limit).lean(),
        User.countDocuments(filter),
      ]);
      return reply.send({ sheikhs, total, page, pages: Math.ceil(total / limit) });
    }
  );

  fastify.get<{ Params: { clerkId: string } }>(
    '/api/sheikhs/:clerkId/public',
    async (request, reply) => {
      const user = await User.findOne({ clerkId: request.params.clerkId, sheikhStatus: 'approved' })
        .select('clerkId name bio profileImage coverImage followers').lean();
      if (!user) return reply.status(404).send({ error: 'الشيخ غير موجود' });
      const courses = await Course.find({ sheikhId: request.params.clerkId })
        .select('title description coverImage category').lean();
      return reply.send({ ...user, courses });
    }
  );
}
