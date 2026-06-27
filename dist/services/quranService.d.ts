/**
 * Quran Service — integrates with Al-Quran Cloud API (alquran.cloud)
 * to search for verses, fetch Uthmani text, and enrich <quran> tags
 * in the transcript with proper references.
 */
export interface QuranVerse {
    ref: string;
    surah: number;
    ayah: number;
    surahName: string;
    uthmani: string;
    transcriptText: string;
}
export interface EnrichResult {
    enrichedTranscript: string;
    quranVerses: QuranVerse[];
}
/**
 * Enrich all <quran> tags in the transcript with verse metadata.
 * - If the LLM provided surah/ayah, fetch Uthmani text directly.
 * - Otherwise, search the Al-Quran Cloud API by verse text.
 * - Enriched tags get a ref="surah:ayah" attribute.
 * - Returns the enriched transcript + array of verse metadata.
 */
export declare function enrichQuranTags(transcript: string): Promise<EnrichResult>;
//# sourceMappingURL=quranService.d.ts.map