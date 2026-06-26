import { FastifyRequest, FastifyReply } from 'fastify';
import { User } from '../models/User';
import { envConfig } from '../config/env';
import { requireAuth, AuthenticatedRequest } from './clerkAuth';

export async function getUserByClerkId(clerkId: string) {
  return User.findOne({ clerkId });
}

export async function syncUser(clerkId: string, email: string, name: string) {
  const isSuperAdmin = clerkId === envConfig.clerkSuperAdminId;
  const role = isSuperAdmin ? 'super_admin' : 'student';
  const sheikhStatus = isSuperAdmin ? 'approved' : 'none';

  return User.findOneAndUpdate(
    { clerkId },
    { $setOnInsert: { clerkId, email, name, role, sheikhStatus } },
    { upsert: true, new: true }
  );
}

export async function requireSheikh(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const userId = await requireAuth(request, reply);
  if (!userId) return false;

  const user = await getUserByClerkId(userId);
  if (!user || user.role !== 'sheikh' || user.sheikhStatus !== 'approved') {
    reply.status(403).send({ error: 'هذه الميزة مخصصة للشيوخ المعتمدين فقط' });
    return false;
  }
  (request as AuthenticatedRequest).userId = userId;
  return true;
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const userId = await requireAuth(request, reply);
  if (!userId) return false;

  const user = await getUserByClerkId(userId);
  if (!user || user.role !== 'super_admin') {
    reply.status(403).send({ error: 'هذه الميزة مخصصة للمشرفين فقط' });
    return false;
  }
  (request as AuthenticatedRequest).userId = userId;
  return true;
}
