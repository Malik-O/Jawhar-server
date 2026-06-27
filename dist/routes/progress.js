"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.progressRoutes = progressRoutes;
const Progress_1 = require("../models/Progress");
const Course_1 = require("../models/Course");
const clerkAuth_1 = require("../middleware/clerkAuth");
async function progressRoutes(fastify) {
    fastify.get('/api/progress/course/:courseId', async (request, reply) => {
        const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
        if (!userId)
            return;
        const course = await Course_1.Course.findById(request.params.courseId).lean();
        if (!course)
            return reply.status(404).send({ error: 'الدورة غير موجودة' });
        const progress = await Progress_1.Progress.find({
            studentId: userId,
            courseId: request.params.courseId,
        }).lean();
        const completed = progress.filter(p => p.completed).length;
        const total = course.lectures.length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        return reply.send({
            completed,
            total,
            percent,
            lectures: progress.map(p => ({ lectureId: String(p.lectureId), completed: p.completed })),
        });
    });
}
//# sourceMappingURL=progress.js.map