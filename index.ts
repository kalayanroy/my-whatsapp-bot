import makeWASocket, { DisconnectReason, useMultiFileAuthState, ConnectionState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { config } from './config';
import pino from 'pino';
import * as qrcode from 'qrcode-terminal';
import { vocabularyDatabase, speakingTopics, tongueTwisters, translationSentences } from './database';
import { startVocabularyScheduler, addWordsToDatabase, getWordCount } from './scheduler';
import * as http from 'http';

const port = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
});

server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});

// Store active games per group
const activeGames = new Map<string, { secretNumber: number, maxNumber: number, attempts: number }>();

// Store active translation challenges per group
const activeTranslations = new Map<string, typeof translationSentences>();

type UniqueRandomResult = number | "All numbers generated complete";

function createUniqueRandom(min: number, max: number): () => UniqueRandomResult {
    let usedNumbers: number[] = [];

    return (): UniqueRandomResult => {
        if (usedNumbers.length === max - min + 1) {
            return "All numbers generated complete";
        }

        let num: number;
        do {
            num = Math.floor(Math.random() * (max - min + 1)) + min;
        } while (usedNumbers.includes(num));

        usedNumbers.push(num);
        return num;
    };
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionId);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Deprecated, using manual handling
        logger: pino({ level: 'silent' }) as any,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('opened connection');

            // Start vocabulary scheduler
            startVocabularyScheduler();
        }
    });

    sock.ev.on('messages.upsert', async (m: any) => {
        console.log(JSON.stringify(m, undefined, 2));

        const msg = m.messages[0];
        if (!msg.message) return; // Allow fromMe for testing

        const messageType = Object.keys(msg.message)[0];
        const text = messageType === 'conversation'
            ? msg.message.conversation
            : messageType === 'extendedTextMessage'
                ? msg.message.extendedTextMessage?.text
                : '';

        if (!text) return;

        console.log(`Received message: ${text} from ${msg.key.remoteJid}`);

        const groupId = msg.key.remoteJid!;
        const isGroup = groupId?.endsWith('@g.us');

        // Check if it's a number guess (not a command)
        if (isGroup && activeGames.has(groupId) && !text.startsWith(config.prefix)) {
            const guess = parseInt(text.trim());
            const game = activeGames.get(groupId)!;

            if (!isNaN(guess)) {
                game.attempts++;

                if (guess === game.secretNumber) {
                    const response = `🎉 *CONGRATULATIONS!* 🎉\n\n` +
                        `✅ Correct! The number was *${game.secretNumber}*\n` +
                        `📊 Total attempts: ${game.attempts}\n\n` +
                        `Type !play to start a new game!`;

                    await sock.sendMessage(groupId, { text: response }, { quoted: msg });
                    activeGames.delete(groupId);
                } else if (guess < game.secretNumber) {
                    await sock.sendMessage(groupId, { text: `📈 Too low! Try a higher number.\nAttempts: ${game.attempts}` }, { quoted: msg });
                } else {
                    await sock.sendMessage(groupId, { text: `📉 Too high! Try a lower number.\nAttempts: ${game.attempts}` }, { quoted: msg });
                }
            }
            return;
        }

        if (text.startsWith(config.prefix)) {
            const [command, ...args] = text.slice(config.prefix.length).trim().split(' ');

            if (command === 'ping') {
                await sock.sendMessage(msg.key.remoteJid!, { text: 'Pong!' }, { quoted: msg });
            } else if (command === 'menu') {
                await sock.sendMessage(msg.key.remoteJid!, {
                    text: 'Available commands:\n!ping - Test bot\n!menu - Show commands\n!random [count] - Generate unique random numbers\n!play - Start number guessing game (groups only)\n!vocab - Get 5 English words with Bangla meanings\n!speak - Random speaking practice (groups only)\n!addwords [count] - Manually add AI-generated words\n!stats - Show vocabulary database stats\n!twister - Get a random tongue twister\n!translate - Bangla to English translation challenge (groups)\n!answer - Show translation answers'
                }, { quoted: msg });
            } else if (command === 'play') {
                if (!isGroup) {
                    await sock.sendMessage(groupId, { text: '❌ This game only works in groups!' }, { quoted: msg });
                    return;
                }

                if (activeGames.has(groupId)) {
                    await sock.sendMessage(groupId, { text: '⚠️ A game is already in progress! Finish it first or wait for timeout.' }, { quoted: msg });
                    return;
                }

                try {
                    // Get group metadata
                    const groupMetadata = await sock.groupMetadata(groupId);
                    const totalMembers = groupMetadata.participants.length;

                    // Generate secret number
                    const secretNumber = Math.floor(Math.random() * totalMembers) + 1;

                    const getNumber = createUniqueRandom(1, totalMembers);//Math.floor(Math.random() * totalMembers) + 1;
                    const selectedMembers = getNumber();
                    // Store game state
                    activeGames.set(groupId, {
                        secretNumber,
                        maxNumber: totalMembers,
                        attempts: 0
                    });

                    const response = `🎮 *GUESSING STARTED!* 🎮\n\n` +
                        `👥 Selected members: ${selectedMembers}`;


                    await sock.sendMessage(groupId, { text: response }, { quoted: msg });
                    activeGames.delete(groupId);
                    // Auto-end game after 5 minutes of inactivity
                    setTimeout(() => {
                        if (activeGames.has(groupId)) {
                            const game = activeGames.get(groupId)!;
                            sock.sendMessage(groupId, {
                                text: `⏰ Game timeout! The secret number was *${game.secretNumber}*\nType !play to start a new game!`
                            });
                            activeGames.delete(groupId);
                        }
                    }, 5 * 60 * 1000); // 5 minutes

                } catch (error) {
                    console.error('Error in play command:', error);
                    await sock.sendMessage(groupId, { text: '❌ An error occurred while starting the game.' }, { quoted: msg });
                }
            } else if (command === 'random') {
                try {
                    if (!isGroup) {
                        await sock.sendMessage(msg.key.remoteJid!, { text: '❌ This command only works in groups!' }, { quoted: msg });
                        return;
                    }

                    // Get group metadata
                    const groupMetadata = await sock.groupMetadata(msg.key.remoteJid!);
                    const totalMembers = groupMetadata.participants.length;

                    // Parse count argument (default to totalMembers)
                    const count = args[0] ? parseInt(args[0]) : totalMembers;

                    if (isNaN(count) || count < 1) {
                        await sock.sendMessage(msg.key.remoteJid!, { text: '❌ Please provide a valid number!\nUsage: !random [count]' }, { quoted: msg });
                        return;
                    }

                    if (count > totalMembers) {
                        await sock.sendMessage(msg.key.remoteJid!, { text: `❌ Cannot generate ${count} unique numbers!\nGroup has only ${totalMembers} members.` }, { quoted: msg });
                        return;
                    }

                    // Generate unique random numbers
                    const numbers: number[] = [];
                    const available = Array.from({ length: totalMembers }, (_, i) => i + 1);

                    for (let i = 0; i < count; i++) {
                        const randomIndex = Math.floor(Math.random() * available.length);
                        numbers.push(available[randomIndex]);
                        available.splice(randomIndex, 1);
                    }

                    const response = `🎲 *Random Numbers Generated*\n\n` +
                        `Total Members: ${totalMembers}\n` +
                        `Generated: ${count} unique number(s)\n\n` +
                        `Numbers: ${numbers.join(', ')}`;

                    await sock.sendMessage(msg.key.remoteJid!, { text: response }, { quoted: msg });
                } catch (error) {
                    console.error('Error in random command:', error);
                    await sock.sendMessage(msg.key.remoteJid!, { text: '❌ An error occurred while generating random numbers.' }, { quoted: msg });
                }
            } else if (command === 'vocab') {
                try {
                    // Get 5 random words from vocabulary database
                    const shuffled = [...vocabularyDatabase].sort(() => Math.random() - 0.5);
                    const selectedWords = shuffled.slice(0, 5);

                    let response = `📚 *Daily English Vocabulary* 📚\n\n`;

                    selectedWords.forEach((item, index) => {
                        response += `${index + 1}. *${item.word}*\n`;
                        response += `   অর্থ: ${item.bangla}\n`;
                        response += `   Example: ${item.example}\n\n`;
                    });

                    await sock.sendMessage(msg.key.remoteJid!, { text: response }, { quoted: msg });
                } catch (error) {
                    console.error('Error in vocab command:', error);
                    await sock.sendMessage(msg.key.remoteJid!, { text: '❌ An error occurred while fetching vocabulary.' }, { quoted: msg });
                }
            } else if (command === 'speak') {
                try {
                    if (!isGroup) {
                        await sock.sendMessage(groupId, { text: '❌ This command only works in groups!' }, { quoted: msg });
                        return;
                    }

                    // Get group metadata
                    const groupMetadata = await sock.groupMetadata(groupId);
                    const participants = groupMetadata.participants;

                    // Select a random participant
                    const randomParticipant = participants[Math.floor(Math.random() * participants.length)];

                    // Select a random topic
                    const randomTopic = speakingTopics[Math.floor(Math.random() * speakingTopics.length)];

                    const response = `🎤 *Random Speaking Practice* 🎤\n\n` +
                        `📋 Topic: *${randomTopic}*\n` +
                        `⏱️ Time: 2 minutes\n\n` +
                        `Selected Student: @${randomParticipant.id.split('@')[0]}`;

                    await sock.sendMessage(groupId, {
                        text: response,
                        mentions: [randomParticipant.id]
                    }, { quoted: msg });
                } catch (error) {
                    console.error('Error in speak command:', error);
                    await sock.sendMessage(groupId, { text: '❌ An error occurred while selecting a speaker.' }, { quoted: msg });
                }
            } else if (command === 'addwords') {
                try {
                    // Parse count argument (default to 10)
                    const count = args[0] ? parseInt(args[0]) : 10;

                    if (isNaN(count) || count < 1 || count > 50) {
                        await sock.sendMessage(msg.key.remoteJid!, { text: '❌ Please provide a valid number between 1-50!\nUsage: !addwords [count]' }, { quoted: msg });
                        return;
                    }

                    await sock.sendMessage(msg.key.remoteJid!, { text: `🤖 Generating ${count} words using AI... Please wait...` }, { quoted: msg });

                    const success = await addWordsToDatabase(count);

                    if (success) {
                        const totalWords = await getWordCount();
                        await sock.sendMessage(msg.key.remoteJid!, {
                            text: `✅ Successfully added ${count} new vocabulary words!\n\n📊 Total words in database: ${totalWords}\n\nUse !vocab to see them!`
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(msg.key.remoteJid!, { text: '❌ Failed to generate words. Please try again.' }, { quoted: msg });
                    }
                } catch (error) {
                    console.error('Error in addwords command:', error);
                    await sock.sendMessage(msg.key.remoteJid!, { text: '❌ An error occurred while adding words.' }, { quoted: msg });
                }
            } else if (command === 'stats') {
                try {
                    const totalWords = await getWordCount();
                    const response = `📊 *Vocabulary Database Statistics*\n\n` +
                        `📚 Total words: ${totalWords}\n` +
                        `🤖 AI Scheduler: ${config.schedulerEnabled ? 'Enabled' : 'Disabled'}\n` +
                        `📅 Schedule: ${config.scheduleTime} (9 AM daily)\n` +
                        `➕ Words added per day: ${config.wordsPerDay}\n\n` +
                        `Use !vocab to get random words!`;

                    await sock.sendMessage(msg.key.remoteJid!, { text: response }, { quoted: msg });
                } catch (error) {
                    console.error('Error in stats command:', error);
                    await sock.sendMessage(msg.key.remoteJid!, { text: '❌ An error occurred while fetching statistics.' }, { quoted: msg });
                }
            } else if (command === 'twister') {
                try {
                    const twister = tongueTwisters[Math.floor(Math.random() * tongueTwisters.length)];
                    await sock.sendMessage(msg.key.remoteJid!, {
                        text: `🌪️ *Tongue Twister Challenge* 🌪️\n\nTry to say this fast:\n\n*${twister}*`
                    }, { quoted: msg });
                } catch (error) {
                    console.error('Error in twister command:', error);
                    await sock.sendMessage(msg.key.remoteJid!, { text: '❌ An error occurred while fetching a tongue twister.' }, { quoted: msg });
                }
            } else if (command === 'translate') {
                try {
                    if (!isGroup) {
                        await sock.sendMessage(groupId, { text: '❌ This challenge only works in groups!' }, { quoted: msg });
                        return;
                    }

                    // Select 10 random sentences
                    const shuffled = [...translationSentences].sort(() => Math.random() - 0.5);
                    const selected = shuffled.slice(0, 10);

                    // Store for checking answers
                    activeTranslations.set(groupId, selected);

                    let response = `🇧🇩➡️🇺🇸 *Bangla to English Translation Challenge* 🇧🇩➡️🇺🇸\n\n` +
                        `Translate these 10 sentences to English:\n\n`;

                    selected.forEach((item, index) => {
                        response += `${index + 1}. ${item.bangla}\n`;
                    });

                    response += `\nType *!answer* to see the correct translations!`;

                    await sock.sendMessage(groupId, { text: response }, { quoted: msg });
                } catch (error) {
                    console.error('Error in translate command:', error);
                    await sock.sendMessage(groupId, { text: '❌ An error occurred while starting the translation challenge.' }, { quoted: msg });
                }
            } else if (command === 'answer') {
                try {
                    if (!isGroup) {
                        await sock.sendMessage(groupId, { text: '❌ This command only works in groups!' }, { quoted: msg });
                        return;
                    }

                    const activeChallenge = activeTranslations.get(groupId);

                    if (!activeChallenge) {
                        await sock.sendMessage(groupId, { text: '❌ No active translation challenge in this group!\nStart one with *!translate*' }, { quoted: msg });
                        return;
                    }

                    let response = `✅ *Correct Translations* ✅\n\n`;

                    activeChallenge.forEach((item, index) => {
                        response += `${index + 1}. ${item.bangla}\n   ➡️ *${item.english}*\n\n`;
                    });

                    // Clear active challenge
                    activeTranslations.delete(groupId);

                    await sock.sendMessage(groupId, { text: response }, { quoted: msg });
                } catch (error) {
                    console.error('Error in answer command:', error);
                    await sock.sendMessage(groupId, { text: '❌ An error occurred while fetching answers.' }, { quoted: msg });
                }
            }
        }
    });
}

connectToWhatsApp();
