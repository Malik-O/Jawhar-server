import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICourse extends Document {
  sheikhId: string;
  title: string;
  description: string;
  coverImage: string;
  category: string;
  lectures: Types.ObjectId[];
  enrolledStudents: string[];
}

const courseSchema = new Schema<ICourse>(
  {
    sheikhId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    coverImage: { type: String, default: '' },
    category: { type: String, default: '' },
    lectures: [{ type: Schema.Types.ObjectId, ref: 'Lecture' }],
    enrolledStudents: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Course = mongoose.model<ICourse>('Course', courseSchema);
