import mongoose, { Document, Types } from 'mongoose';
export interface ICourse extends Document {
    sheikhId: string;
    title: string;
    description: string;
    coverImage: string;
    category: string;
    lectures: Types.ObjectId[];
    enrolledStudents: string[];
}
export declare const Course: mongoose.Model<ICourse, {}, {}, {}, mongoose.Document<unknown, {}, ICourse, {}, {}> & ICourse & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Course.d.ts.map