/**
 * Quran Service — integrates with Al-Quran Cloud API (alquran.cloud)
 * to search for verses, fetch Uthmani text, and enrich <quran> tags
 * in the transcript with proper references.
 */

const API_BASE = 'https://api.alquran.cloud/v1';

export interface QuranVerse {
  ref: string;           // "2:255" format
  surah: number;
  ayah: number;
  surahName: string;     // Arabic name, e.g. "البقرة"
  uthmani: string;       // Uthmani script text
  transcriptText: string; // Original text from the transcript
}

export interface EnrichResult {
  enrichedTranscript: string;
  quranVerses: QuranVerse[];
}

// ──────────────────────────────────────────────
// Text normalization for matching
// ──────────────────────────────────────────────

/** Remove Arabic diacritics (tashkeel) and normalize characters for comparison */
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u0617-\u061A\u064B-\u0652\u0670\u0640]/g, '') // tashkeel + tatweel
    .replace(/[إأآا]/g, 'ا')                                   // normalize alef
    .replace(/ى/g, 'ي')                                        // normalize ya
    .replace(/ة/g, 'ه')                                        // normalize ta marbuta
    .replace(/[^\u0600-\u06FF\s]/g, '')                        // keep only Arabic + spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/** Calculate similarity ratio between two normalized strings */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = a.split(' ');
  const wordsB = b.split(' ');
  const setB = new Set(wordsB);
  let common = 0;
  for (const w of wordsA) {
    if (setB.has(w)) common++;
  }
  return common / Math.max(wordsA.length, wordsB.length);
}

// ──────────────────────────────────────────────
// API helpers
// ──────────────────────────────────────────────

interface ApiAyah {
  number: number;
  text: string;
  surah: { number: number; name: string; englishName: string };
  numberInSurah: number;
}

interface SearchResponse {
  code: number;
  data: {
    count: number;
    matches: ApiAyah[];
  };
}

interface AyahResponse {
  code: number;
  data: ApiAyah;
}

/** Clean surah name from API format "سُورَةُ البَقَرَة" → "البقرة" */
function cleanSurahName(name: string): string {
  return name
    .replace(/سُورَةُ?\s*/g, '')
    .replace(/[\u0617-\u061A\u064B-\u0652\u0670]/g, '')
    .trim();
}

/** Fetch a specific ayah in Uthmani script by surah:ayah */
async function fetchAyahUthmani(surah: number, ayah: number): Promise<ApiAyah | null> {
  try {
    const url = `${API_BASE}/ayah/${surah}:${ayah}/quran-uthmani`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as AyahResponse;
    if (json.code !== 200 || !json.data) return null;
    return json.data;
  } catch (err) {
    console.warn(`Failed to fetch ayah ${surah}:${ayah}:`, err);
    return null;
  }
}

/** Extract distinctive keywords from verse text for API search */
function extractKeywords(text: string): string {
  const stopWords = new Set([
    'و', 'في', 'من', 'الى', 'إلى', 'على', 'عن', 'مع', 'ال', 'هو', 'هي',
    'ما', 'لا', 'إن', 'أن', 'كان', 'قد', 'ثم', 'أو', 'بل', 'إلا', 'لم',
    'لن', 'إذا', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'الذين', 'اللاتي',
    'هم', 'هم', 'هن', 'انا', 'أنا', 'نحن', 'انت', 'أنت', 'أنتم',
    'في', 'من', 'على', 'إلى', 'عن', 'مع', 'بين', 'حتى', 'كل', 'بعض',
    'قال', 'قالت', 'يقول', 'قالوا',
  ]);

  const words = normalizeArabic(text).split(' ').filter(w => w.length > 2 && !stopWords.has(w));
  return words.slice(0, 4).join(' ');
}

/** Search the Al-Quran Cloud API for a verse by text */
async function searchVerse(verseText: string): Promise<ApiAyah | null> {
  const keywords = extractKeywords(verseText);
  if (!keywords) return null;

  try {
    const url = `${API_BASE}/search/${encodeURIComponent(keywords)}/all/ar`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as SearchResponse;
    if (json.code !== 200 || !json.data?.matches?.length) return null;

    // Find best match by similarity
    const normalizedInput = normalizeArabic(verseText);
    let bestMatch: ApiAyah | null = null;
    let bestScore = 0;

    for (const match of json.data.matches) {
      const normalizedMatch = normalizeArabic(match.text);
      const score = similarity(normalizedInput, normalizedMatch);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = match;
      }
    }

    // Only accept if similarity is reasonable
    if (bestMatch && bestScore > 0.3) {
      return bestMatch;
    }

    return null;
  } catch (err) {
    console.warn(`Search failed for "${keywords}":`, err);
    return null;
  }
}

