import mongoose, { Document } from 'mongoose';
export type UserRole = 'student' | 'sheikh' | 'super_admin';
export type SheikhStatus = 'none' | 'pending' | 'approved' | 'rejected';
export interface IUser extends Document {
    clerkId: string;
    email: string;
    name: string;
    role: UserRole;
    sheikhStatus: SheikhStatus;
    bio: string;
    profileImage: string;
    coverImage: string;
    followers: string[];
    following: string[];
}
export declare const User: mongoose.Model<IUser, {}, {}, {}, mongoose.Document<unknown, {}, IUser, {}, {}> & IUser & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=User.d.ts.map