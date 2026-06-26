import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProgress extends Document {
  studentId: string;
  courseId: Types.ObjectId;
  lectureId: Types.ObjectId;
  completed: boolean;
  completedAt: Date | null;
}

const progressSchema = new Schema<IProgress>(
  {
    studentId: { type: String, required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    lectureId: { type: Schema.Types.ObjectId, ref: 'Lecture', required: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

progressSchema.index({ studentId: 1, lectureId: 1 }, { unique: true });

export const Progress = mongoose.model<IProgress>('Progress', progressSchema);
