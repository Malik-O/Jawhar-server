"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireAuthHook = requireAuthHook;
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
const env_1 = require("../config/env");
async function requireAuth(request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        reply.status(401).send({ error: 'غير مصرح — يجب تسجيل الدخول' });
        return null;
    }
    const token = authHeader.substring(7);
    try {
        const payload = await (0, clerk_sdk_node_1.verifyToken)(token, {
            secretKey: env_1.envConfig.clerkSecretKey,
            issuer: '',
            audience: '',
            authorizedParties: [],
            clockSkewInSeconds: 5,
            clockSkewInMs: 5000,
        });
        if (!payload.sub) {
            reply.status(401).send({ error: 'رمز غير صالح' });
            return null;
        }
        return payload.sub;
    }
    catch {
        reply.status(401).send({ error: 'فشل التحقق من الهوية' });
        return null;
    }
}
async function requireAuthHook(request, reply) {
    const userId = await requireAuth(request, reply);
    if (userId) {
        request.userId = userId;
    }
}
//# sourceMappingURL=clerkAuth.js.map