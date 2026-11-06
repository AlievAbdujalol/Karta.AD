/**
 * Единые сообщения об ошибках Web Speech API (голосовой ввод).
 *
 * Раньше каждое место (AiChat, SearchBar, MultiStopPlanner, MapEventsSheet)
 * либо молча сбрасывало флаг, либо показывало свой текст: пользователь жал
 * «нажал микрофон — ничего не происходит». Прод-причина (Permissions-Policy
 * с microphone=()) лечится в vercel.json, а здесь — понятный текст для
 * остальных ошибок: браузер сам, сеть, нет речи, микрофон занят.
 *
 * @param {string} [code] — event.error из SpeechRecognitionErrorEvent
 * @returns {string|null} текст для toast.error; null — ошибку показывать
 *   не нужно (aborted: намеренная остановка пользователем)
 */
export function speechErrorText(code) {
  if (!code || code === 'aborted') return null;
  if (code === 'not-allowed') {
    return 'Нет доступа к микрофону: разрешите его в настройках браузера и попробуйте снова';
  }
  if (code === 'service-not-allowed') {
    return 'Сервис распознавания речи недоступен: проверьте настройки речи в браузере';
  }
  if (code === 'no-speech') {
    return 'Речь не распознана, попробуйте говорить громче';
  }
  if (code === 'network') {
    return 'Сеть недоступна для распознавания речи';
  }
  if (code === 'audio-capture') {
    return 'Микрофон недоступен: проверьте, что он подключён и не занят другим приложением';
  }
  return 'Не удалось распознать речь, попробуйте ещё раз';
}
