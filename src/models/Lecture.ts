import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILecture extends Document {
  sheikhId: string;
  courseId: Types.ObjectId | null;
  sessionId: Types.ObjectId;
  title: string;
  description: string;
  order: number;
  publicKey: string;
}

const lectureSchema = new Schema<ILecture>(
  {
    sheikhId: { type: String, required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
    publicKey: { type: String, unique: true, sparse: true, index: true },
  },
  { timestamps: true }
);

import crypto from 'crypto';
const generateId = (length = 6) => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
};

lectureSchema.pre('save', function (next) {
  if (this.isNew && !this.publicKey) {
    this.publicKey = generateId();
  }
  next();
});

export const Lecture = mongoose.model<ILecture>('Lecture', lectureSchema);
