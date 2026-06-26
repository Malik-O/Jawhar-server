import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { User } from '../models/User';
import { requireAuth, AuthenticatedRequest } from '../middleware/clerkAuth';
import { syncUser, getUserByClerkId } from '../middleware/roleAuth';

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/users/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      const email = clerkUser.emailAddresses[0]?.emailAddress || '';
      const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 'مستخدم';
      const user = await syncUser(userId, email, name);
      return reply.send(user);
    } catch (error) {
      return reply.status(500).send({ error: 'فشل مزامنة المستخدم' });
    }
  });

  fastify.get('/api/users/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    const user = await getUserByClerkId(userId);
    if (!user) return reply.status(404).send({ error: 'المستخدم غير موجود' });
    return reply.send(user);
  });

  fastify.patch('/api/users/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    const body = request.body as { bio?: string; profileImage?: string; coverImage?: string; name?: string };
    const user = await User.findOneAndUpdate(
      { clerkId: userId },
      { $set: { bio: body.bio, profileImage: body.profileImage, coverImage: body.coverImage, name: body.name } },
      { new: true }
    );
    if (!user) return reply.status(404).send({ error: 'المستخدم غير موجود' });
    return reply.send(user);
  });

  fastify.get<{ Params: { clerkId: string } }>('/api/users/:clerkId', async (request, reply) => {
    const user = await User.findOne({ clerkId: request.params.clerkId })
      .select('-email -__v').lean();
    if (!user) return reply.status(404).send({ error: 'المستخدم غير موجود' });
    return reply.send(user);
  });

  fastify.post<{ Params: { clerkId: string } }>('/api/users/:clerkId/follow', async (request, reply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    const targetId = request.params.clerkId;
    if (userId === targetId) return reply.status(400).send({ error: 'لا يمكن متابعة نفسك' });
    await User.updateOne({ clerkId: userId }, { $addToSet: { following: targetId } });
    await User.updateOne({ clerkId: targetId }, { $addToSet: { followers: userId } });
    return reply.send({ success: true });
  });

  fastify.delete<{ Params: { clerkId: string } }>('/api/users/:clerkId/follow', async (request, reply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    const targetId = request.params.clerkId;
    await User.updateOne({ clerkId: userId }, { $pull: { following: targetId } });
    await User.updateOne({ clerkId: targetId }, { $pull: { followers: userId } });
    return reply.send({ success: true });
  });

  fastify.post('/api/users/request-sheikh', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;
    const user = await User.findOneAndUpdate(
      { clerkId: userId, role: 'student', sheikhStatus: { $in: ['none', 'rejected'] } },
      { $set: { sheikhStatus: 'pending' } },
      { new: true }
    );
    if (!user) return reply.status(400).send({ error: 'لا يمكن تقديم طلب حالياً' });
    return reply.send({ success: true, sheikhStatus: 'pending' });
  });
}
