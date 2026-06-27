"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAudio = extractAudio;
exports.getAudioDuration = getAudioDuration;
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const fileManager_1 = require("./fileManager");
// Point fluent-ffmpeg to the bundled binary
if (ffmpeg_static_1.default) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
}
/**
 * Extracts audio from a video file, or returns the path as-is for audio files.
 * Uses ffmpeg-static so no manual FFmpeg install is needed.
 */
async function extractAudio(inputPath, originalFileName) {
    const category = (0, fileManager_1.getFileCategory)(originalFileName);
    if (category === 'audio') {
        return { audioPath: inputPath, needsCleanup: false };
    }
    const outputPath = (0, fileManager_1.getTempFilePath)('.mp3');
    return new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(inputPath)
            .noVideo()
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .audioChannels(1)
            .audioFrequency(16000)
            .on('start', (cmd) => {
            console.log(`🎬 Extracting audio: ${cmd}`);
        })
            .on('end', () => {
            console.log('✅ Audio extraction complete');
            resolve({ audioPath: outputPath, needsCleanup: true });
        })
            .on('error', (err) => {
            console.error('❌ FFmpeg error:', err.message);
            reject(new Error(`Audio extraction failed: ${err.message}`));
        })
            .save(outputPath);
    });
}
/**
 * Gets audio duration in seconds using ffprobe.
 */
function getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
        fluent_ffmpeg_1.default.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(new Error(`Failed to get duration: ${err.message}`));
                return;
            }
            resolve(metadata.format.duration || 0);
        });
    });
}
//# sourceMappingURL=audioExtractor.js.map