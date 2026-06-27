"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUploadDir = ensureUploadDir;
exports.getTempFilePath = getTempFilePath;
exports.cleanupFile = cleanupFile;
exports.getFileCategory = getFileCategory;
exports.getAudioMimeType = getAudioMimeType;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const env_1 = require("../config/env");
/** Ensures the uploads directory exists */
function ensureUploadDir() {
    if (!fs_1.default.existsSync(env_1.envConfig.uploadDir)) {
        fs_1.default.mkdirSync(env_1.envConfig.uploadDir, { recursive: true });
    }
}
/** Generates a unique temp file path with the given extension */
function getTempFilePath(extension) {
    const fileName = `${(0, uuid_1.v4)()}${extension}`;
    return path_1.default.join(env_1.envConfig.uploadDir, fileName);
}
/** Safely deletes a file if it exists */
function cleanupFile(filePath) {
    try {
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
    }
    catch (error) {
        console.warn(`Failed to cleanup file: ${filePath}`, error);
    }
}
/** Detects file type based on extension */
function getFileCategory(fileName) {
    const videoExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv'];
    const ext = path_1.default.extname(fileName).toLowerCase();
    return videoExtensions.includes(ext) ? 'video' : 'audio';
}
/** Gets the MIME type for audio files sent to Gemini */
function getAudioMimeType(filePath) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    const mimeMap = {
        '.mp3': 'audio/mp3',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.flac': 'audio/flac',
        '.wma': 'audio/x-ms-wma',
    };
    return mimeMap[ext] || 'audio/mp3';
}
//# sourceMappingURL=fileManager.js.map