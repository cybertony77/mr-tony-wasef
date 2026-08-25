import { isEssayQuestion } from './onlineQuestionTypes';

/**
 * Rebuild the question list (and MCQ answer_texts) in the order the student saw,
 * using shuffle_mapping saved at submit time ({ questionOrder, textOrder }).
 */
export function reconstructShuffledQuestions(questions, shuffleMapping) {
  if (!shuffleMapping?.questionOrder || !Array.isArray(questions)) {
    return { displayQuestions: questions || [], originalToShuffled: null };
  }

  const originalToShuffled = {};
  shuffleMapping.questionOrder.forEach(({ shuffledIndex, originalIndex }) => {
    originalToShuffled[originalIndex] = shuffledIndex;
  });

  const shuffledQuestions = new Array(questions.length);
  questions.forEach((origQ, origIdx) => {
    const shuffledIdx = originalToShuffled[origIdx];
    if (shuffledIdx === undefined) return;

    if (isEssayQuestion(origQ) || !Array.isArray(origQ.answers) || origQ.answers.length === 0) {
      shuffledQuestions[shuffledIdx] = { ...origQ };
      return;
    }

    const shuffledQ = {
      ...origQ,
      answers: [...origQ.answers],
    };

    const textMapping = shuffleMapping.textOrder?.[shuffledIdx];
    if (textMapping && Array.isArray(origQ.answer_texts) && origQ.answer_texts.length > 0) {
      const positions = Object.keys(textMapping)
        .map(Number)
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b);
      shuffledQ.answer_texts = positions.map((pos) => origQ.answer_texts[textMapping[pos]] ?? '');
    } else {
      shuffledQ.answer_texts = Array.isArray(origQ.answer_texts) ? [...origQ.answer_texts] : [];
    }

    shuffledQuestions[shuffledIdx] = shuffledQ;
  });

  return { displayQuestions: shuffledQuestions, originalToShuffled };
}
