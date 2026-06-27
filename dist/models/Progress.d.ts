import mongoose, { Document, Types } from 'mongoose';
export interface IProgress extends Document {
    studentId: string;
    courseId: Types.ObjectId;
    lectureId: Types.ObjectId;
    completed: boolean;
    completedAt: Date | null;
}
export declare const Progress: mongoose.Model<IProgress, {}, {}, {}, mongoose.Document<unknown, {}, IProgress, {}, {}> & IProgress & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Progress.d.ts.map