import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config';

interface VocabularyWord {
    word: string;
    bangla: string;
    example: string;
}

export async function generateVocabularyWords(count: number = 10): Promise<VocabularyWord[]> {
    try {
        const genAI = new GoogleGenerativeAI(config.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `Generate ${count} English vocabulary words suitable for students learning English. 
For each word, provide:
1. The English word
2. Bangla meaning (বাংলা অর্থ)
3. An example sentence using the word

Important:
- Choose useful, common English words at intermediate level
- Provide accurate Bangla translations
- Make example sentences clear and educational
- Avoid words already in common use

Format your response as a JSON array with this exact structure:
[
  {
    "word": "Example",
    "bangla": "উদাহরণ",
    "example": "This is an example sentence."
  }
]

Return ONLY the JSON array, no other text.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Extract JSON from response
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('Invalid AI response format');
        }

        const words: VocabularyWord[] = JSON.parse(jsonMatch[0]);

        // Validate the response
        if (!Array.isArray(words) || words.length === 0) {
            throw new Error('No words generated');
        }

        // Ensure all words have required fields
        const validWords = words.filter(w =>
            w.word && w.bangla && w.example &&
            typeof w.word === 'string' &&
            typeof w.bangla === 'string' &&
            typeof w.example === 'string'
        );

        console.log(`✅ Generated ${validWords.length} vocabulary words using AI`);
        return validWords;

    } catch (error) {
        console.error('❌ Error generating words with AI:', error);

        // Fallback: return some default words
        console.log('Using fallback vocabulary...');
        return getFallbackWords(count);
    }
}

function getFallbackWords(count: number): VocabularyWord[] {
    const fallback: VocabularyWord[] = [
        {
            word: "Adventure",
            bangla: "দুঃসাহসিক অভিযান",
            example: "Life is an adventure filled with surprises."
        },
        {
            word: "Brilliant",
            bangla: "উজ্জ্বল, প্রতিভাবান",
            example: "She came up with a brilliant solution."
        },
        {
            word: "Communicate",
            bangla: "যোগাযোগ করা, কথা বলা",
            example: "It's important to communicate clearly."
        },
        {
            word: "Discover",
            bangla: "আবিষ্কার করা, খুঁজে পাওয়া",
            example: "Scientists discover new things every day."
        },
        {
            word: "Explore",
            bangla: "অন্বেষণ করা, খোঁজা",
            example: "Let's explore new opportunities."
        },
        {
            word: "Fascinating",
            bangla: "মুগ্ধকর, আকর্ষণীয়",
            example: "The documentary was absolutely fascinating."
        },
        {
            word: "Grateful",
            bangla: "কৃতজ্ঞ, ধন্যবাদী",
            example: "I am grateful for your support."
        },
        {
            word: "Harmony",
            bangla: "সামঞ্জস্য, মিল",
            example: "They live together in perfect harmony."
        },
        {
            word: "Innovative",
            bangla: "উদ্ভাবনী, নতুনত্বপূর্ণ",
            example: "We need innovative solutions to solve this."
        },
        {
            word: "Journey",
            bangla: "যাত্রা, ভ্রমণ",
            example: "Education is a lifelong journey."
        }
    ];

    return fallback.slice(0, count);
}
