"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.courseRoutes = courseRoutes;
const Course_1 = require("../models/Course");
const roleAuth_1 = require("../middleware/roleAuth");
const clerkAuth_1 = require("../middleware/clerkAuth");
async function courseRoutes(fastify) {
    fastify.post('/api/courses', async (request, reply) => {
        if (!await (0, roleAuth_1.requireSheikh)(request, reply))
            return;
        const body = request.body;
        const course = await Course_1.Course.create({
            sheikhId: request.userId,
            title: body.title,
            description: body.description || '',
            coverImage: body.coverImage || '',
            category: body.category || '',
        });
        return reply.status(201).send(course);
    });
    fastify.get('/api/courses', async (request, reply) => {
        const { sheikhId, category } = request.query;
        const page = parseInt(request.query.page || '1', 10);
        const limit = parseInt(request.query.limit || '12', 10);
        const filter = {};
        if (sheikhId)
            filter.sheikhId = sheikhId;
        if (category)
            filter.category = category;
        const skip = (page - 1) * limit;
        const [courses, total] = await Promise.all([
            Course_1.Course.find(filter).populate('lectures', 'title order').skip(skip).limit(limit).lean(),
            Course_1.Course.countDocuments(filter),
        ]);
        return reply.send({ courses, total, page, pages: Math.ceil(total / limit) });
    });
    fastify.get('/api/courses/:id', async (request, reply) => {
        const course = await Course_1.Course.findById(request.params.id).populate('lectures').lean();
        if (!course)
            return reply.status(404).send({ error: 'الدورة غير موجودة' });
        return reply.send(course);
    });
    fastify.get('/api/courses/:id/public', async (request, reply) => {
        const course = await Course_1.Course.findById(request.params.id).populate('lectures', 'title order description').lean();
        if (!course)
            return reply.status(404).send({ error: 'الدورة غير موجودة' });
        return reply.send(course);
    });
    fastify.patch('/api/courses/:id', async (request, reply) => {
        if (!await (0, roleAuth_1.requireSheikh)(request, reply))
            return;
        const body = request.body;
        const course = await Course_1.Course.findById(request.params.id);
        if (!course)
            return reply.status(404).send({ error: 'الدورة غير موجودة' });
        if (course.sheikhId !== request.userId) {
            return reply.status(403).send({ error: 'غير مصرح بتعديل هذه الدورة' });
        }
        Object.assign(course, body);
        await course.save();
        return reply.send(course);
    });
    fastify.delete('/api/courses/:id', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const user = await (0, roleAuth_1.getUserByClerkId)(userId);
        const course = await Course_1.Course.findById(request.params.id);
        if (!course)
            return reply.status(404).send({ error: 'الدورة غير موجودة' });
        if (course.sheikhId !== userId && user?.role !== 'super_admin') {
            return reply.status(403).send({ error: 'غير مصرح بحذف هذه الدورة' });
        }
        await Course_1.Course.findByIdAndDelete(request.params.id);
        return reply.send({ success: true });
    });
    fastify.post('/api/courses/:id/enroll', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const course = await Course_1.Course.findByIdAndUpdate(request.params.id, { $addToSet: { enrolledStudents: userId } }, { new: true });
        if (!course)
            return reply.status(404).send({ error: 'الدورة غير موجودة' });
        return reply.send({ success: true, enrolled: true });
    });
}
//# sourceMappingURL=courses.js.map