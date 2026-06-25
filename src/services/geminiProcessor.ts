import Groq from 'groq-sdk';
import { envConfig } from '../config/env';

const groq = new Groq({ apiKey: envConfig.groqApiKey });

export interface SummaryResult {
  title: string;
  summary: string;
  keyPoints: string[];
}

/**
 * Free Groq models in priority order.
 * When one hits a rate limit, the next is tried automatically.
 * All are free-tier on console.groq.com.
 */
const FREE_MODELS = [
  'llama-3.3-70b-versatile',   // Best quality — 70B
  'llama3-70b-8192',           // Fallback 70B
  'llama-3.1-8b-instant',      // Fast 8B
  'llama3-8b-8192',            // Fallback 8B
  'gemma2-9b-it',              // Google Gemma 9B via Groq
  'mixtral-8x7b-32768',        // Mixtral — large context
];

const SYSTEM_PROMPT = `أنت مساعد أكاديمي متخصص في تلخيص المحاضرات الدينية والعلمية باللغة العربية.
تلقى نص محاضرة وتُنتج ملخصاً منظماً يفيد الطلاب.
أجب دائماً بـ JSON فقط بدون أي نص إضافي.`;

const buildUserPrompt = (transcript: string) =>
  `فيما يلي نص محاضرة مفرّغ من ملف صوتي. قم بمعالجته وأنتج:

1. **العنوان**: عنوان مناسب وموجز
2. **الملخص**: ملخص شامل ومنظم في فقرات واضحة باللغة العربية الفصحى
3. **النقاط الرئيسية**: أهم النقاط والفوائد مرتبةً حسب الأهمية

أعد الإجابة بتنسيق JSON فقط:
{
  "title": "عنوان المحاضرة",
  "summary": "الملخص...",
  "keyPoints": ["النقطة الأولى", "النقطة الثانية"]
}

--- نص المحاضرة ---
${transcript}`;

/** Returns true if this is a Groq rate-limit (429) error */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Groq.RateLimitError) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('429') ||
    msg.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('Too Many Requests');
}

/** Extracts JSON from model response, handles markdown fences */
function parseResponse(text: string): SummaryResult {
  let json = text.trim();

  const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) json = fenceMatch[1].trim();

  // Extract first {...} block in case the model added commentary
  const objMatch = json.match(/\{[\s\S]*\}/);
  if (objMatch) json = objMatch[0];

  try {
    const parsed = JSON.parse(json);
    return {
      title:     parsed.title     || 'محاضرة بدون عنوان',
      summary:   parsed.summary   || '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    };
  } catch {
    console.warn('Could not parse JSON response, using raw text as summary');
    return {
      title:     'محاضرة بدون عنوان',
      summary:   text,
      keyPoints: [],
    };
  }
}

/**
 * Summarizes a transcript using Groq LLMs.
 * Tries each free model in order — if one is rate-limited, moves to the next.
 * Throws only if ALL models fail.
 */
export async function summarizeWithGroq(transcript: string): Promise<SummaryResult> {
  const userPrompt = buildUserPrompt(transcript);
  const errors: string[] = [];

  for (const model of FREE_MODELS) {
    try {
      console.log(`Summarizing with Groq model: ${model}`);

      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt },
        ],
        temperature:  0.3,
        max_tokens:   4096,
        response_format: { type: 'json_object' },
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) throw new Error(`Model ${model} returned empty content`);

      const result = parseResponse(text);
      console.log(`Summarization complete using ${model}`);
      return result;

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (isRateLimitError(error)) {
        console.warn(`Rate limit on ${model}, trying next model...`);
        errors.push(`${model}: rate limited`);
        continue; // try next model
      }

      // Model-specific errors (context too long, unsupported, etc.) → try next
      if (msg.includes('context') || msg.includes('tokens') || msg.includes('model_not_found')) {
        console.warn(`Model ${model} failed (${msg.slice(0, 80)}), trying next...`);
        errors.push(`${model}: ${msg.slice(0, 80)}`);
        continue;
      }

      // Unexpected error — re-throw immediately
      throw error;
    }
  }

  // All models exhausted
  throw new Error(
    `فشل التلخيص: تم استنفاد حصة جميع النماذج المجانية المتاحة.\n` +
    `تفاصيل: ${errors.join(' | ')}\n` +
    `حاول مرة أخرى بعد دقيقة أو غيّر الـ GROQ_API_KEY.`
  );
}

