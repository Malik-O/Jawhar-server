import { FastifyRequest, FastifyReply } from 'fastify';
import { User } from '../models/User';
import { envConfig } from '../config/env';
import { requireAuth, AuthenticatedRequest } from './clerkAuth';

export async function getUserByClerkId(clerkId: string) {
  return User.findOne({ clerkId });
}

export async function syncUser(clerkId: string, email: string, name: string, metadata?: any) {
  const isSuperAdmin = clerkId === envConfig.clerkSuperAdminId;
  const role = isSuperAdmin ? 'super_admin' : (metadata?.role === 'sheikh' ? 'sheikh' : 'student');
  const sheikhStatus = isSuperAdmin ? 'approved' : (metadata?.role === 'sheikh' ? 'approved' : 'none');

  let user = await User.findOne({ clerkId });
  if (!user) {
    user = await User.create({ clerkId, email, name, role, sheikhStatus });
  } else {
    const updates: any = { email, name };
    if (metadata?.role === 'sheikh' && user.role !== 'sheikh') {
      updates.role = 'sheikh';
      updates.sheikhStatus = 'approved';
    }
    user = await User.findOneAndUpdate({ clerkId }, { $set: updates }, { new: true });
  }
  return user;
}

export async function requireSheikh(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const userId = await requireAuth(request, reply);
  if (!userId) return false;

  const user = await getUserByClerkId(userId);
  if (!user || user.role !== 'sheikh') {
    reply.status(403).send({ error: 'هذه الميزة مخصصة للشيوخ فقط' });
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
