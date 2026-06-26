import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILecture extends Document {
  sheikhId: string;
  courseId: Types.ObjectId | null;
  sessionId: Types.ObjectId;
  title: string;
  description: string;
  order: number;
}

const lectureSchema = new Schema<ILecture>(
  {
    sheikhId: { type: String, required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Lecture = mongoose.model<ILecture>('Lecture', lectureSchema);