const FIX_SYSTEM_PROMPT = `أنت خبير في التدقيق اللغوي وتنسيق النصوص الدينية والعلمية باللغة العربية.
تتلقى نصاً مفرغاً آلياً من ملف صوتي (Transcript). مهمتك الأساسية:
1. إصلاح الكلمات الخاطئة إملائياً أو سياقياً، خاصة الكلمات التي "تُسمع بشكل خاطئ" من قبل الذكاء الاصطناعي (مثل الكلمات المتشابهة صوتياً ولكنها خاطئة في السياق الديني/العلمي).
   يجب وضع أي كلمة قمت بتصحيحها داخل وسم: <fix original="الكلمة الأصلية الخاطئة">الكلمة الصحيحة</fix>
2. تحديد الآيات القرآنية بدقة ووضعها داخل وسم: <quran surah="رقم السورة" ayah="رقم الآية">الآية</quran>
   إذا كنت تعرف رقم السورة ورقم الآية، أضفهما في الوسم. إذا لم تكن متأكداً، اكتب surah="0" ayah="0".
3. تحديد الأحاديث النبوية بدقة ووضعها داخل وسم: <hadith>نص الحديث</hadith>
4. إضافة علامات الترقيم المناسبة: الفواصل (،)، النقاط (.)، علامات الاستفهام (؟)، علامات التعجب (!)، والنقطتان (:).
5. إضافة فواصل فقرات (سطر جديد واحد فقط \\n وليس سطرين) عند تغيير الموضوع أو انتقال المتحدث لنقطة جديدة.
6. استخدام النقاط (- ) عند تعداد نقاط.
تنبيه هام: حافظ على النص الأصلي كما هو ولا تقم بإعادة صياغة الجمل، فقط قم بتصحيح الأخطاء المسموعة والتنسيق وعلامات الترقيم.
تنبيه هام جداً: تأكد من وجود مسافات بين جميع الكلمات. لا تدمج الكلمات معاً بدون مسافات.
أعد النص المنسق بالكامل دون أي تعليقات إضافية.`;

/**
 * Fixes misheard words and formats the transcript using Groq models.
 */
export async function fixTranscript(transcript: string): Promise<string> {
  const userPrompt = `قم بتدقيق وتنسيق النص التالي بناءً على التعليمات:\n\n${transcript}`;
  const errors: string[] = [];

  for (const model of FREE_MODELS) {
    try {
      console.log(`Fixing transcript with Groq model: ${model}`);

      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: FIX_SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt },
        ],
        temperature:  0.2,
        max_tokens:   8192,
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) throw new Error(`Model ${model} returned empty content`);

      console.log(`Transcript formatting complete using ${model}`);
      return ensureSpacing(text);

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (isRateLimitError(error)) {
        console.warn(`Rate limit on ${model}, trying next model...`);
        errors.push(`${model}: rate limited`);
        continue;
      }

      if (msg.includes('context') || msg.includes('tokens') || msg.includes('model_not_found')) {
        console.warn(`Model ${model} failed (${msg.slice(0, 80)}), trying next...`);
        errors.push(`${model}: ${msg.slice(0, 80)}`);
        continue;
      }

      throw error;
    }
  }

  throw new Error(`فشل تصحيح النص: تم استنفاد جميع النماذج المتاحة.\nتفاصيل: ${errors.join(' | ')}`);
}

/**
 * Ensures proper spacing in the transcript text.
 * Fixes missing spaces after punctuation, around tags, and between words.
 */
function ensureSpacing(text: string): string {
  // Remove any markdown that some models add
  text = text.replace(/^```[a-z]*\n?/gi, '').replace(/\n?```$/g, '');

  // Ensure space after Arabic and Latin punctuation
  text = text.replace(/([،.؟!:؛,;])([^\s])/g, '$1 $2');

  // Ensure space before opening tags
  text = text.replace(/(\S)(<(?:fix|quran|hadith)\b)/g, '$1 $2');

  // Ensure space after closing tags
  text = text.replace(/(<\/(?:fix|quran|hadith)>)([^\s<])/g, '$1 $2');

  // Fix multiple consecutive spaces (but preserve newlines)
  text = text.replace(/[ \t]{2,}/g, ' ');

  // Ensure space after dash used for list items
  text = text.replace(/^-\s*/gm, '- ');

  return text.trim();
}

