"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = userRoutes;
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
const User_1 = require("../models/User");
const clerkAuth_1 = require("../middleware/clerkAuth");
const roleAuth_1 = require("../middleware/roleAuth");
async function userRoutes(fastify) {
    fastify.post('/api/users/sync', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        try {
            const clerkUser = await clerk_sdk_node_1.clerkClient.users.getUser(userId);
            const email = clerkUser.emailAddresses[0]?.emailAddress || '';
            const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 'مستخدم';
            const user = await (0, roleAuth_1.syncUser)(userId, email, name);
            return reply.send(user);
        }
        catch (error) {
            return reply.status(500).send({ error: 'فشل مزامنة المستخدم' });
        }
    });
    fastify.get('/api/users/me', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const user = await (0, roleAuth_1.getUserByClerkId)(userId);
        if (!user)
            return reply.status(404).send({ error: 'المستخدم غير موجود' });
        return reply.send(user);
    });
    fastify.patch('/api/users/me', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const body = request.body;
        const user = await User_1.User.findOneAndUpdate({ clerkId: userId }, { $set: { bio: body.bio, profileImage: body.profileImage, coverImage: body.coverImage, name: body.name } }, { new: true });
        if (!user)
            return reply.status(404).send({ error: 'المستخدم غير موجود' });
        return reply.send(user);
    });
    fastify.get('/api/users/:clerkId', async (request, reply) => {
        const user = await User_1.User.findOne({ clerkId: request.params.clerkId })
            .select('-email -__v').lean();
        if (!user)
            return reply.status(404).send({ error: 'المستخدم غير موجود' });
        return reply.send(user);
    });
    fastify.post('/api/users/:clerkId/follow', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const targetId = request.params.clerkId;
        if (userId === targetId)
            return reply.status(400).send({ error: 'لا يمكن متابعة نفسك' });
        await User_1.User.updateOne({ clerkId: userId }, { $addToSet: { following: targetId } });
        await User_1.User.updateOne({ clerkId: targetId }, { $addToSet: { followers: userId } });
        return reply.send({ success: true });
    });
    fastify.delete('/api/users/:clerkId/follow', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const targetId = request.params.clerkId;
        await User_1.User.updateOne({ clerkId: userId }, { $pull: { following: targetId } });
        await User_1.User.updateOne({ clerkId: targetId }, { $pull: { followers: userId } });
        return reply.send({ success: true });
    });
    fastify.post('/api/users/request-sheikh', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const user = await User_1.User.findOneAndUpdate({ clerkId: userId, role: 'student', sheikhStatus: { $in: ['none', 'rejected'] } }, { $set: { sheikhStatus: 'pending' } }, { new: true });
        if (!user)
            return reply.status(400).send({ error: 'لا يمكن تقديم طلب حالياً' });
        return reply.send({ success: true, sheikhStatus: 'pending' });
    });
}
//# sourceMappingURL=users.js.map