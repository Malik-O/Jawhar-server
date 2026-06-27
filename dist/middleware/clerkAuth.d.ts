import { FastifyRequest, FastifyReply } from 'fastify';
export interface AuthenticatedRequest extends FastifyRequest {
    userId?: string;
}
export declare function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<string | null>;
export declare function requireAuthHook(request: FastifyRequest, reply: FastifyReply): Promise<void>;
//# sourceMappingURL=clerkAuth.d.ts.map