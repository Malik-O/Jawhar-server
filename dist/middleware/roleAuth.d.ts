import { FastifyRequest, FastifyReply } from 'fastify';
export declare function getUserByClerkId(clerkId: string): Promise<(import("mongoose").Document<unknown, {}, import("../models/User").IUser, {}, {}> & import("../models/User").IUser & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}) | null>;
export declare function syncUser(clerkId: string, email: string, name: string): Promise<import("mongoose").Document<unknown, {}, import("../models/User").IUser, {}, {}> & import("../models/User").IUser & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}>;
export declare function requireSheikh(request: FastifyRequest, reply: FastifyReply): Promise<boolean>;
export declare function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<boolean>;
//# sourceMappingURL=roleAuth.d.ts.map