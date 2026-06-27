"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sheikhRoutes = sheikhRoutes;
const User_1 = require("../models/User");
const Course_1 = require("../models/Course");
async function sheikhRoutes(fastify) {
    fastify.get('/api/sheikhs', async (request, reply) => {
        const page = parseInt(request.query.page || '1', 10);
        const limit = parseInt(request.query.limit || '12', 10);
        const search = request.query.search || '';
        const filter = { role: 'sheikh', sheikhStatus: 'approved' };
        if (search)
            filter.name = { $regex: search, $options: 'i' };
        const skip = (page - 1) * limit;
        const [sheikhs, total] = await Promise.all([
            User_1.User.find(filter).select('clerkId name bio profileImage followers').skip(skip).limit(limit).lean(),
            User_1.User.countDocuments(filter),
        ]);
        return reply.send({ sheikhs, total, page, pages: Math.ceil(total / limit) });
    });
    fastify.get('/api/sheikhs/:clerkId/public', async (request, reply) => {
        const user = await User_1.User.findOne({ clerkId: request.params.clerkId, sheikhStatus: 'approved' })
            .select('clerkId name bio profileImage coverImage followers').lean();
        if (!user)
            return reply.status(404).send({ error: 'الشيخ غير موجود' });
        const courses = await Course_1.Course.find({ sheikhId: request.params.clerkId })
            .select('title description coverImage category').lean();
        return reply.send({ ...user, courses });
    });
}
//# sourceMappingURL=sheikhs.js.map