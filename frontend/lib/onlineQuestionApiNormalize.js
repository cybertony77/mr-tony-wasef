import {
  getQuestionType,
  QUESTION_TYPE_ESSAY,
  QUESTION_TYPE_MCQ,
  normalizeValidCorrectAnswers,
} from './onlineQuestionTypes';
import { listQuestionPicturePublicIds, pickQuestionPictureFields } from './questionPictures';

/**
 * Validate one question from create/update body.
 * @returns {string|null} error message or null if ok
 */
export function validateOnlineQuestionPayload(q, index) {
  const i = index + 1;
  const hasQuestionText = q.question_text && String(q.question_text).trim() !== '';
  const hasQuestionImage = listQuestionPicturePublicIds(q).length > 0;
  if (!hasQuestionText && !hasQuestionImage) {
    return `❌ Question ${i}: Question must have at least question text or image (or both)`;
  }

  const type = getQuestionType(q);
  if (type === QUESTION_TYPE_ESSAY) {
    const valid = normalizeValidCorrectAnswers(q.valid_correct_answers);
    if (valid.length < 1) {
      return `❌ Question ${i}: At least one valid correct answer is required`;
    }
    return null;
  }

  if (!Array.isArray(q.answers) || q.answers.length < 2) {
    return `❌ Question ${i}: At least 2 answers (A and B) are required`;
  }
  for (let j = 0; j < q.answers.length; j++) {
    const expectedLetter = String.fromCharCode(65 + j);
    if (q.answers[j] !== expectedLetter) {
      return `❌ Question ${i}: Answers must be letters A, B, C, D, etc. in order`;
    }
  }
  if (!q.correct_answer) {
    return `❌ Question ${i}: Correct answer is required`;
  }
  const correctAnswerLetter = Array.isArray(q.correct_answer) ? q.correct_answer[0] : q.correct_answer;
  const correctLetterUpper = String(correctAnswerLetter || '').toUpperCase();
  if (!q.answers.includes(correctLetterUpper)) {
    return `❌ Question ${i}: Correct answer must be one of the provided answers`;
  }
  return null;
}

/**
 * Serialize question for Mongo insert/update.
 * @param {Function} normalizeQuestionPictures - entity-specific picture normalizer
 */
export function serializeOnlineQuestionForDb(q, normalizeQuestionPictures) {
  const type = getQuestionType(q);
  const base = {
    question_type: type,
    question_text: q.question_text || '',
    ...normalizeQuestionPictures(q),
    question_explanation: q.question_explanation || '',
    use_desmos: q.use_desmos === true || q.use_desmos === 'true',
  };

  if (type === QUESTION_TYPE_ESSAY) {
    return {
      ...base,
      valid_correct_answers: normalizeValidCorrectAnswers(q.valid_correct_answers),
      answers: [],
      answer_texts: [],
      correct_answer: '',
    };
  }

  const correctAnswerLetter = Array.isArray(q.correct_answer) ? q.correct_answer[0] : q.correct_answer;
  const correctAnswerText = Array.isArray(q.correct_answer) ? q.correct_answer[1] : null;
  const answerTexts = q.answer_texts || [];
  const correctLetterUpper = String(correctAnswerLetter || '').toUpperCase();
  const correctIndex = (q.answers || []).indexOf(correctLetterUpper);
  const hasText =
    correctIndex >= 0 &&
    answerTexts[correctIndex] &&
    String(answerTexts[correctIndex]).trim() !== '';

  return {
    ...base,
    answers: q.answers,
    answer_texts: answerTexts,
    correct_answer:
      hasText && correctAnswerText
        ? [String(correctAnswerLetter).toLowerCase(), correctAnswerText]
        : String(correctAnswerLetter || '').toLowerCase(),
    valid_correct_answers: [],
  };
}

/** Student-facing question fields (no answer key). */
export function sanitizeQuestionForStudent(q) {
  const type = getQuestionType(q);
  const pics = {
    question_picture: q.question_picture || null,
    ...pickQuestionPictureFields(q),
  };
  if (type === QUESTION_TYPE_ESSAY) {
    return {
      question_type: QUESTION_TYPE_ESSAY,
      question_text: q.question_text || '',
      ...pics,
      use_desmos: q.use_desmos === true || q.use_desmos === 'true',
    };
  }
  return {
    question_type: QUESTION_TYPE_MCQ,
    question_text: q.question_text || '',
    ...pics,
    answers: q.answers || [],
    answer_texts: q.answer_texts || [],
    use_desmos: q.use_desmos === true || q.use_desmos === 'true',
  };
}

/** Answer-key payload for /result grading. */
export function questionAnswerKeyForResult(q) {
  const type = getQuestionType(q);
  const extraPics = pickQuestionPictureFields(q);
  if (type === QUESTION_TYPE_ESSAY) {
    return {
      question_type: QUESTION_TYPE_ESSAY,
      question_picture: q.question_picture,
      question: q.question,
      question_text: q.question_text,
      valid_correct_answers: q.valid_correct_answers || [],
      question_level: q.question_level,
      ...extraPics,
    };
  }
  return {
    question_type: QUESTION_TYPE_MCQ,
    question_picture: q.question_picture,
    question: q.question,
    question_text: q.question_text,
    answers: q.answers,
    answer_texts: q.answer_texts || [],
    correct_answer: q.correct_answer,
    question_level: q.question_level,
    ...extraPics,
  };
}
