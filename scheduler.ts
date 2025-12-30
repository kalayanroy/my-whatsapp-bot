import cron from 'node-cron';
import { promises as fs } from 'fs';
import path from 'path';
import { config } from './config';
import { generateVocabularyWords } from './wordGenerator';

export function startVocabularyScheduler() {
    if (!config.schedulerEnabled) {
        console.log('📅 Vocabulary scheduler is disabled');
        return;
    }

    console.log(`📅 Vocabulary scheduler started - will run at: ${config.scheduleTime}`);
    console.log(`📚 Generating ${config.wordsPerDay} words per day`);

    // Schedule the daily task
    cron.schedule(config.scheduleTime, async () => {
        console.log('\n🤖 Running scheduled vocabulary generation...');
        await addWordsToDatabase(config.wordsPerDay);
    });

    // Also run once on startup (for testing)
    console.log('🔄 Running initial vocabulary generation...');
    setTimeout(() => {
        addWordsToDatabase(5); // Generate 5 words on startup
    }, 5000); // Wait 5 seconds after bot starts
}

export async function addWordsToDatabase(count: number): Promise<boolean> {
    try {
        console.log(`\n📝 Generating ${count} new vocabulary words...`);

        // Generate words using AI
        const newWords = await generateVocabularyWords(count);

        if (newWords.length === 0) {
            console.log('❌ No words generated');
            return false;
        }

        // Read current database file
        const dbPath = path.join(__dirname, 'database.ts');
        let fileContent = await fs.readFile(dbPath, 'utf-8');

        // Extract existing words to prevent duplicates
        const existingWords = new Set<string>();
        const wordMatches = fileContent.matchAll(/word:\s*"([^"]+)"/g);
        for (const match of wordMatches) {
            existingWords.add(match[1].toLowerCase().trim());
        }

        console.log(`🔍 Checking against ${existingWords.size} existing words...`);

        // Filter out duplicates (case-insensitive)
        const uniqueWords = newWords.filter(w => !existingWords.has(w.word.toLowerCase().trim()));

        if (uniqueWords.length === 0) {
            console.log('⚠️ All generated words already exist in database. Skipping addition.');
            return false;
        }

        if (uniqueWords.length < newWords.length) {
            console.log(`⚠️ Skipped ${newWords.length - uniqueWords.length} duplicate words.`);
        }

        // Find the position to insert new words (before the closing ]; of the last array)
        // Since vocabularyDatabase is at the end of the file, lastIndexOf('];') is safe.
        const insertPosition = fileContent.lastIndexOf('];');

        if (insertPosition === -1) {
            console.log('❌ Could not find insertion point in database.ts');
            return false;
        }

        // Format new words as TypeScript code
        let newWordsCode = '';
        for (const word of uniqueWords) {
            newWordsCode += `    {\n`;
            newWordsCode += `        word: "${word.word}",\n`;
            newWordsCode += `        bangla: "${word.bangla}",\n`;
            newWordsCode += `        example: "${word.example}"\n`;
            newWordsCode += `    },\n`;
        }

        // Insert new words before the closing bracket
        const beforeInsert = fileContent.substring(0, insertPosition);
        const afterInsert = fileContent.substring(insertPosition);

        // Check if there's already a comma before the closing bracket
        const trimmedBefore = beforeInsert.trimEnd();
        const needsComma = !trimmedBefore.endsWith(',');

        fileContent = beforeInsert + (needsComma ? ',' : '') + '\n' + newWordsCode + afterInsert;

        // Backup the original file
        const backupPath = path.join(__dirname, 'database.backup.ts');
        await fs.writeFile(backupPath, await fs.readFile(dbPath, 'utf-8'));

        // Write updated content
        await fs.writeFile(dbPath, fileContent, 'utf-8');

        console.log(`✅ Successfully added ${uniqueWords.length} words to database.ts`);
        console.log('📋 New words:');
        uniqueWords.forEach((w, i) => {
            console.log(`   ${i + 1}. ${w.word} - ${w.bangla}`);
        });

        return true;

    } catch (error) {
        console.error('❌ Error adding words to database:', error);
        return false;
    }
}

// Function to get current word count
export async function getWordCount(): Promise<number> {
    try {
        const dbPath = path.join(__dirname, 'database.ts');
        const fileContent = await fs.readFile(dbPath, 'utf-8');

        // Count occurrences of "word:" in the file
        const matches = fileContent.match(/word:/g);
        return matches ? matches.length : 0;
    } catch (error) {
        console.error('Error counting words:', error);
        return 0;
    }
}
