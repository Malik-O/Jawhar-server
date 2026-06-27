import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICourse extends Document {
  sheikhId: string;
  title: string;
  description: string;
  coverImage: string;
  category: string;
  lectures: Types.ObjectId[];
  enrolledStudents: string[];
  publicKey: string;
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
    publicKey: { type: String, unique: true, sparse: true, index: true },
  },
  { timestamps: true }
);

import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 6);

courseSchema.pre('save', function (next) {
  if (this.isNew && !this.publicKey) {
    this.publicKey = nanoid();
  }
  next();
});

export const Course = mongoose.model<ICourse>('Course', courseSchema);
