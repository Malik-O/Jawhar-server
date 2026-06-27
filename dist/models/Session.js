"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const sessionSchema = new mongoose_1.Schema({
    originalFileName: { type: String, required: true },
    fileType: { type: String, enum: ['audio', 'video'], required: true },
    status: { type: String, enum: ['uploaded', 'extracted', 'transcribed', 'enriched', 'summarized', 'failed'], default: 'uploaded' },
    failedAt: { type: String, default: '' },
    tempFilePath: { type: String, default: '' },
    audioPath: { type: String, default: '' },
    title: { type: String, default: '' },
    transcript: { type: String, default: '' },
    rawTranscript: { type: String, default: '' },
    words: [{ word: String, start: Number, end: Number, speaker: String }],
    speakerSegments: [{
            speaker: String,
            start: Number,
            end: Number,
            text: String,
        }],
    duration: { type: Number, default: 0 },
    summary: { type: String, default: '' },
    keyPoints: { type: [String], default: [] },
    quranVerses: [{
            ref: String,
            surah: Number,
            ayah: Number,
            surahName: String,
            uthmani: String,
            transcriptText: String,
        }],
    archived: { type: Boolean, default: false },
    sheikhId: { type: String, default: '', index: true },
    lectureId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lecture', default: null },
}, {
    timestamps: true,
});
exports.Session = mongoose_1.default.model('Session', sessionSchema);
//# sourceMappingURL=Session.js.map