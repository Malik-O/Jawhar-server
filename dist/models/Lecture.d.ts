import mongoose, { Document, Types } from 'mongoose';
export interface ILecture extends Document {
    sheikhId: string;
    courseId: Types.ObjectId | null;
    sessionId: Types.ObjectId;
    title: string;
    description: string;
    order: number;
}
export declare const Lecture: mongoose.Model<ILecture, {}, {}, {}, mongoose.Document<unknown, {}, ILecture, {}, {}> & ILecture & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Lecture.d.ts.map