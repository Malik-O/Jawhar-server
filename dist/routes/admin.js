"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = adminRoutes;
const User_1 = require("../models/User");
const Course_1 = require("../models/Course");
const Lecture_1 = require("../models/Lecture");
const roleAuth_1 = require("../middleware/roleAuth");
async function adminRoutes(fastify) {
    fastify.get('/api/admin/pending-sheikhs', async (request, reply) => {
        if (!await (0, roleAuth_1.requireAdmin)(request, reply))
            return;
        const pending = await User_1.User.find({ sheikhStatus: 'pending' })
            .select('clerkId name bio profileImage createdAt').lean();
        return reply.send(pending);
    });
    fastify.patch('/api/admin/sheikhs/:clerkId/approve', async (request, reply) => {
        if (!await (0, roleAuth_1.requireAdmin)(request, reply))
            return;
        const user = await User_1.User.findOneAndUpdate({ clerkId: request.params.clerkId }, { $set: { role: 'sheikh', sheikhStatus: 'approved' } }, { new: true });
        if (!user)
            return reply.status(404).send({ error: 'المستخدم غير موجود' });
        return reply.send({ success: true, role: user.role, sheikhStatus: user.sheikhStatus });
    });
    fastify.patch('/api/admin/sheikhs/:clerkId/reject', async (request, reply) => {
        if (!await (0, roleAuth_1.requireAdmin)(request, reply))
            return;
        const user = await User_1.User.findOneAndUpdate({ clerkId: request.params.clerkId }, { $set: { sheikhStatus: 'rejected' } }, { new: true });
        if (!user)
            return reply.status(404).send({ error: 'المستخدم غير موجود' });
        return reply.send({ success: true, sheikhStatus: user.sheikhStatus });
    });
    fastify.get('/api/admin/stats', async (request, reply) => {
        if (!await (0, roleAuth_1.requireAdmin)(request, reply))
            return;
        const [users, sheikhs, pending, courses, lectures] = await Promise.all([
            User_1.User.countDocuments({}),
            User_1.User.countDocuments({ role: 'sheikh' }),
            User_1.User.countDocuments({ sheikhStatus: 'pending' }),
            Course_1.Course.countDocuments({}),
            Lecture_1.Lecture.countDocuments({}),
        ]);
        return reply.send({ users, sheikhs, pending, courses, lectures });
    });
    fastify.get('/api/admin/users', async (request, reply) => {
        if (!await (0, roleAuth_1.requireAdmin)(request, reply))
            return;
        const page = parseInt(request.query.page || '1', 10);
        const limit = parseInt(request.query.limit || '20', 10);
        const role = request.query.role;
        const filter = {};
        if (role)
            filter.role = role;
        const skip = (page - 1) * limit;
        const [users, total] = await Promise.all([
            User_1.User.find(filter).select('clerkId name email role sheikhStatus createdAt').skip(skip).limit(limit).lean(),
            User_1.User.countDocuments(filter),
        ]);
        return reply.send({ users, total, page, pages: Math.ceil(total / limit) });
    });
    fastify.delete('/api/admin/users/:clerkId', async (request, reply) => {
        if (!await (0, roleAuth_1.requireAdmin)(request, reply))
            return;
        const deleted = await User_1.User.findOneAndDelete({ clerkId: request.params.clerkId });
        if (!deleted)
            return reply.status(404).send({ error: 'المستخدم غير موجود' });
        return reply.send({ success: true });
    });
}
//# sourceMappingURL=admin.js.map