export const config = {
    botName: "My WhatsApp Bot",
    ownerNumber: process.env.OWNER_NUMBER || "",
    prefix: process.env.PREFIX || "!",
    sessionId: "auth_info_baileys",

    // AI Vocabulary Scheduler Settings
    geminiApiKey: process.env.GEMINI_API_KEY || "AIzaSyDGeJZ_XZS2Fk80ryx2tcPT3Tm23UsufUg",
    schedulerEnabled: true,
    wordsPerDay: 10,
    scheduleTime: "0 9 * * *" // 9 AM daily (cron format)
};
