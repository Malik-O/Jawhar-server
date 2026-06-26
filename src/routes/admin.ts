import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { User } from '../models/User';
import { Course } from '../models/Course';
import { Lecture } from '../models/Lecture';
import { requireAdmin } from '../middleware/roleAuth';

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/admin/pending-sheikhs', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const pending = await User.find({ sheikhStatus: 'pending' })
      .select('clerkId name bio profileImage createdAt').lean();
    return reply.send(pending);
  });

  fastify.patch<{ Params: { clerkId: string } }>('/api/admin/sheikhs/:clerkId/approve', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const user = await User.findOneAndUpdate(
      { clerkId: request.params.clerkId },
      { $set: { role: 'sheikh', sheikhStatus: 'approved' } },
      { new: true }
    );
    if (!user) return reply.status(404).send({ error: 'المستخدم غير موجود' });
    return reply.send({ success: true, role: user.role, sheikhStatus: user.sheikhStatus });
  });

  fastify.patch<{ Params: { clerkId: string } }>('/api/admin/sheikhs/:clerkId/reject', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const user = await User.findOneAndUpdate(
      { clerkId: request.params.clerkId },
      { $set: { sheikhStatus: 'rejected' } },
      { new: true }
    );
    if (!user) return reply.status(404).send({ error: 'المستخدم غير موجود' });
    return reply.send({ success: true, sheikhStatus: user.sheikhStatus });
  });

  fastify.get('/api/admin/stats', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const [users, sheikhs, pending, courses, lectures] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: 'sheikh' }),
      User.countDocuments({ sheikhStatus: 'pending' }),
      Course.countDocuments({}),
      Lecture.countDocuments({}),
    ]);
    return reply.send({ users, sheikhs, pending, courses, lectures });
  });

  fastify.get<{ Querystring: { page?: string; limit?: string; role?: string } }>('/api/admin/users', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const page = parseInt(request.query.page || '1', 10);
    const limit = parseInt(request.query.limit || '20', 10);
    const role = request.query.role;
    const filter: Record<string, unknown> = {};
    if (role) filter.role = role;
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(filter).select('clerkId name email role sheikhStatus createdAt').skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return reply.send({ users, total, page, pages: Math.ceil(total / limit) });
  });

  fastify.delete<{ Params: { clerkId: string } }>('/api/admin/users/:clerkId', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const deleted = await User.findOneAndDelete({ clerkId: request.params.clerkId });
    if (!deleted) return reply.status(404).send({ error: 'المستخدم غير موجود' });
    return reply.send({ success: true });
  });
}
