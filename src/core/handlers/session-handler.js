// src/core/handlers/session-handler.js

const sessionHandlers = {
  rename_session: async (params, context) => {
    const { name } = params;
    if (!name || !name.trim()) return { success: false, message: 'No session name provided.' };
    const trimmedName = name.trim();

    if (!context.currentSession) return { success: false, message: 'No active session to rename.' };
    context.currentSession.name = trimmedName;

    if (typeof context.onSessionRenamed === 'function') context.onSessionRenamed(trimmedName);
    return { success: true, message: `Session renamed to "${trimmedName}"` };
  },

  rename_conversation: async (params, context) => {
    const { title } = params;
    if (!title || !title.trim()) return { success: false, message: 'No conversation title provided.' };
    const trimmedTitle = title.trim();

    if (!context.currentPage) return { success: false, message: 'No active conversation turn to rename.' };
    context.currentPage.title = trimmedTitle;

    if (typeof context.onConversationRenamed === 'function') context.onConversationRenamed(trimmedTitle);
    return { success: true, message: `Conversation turn renamed to "${trimmedTitle}"` };
  },

  delete_session: async (params, context) => {
    if (!context.currentSession) return { success: false, message: 'No active session to delete.' };

    if (typeof context.onSessionDeleted === 'function') context.onSessionDeleted();
    return { success: true, message: 'Session deleted.' };
  }
};

module.exports = sessionHandlers;