// ──────────────────────────────────────────────
// Tag parsing & enrichment
// ──────────────────────────────────────────────

interface ParsedQuranTag {
  fullMatch: string;       // The entire <quran ...>...</quran> string
  content: string;         // Text between tags
  surah: number | null;    // From attribute (if LLM provided)
  ayah: number | null;     // From attribute (if LLM provided)
  ref: string | null;      // From ref attribute (if already enriched)
}

/** Parse all <quran> tags from the transcript */
function parseQuranTags(transcript: string): ParsedQuranTag[] {
  const regex = /<quran\b([^>]*)>([\s\S]*?)<\/quran>/gi;
  const tags: ParsedQuranTag[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(transcript)) !== null) {
    const attrs = match[1] || '';
    const content = match[2] || '';

    const surahMatch = attrs.match(/surah\s*=\s*["']?(\d+)["']?/i);
    const ayahMatch = attrs.match(/ayah\s*=\s*["']?(\d+)["']?/i);
    const refMatch = attrs.match(/ref\s*=\s*["']?([^"'\s>]+)["']?/i);

    tags.push({
      fullMatch: match[0],
      content: content.trim(),
      surah: surahMatch ? parseInt(surahMatch[1], 10) : null,
      ayah: ayahMatch ? parseInt(ayahMatch[1], 10) : null,
      ref: refMatch ? refMatch[1] : null,
    });
  }

  return tags;
}

/**
 * Enrich all <quran> tags in the transcript with verse metadata.
 * - If the LLM provided surah/ayah, fetch Uthmani text directly.
 * - Otherwise, search the Al-Quran Cloud API by verse text.
 * - Enriched tags get a ref="surah:ayah" attribute.
 * - Returns the enriched transcript + array of verse metadata.
 */
export async function enrichQuranTags(transcript: string): Promise<EnrichResult> {
  const tags = parseQuranTags(transcript);
  const quranVerses: QuranVerse[] = [];
  let enrichedTranscript = transcript;

  for (const tag of tags) {
    // Skip if already enriched with a valid ref
    if (tag.ref) {
      const [s, a] = tag.ref.split(':').map(Number);
      if (s > 0 && a > 0) {
        const ayahData = await fetchAyahUthmani(s, a);
        if (ayahData) {
          quranVerses.push({
            ref: tag.ref,
            surah: s,
            ayah: a,
            surahName: cleanSurahName(ayahData.surah.name),
            uthmani: ayahData.text,
            transcriptText: tag.content,
          });
        }
        continue;
      }
    }

    let ayahData: ApiAyah | null = null;

    // Strategy 1: Use LLM-provided surah/ayah
    if (tag.surah && tag.surah > 0 && tag.ayah && tag.ayah > 0) {
      ayahData = await fetchAyahUthmani(tag.surah, tag.ayah);
    }

    // Strategy 2: Search by verse text
    if (!ayahData && tag.content) {
      ayahData = await searchVerse(tag.content);
    }

    if (!ayahData) {
      console.warn(`Could not enrich Quran verse: "${tag.content.slice(0, 50)}..."`);
      continue;
    }

    const ref = `${ayahData.surah.number}:${ayahData.numberInSurah}`;
    const verse: QuranVerse = {
      ref,
      surah: ayahData.surah.number,
      ayah: ayahData.numberInSurah,
      surahName: cleanSurahName(ayahData.surah.name),
      uthmani: ayahData.text,
      transcriptText: tag.content,
    };
    quranVerses.push(verse);

    // Replace the tag with an enriched version
    const enrichedTag = `<quran ref="${ref}">${tag.content}</quran>`;
    enrichedTranscript = enrichedTranscript.replace(tag.fullMatch, enrichedTag);

    // Small delay to be respectful to the API
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`📖 Enriched ${quranVerses.length}/${tags.length} Quran verses`);
  return { enrichedTranscript, quranVerses };
}
