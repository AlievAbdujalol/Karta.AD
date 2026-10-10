/**
 * orderAssistant — ИИ-помощник по заказу для страницы отслеживания.
 *
 * Модель отвечает ТОЛЬКО по данным трекинга (спецификация §28, §59):
 * контекст собирает buildTrackingContext — публично-безопасные поля заказа
 * без данных покупателя. Любая ошибка ИИ превращается в ok=false —
 * вызывающий показывает детерминированный фолбэк (summarizeOrder).
 */
import { geminiGenerate, isGeminiConfigured } from './gemini';
import { buildOrderAiPrompt } from './orderTracking';

/**
 * Ответ ИИ на вопрос о заказе.
 * @param {{data: object, question: string}} params
 * @returns {Promise<{ok: boolean, text: string|null, reason: string|null}>}
 */
export async function askOrderAi({ data, question } = {}) {
  if (!isGeminiConfigured()) {
    return { ok: false, text: null, reason: 'no_key' };
  }
  try {
    const text = await geminiGenerate(buildOrderAiPrompt(data, question), {
      jsonMode: false,
      temperature: 0.3,
      maxTokens: 400,
      retries: 1,
      timeoutMs: 15000,
    });
    if (!text || !text.trim()) return { ok: false, text: null, reason: 'empty' };
    return { ok: true, text: text.trim(), reason: null };
  } catch {
    return { ok: false, text: null, reason: 'error' };
  }
}
