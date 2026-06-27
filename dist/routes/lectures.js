"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lectureRoutes = lectureRoutes;
const Lecture_1 = require("../models/Lecture");
const Course_1 = require("../models/Course");
const Session_1 = require("../models/Session");
const Progress_1 = require("../models/Progress");
const roleAuth_1 = require("../middleware/roleAuth");
const clerkAuth_1 = require("../middleware/clerkAuth");
async function lectureRoutes(fastify) {
    fastify.post('/api/lectures', async (request, reply) => {
        if (!await (0, roleAuth_1.requireSheikh)(request, reply))
            return;
        const body = request.body;
        const session = await Session_1.Session.findById(body.sessionId);
        if (!session)
            return reply.status(404).send({ error: 'الجلسة غير موجودة' });
        if (session.status !== 'summarized')
            return reply.status(400).send({ error: 'المعالجة لم تكتمل بعد' });
        const userId = request.userId;
        const count = await Lecture_1.Lecture.countDocuments({ courseId: body.courseId || null });
        const lecture = await Lecture_1.Lecture.create({
            sheikhId: userId,
            courseId: body.courseId || null,
            sessionId: body.sessionId,
            title: body.title,
            description: body.description || '',
            order: count,
        });
        session.lectureId = lecture._id;
        await session.save();
        if (body.courseId) {
            await Course_1.Course.findByIdAndUpdate(body.courseId, { $addToSet: { lectures: lecture._id } });
        }
        return reply.status(201).send(lecture);
    });
    fastify.get('/api/lectures/:id', async (request, reply) => {
        const lecture = await Lecture_1.Lecture.findById(request.params.id).lean();
        if (!lecture)
            return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
        const session = await Session_1.Session.findById(lecture.sessionId).lean();
        return reply.send({ ...lecture, session });
    });
    fastify.get('/api/lectures/:id/public', async (request, reply) => {
        const lecture = await Lecture_1.Lecture.findById(request.params.id).lean();
        if (!lecture)
            return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
        const session = await Session_1.Session.findById(lecture.sessionId)
            .select('title summary keyPoints transcript quranVerses duration').lean();
        return reply.send({ ...lecture, session });
    });
    fastify.patch('/api/lectures/:id', async (request, reply) => {
        if (!await (0, roleAuth_1.requireSheikh)(request, reply))
            return;
        const body = request.body;
        const lecture = await Lecture_1.Lecture.findById(request.params.id);
        if (!lecture)
            return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
        if (lecture.sheikhId !== request.userId) {
            return reply.status(403).send({ error: 'غير مصرح بتعديل هذه المحاضرة' });
        }
        Object.assign(lecture, body);
        await lecture.save();
        return reply.send(lecture);
    });
    fastify.delete('/api/lectures/:id', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const user = await (0, roleAuth_1.getUserByClerkId)(userId);
        const lecture = await Lecture_1.Lecture.findById(request.params.id);
        if (!lecture)
            return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
        if (lecture.sheikhId !== userId && user?.role !== 'super_admin') {
            return reply.status(403).send({ error: 'غير مصرح بحذف هذه المحاضرة' });
        }
        if (lecture.courseId) {
            await Course_1.Course.findByIdAndUpdate(lecture.courseId, { $pull: { lectures: lecture._id } });
        }
        await Lecture_1.Lecture.findByIdAndDelete(request.params.id);
        return reply.send({ success: true });
    });
    fastify.post('/api/lectures/:id/complete', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const lecture = await Lecture_1.Lecture.findById(request.params.id);
        if (!lecture)
            return reply.status(404).send({ error: 'المحاضرة غير موجودة' });
        await Progress_1.Progress.findOneAndUpdate({ studentId: userId, lectureId: lecture._id }, { $set: { completed: true, completedAt: new Date(), courseId: lecture.courseId } }, { upsert: true });
        return reply.send({ success: true, completed: true });
    });
    fastify.get('/api/lectures/:id/progress', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const progress = await Progress_1.Progress.findOne({ studentId: userId, lectureId: request.params.id }).lean();
        return reply.send({ completed: !!progress?.completed });
    });
}
//# sourceMappingURL=lectures.js.map