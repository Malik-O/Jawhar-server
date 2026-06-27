"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserByClerkId = getUserByClerkId;
exports.syncUser = syncUser;
exports.requireSheikh = requireSheikh;
exports.requireAdmin = requireAdmin;
const User_1 = require("../models/User");
const env_1 = require("../config/env");
const clerkAuth_1 = require("./clerkAuth");
async function getUserByClerkId(clerkId) {
    return User_1.User.findOne({ clerkId });
}
async function syncUser(clerkId, email, name) {
    const isSuperAdmin = clerkId === env_1.envConfig.clerkSuperAdminId;
    const role = isSuperAdmin ? 'super_admin' : 'student';
    const sheikhStatus = isSuperAdmin ? 'approved' : 'none';
    return User_1.User.findOneAndUpdate({ clerkId }, { $setOnInsert: { clerkId, email, name, role, sheikhStatus } }, { upsert: true, new: true });
}
async function requireSheikh(request, reply) {
    const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
    if (!userId)
        return false;
    const user = await getUserByClerkId(userId);
    if (!user || user.role !== 'sheikh' || user.sheikhStatus !== 'approved') {
        reply.status(403).send({ error: 'هذه الميزة مخصصة للشيوخ المعتمدين فقط' });
        return false;
    }
    request.userId = userId;
    return true;
}
async function requireAdmin(request, reply) {
    const userId = await (0, clerkAuth_1.requireAuth)(request, reply);
    if (!userId)
        return false;
    const user = await getUserByClerkId(userId);
    if (!user || user.role !== 'super_admin') {
        reply.status(403).send({ error: 'هذه الميزة مخصصة للمشرفين فقط' });
        return false;
    }
    request.userId = userId;
    return true;
}
//# sourceMappingURL=roleAuth.js.map