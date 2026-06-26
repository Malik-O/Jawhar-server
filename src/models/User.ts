import mongoose, { Schema, Document } from 'mongoose';

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

const userSchema = new Schema<IUser>(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    name: { type: String, required: true, default: '' },
    role: { type: String, enum: ['student', 'sheikh', 'super_admin'], default: 'student' },
    sheikhStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    bio: { type: String, default: '' },
    profileImage: { type: String, default: '' },
    coverImage: { type: String, default: '' },
    followers: { type: [String], default: [] },
    following: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
