import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '@clerk/clerk-sdk-node';
import { envConfig } from '../config/env';

export interface AuthenticatedRequest extends FastifyRequest {
  userId?: string;
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<string | null> {
  let token = '';
  const authHeader = request.headers.authorization;
  
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if ((request.query as any)?.token) {
    token = (request.query as any).token as string;
  }

  if (!token) {
    reply.status(401).send({ error: 'غير مصرح — يجب تسجيل الدخول' });
    return null;
  }
  try {
    const payload = await verifyToken(token, {
      secretKey: envConfig.clerkSecretKey,
    });
    if (!payload.sub) {
      reply.status(401).send({ error: 'رمز غير صالح' });
      return null;
    }
    return payload.sub;
  } catch (error) {
    console.error('Clerk verifyToken error:', error);
    reply.status(401).send({ error: 'فشل التحقق من الهوية' });
    return null;
  }
}

export async function requireAuthHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = await requireAuth(request, reply);
  if (userId) {
    (request as AuthenticatedRequest).userId = userId;
  }
}
