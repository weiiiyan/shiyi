/**
 * Web Speech API 封装
 * - SpeechSynthesis: 文本转语音 (TTS)
 * - SpeechRecognition: 语音转文本 (STT)
 */

import { ref, onUnmounted } from 'vue';

/**
 * TTS — 朗读文本
 */
export function useTTS() {
  const speaking = ref(false);
  const supported = ref(typeof window !== 'undefined' && 'speechSynthesis' in window);

  function speak(text, options = {}) {
    if (!supported.value) {
      console.warn('SpeechSynthesis not supported');
      return;
    }

    // 取消当前朗读
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang || 'en-US';
    utterance.rate = options.rate || 0.9;
    utterance.pitch = options.pitch || 1;
    utterance.volume = options.volume || 1;

    // 尝试选择好的英文语音
    if (!options.voice) {
      const voices = window.speechSynthesis.getVoices();
      const englishVoice =
        voices.find((v) => v.lang === 'en-US' && v.name.includes('Google')) ??
        voices.find((v) => v.lang === 'en-US') ??
        voices.find((v) => v.lang.startsWith('en'));
      if (englishVoice) utterance.voice = englishVoice;
    }

    utterance.onstart = () => {
      speaking.value = true;
    };
    utterance.onend = () => {
      speaking.value = false;
    };
    utterance.onerror = () => {
      speaking.value = false;
    };

    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    window.speechSynthesis.cancel();
    speaking.value = false;
  }

  onUnmounted(() => {
    stop();
  });

  return { speak, stop, speaking, supported };
}

/**
 * STT — 语音识别
 */
export function useSTT() {
  const listening = ref(false);
  const transcript = ref('');
  const supported = ref(
    typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );

  let recognition = null;

  function createRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    return rec;
  }

  /**
   * 开始录音，返回 Promise<转录文本>
   */
  function startListening() {
    return new Promise((resolve, reject) => {
      if (!supported.value) {
        reject(new Error('SpeechRecognition not supported'));
        return;
      }

      recognition = createRecognition();
      if (!recognition) {
        reject(new Error('Failed to create SpeechRecognition'));
        return;
      }

      transcript.value = '';
      listening.value = true;

      recognition.onresult = (event) => {
        const result = event.results[0]?.[0]?.transcript || '';
        transcript.value = result;
        resolve(result);
      };

      recognition.onerror = (event) => {
        listening.value = false;
        reject(new Error(event.error));
      };

      recognition.onend = () => {
        listening.value = false;
      };

      recognition.start();
    });
  }

  function stopListening() {
    if (recognition) {
      recognition.stop();
    }
    listening.value = false;
  }

  onUnmounted(() => {
    stopListening();
  });

  return { startListening, stopListening, listening, transcript, supported };
}
