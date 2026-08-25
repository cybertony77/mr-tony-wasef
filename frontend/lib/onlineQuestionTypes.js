import { newQuestionClientKey } from './onlineItemQuestionFormHelpers';

export const QUESTION_TYPE_MCQ = 'mcq';
export const QUESTION_TYPE_ESSAY = 'essay';

export function getQuestionType(q) {
  return q?.question_type === QUESTION_TYPE_ESSAY ? QUESTION_TYPE_ESSAY : QUESTION_TYPE_MCQ;
}

export function isEssayQuestion(q) {
  return getQuestionType(q) === QUESTION_TYPE_ESSAY;
}

export function createEmptyMcqQuestion(overrides = {}) {
  return {
    _clientKey: newQuestionClientKey(),
    question_type: QUESTION_TYPE_MCQ,
    question_text: '',
    question_picture: null,
    answers: ['A', 'B', 'C', 'D'],
    answer_texts: ['', '', '', ''],
    correct_answer: '',
    question_explanation: '',
    use_desmos: false,
    valid_correct_answers: [],
    ...overrides,
  };
}

export function createEmptyEssayQuestion(overrides = {}) {
  return {
    _clientKey: newQuestionClientKey(),
    question_type: QUESTION_TYPE_ESSAY,
    question_text: '',
    question_picture: null,
    answers: [],
    answer_texts: [],
    correct_answer: '',
    question_explanation: '',
    use_desmos: false,
    valid_correct_answers: [],
    ...overrides,
  };
}

/** Normalize a loaded question so older MCQ docs keep working. */
export function normalizeLoadedQuestion(q = {}) {
  const type = getQuestionType(q);
  if (type === QUESTION_TYPE_ESSAY) {
    const valid = Array.isArray(q.valid_correct_answers)
      ? q.valid_correct_answers.map((v) => String(v ?? '').trim()).filter((v) => v !== '')
      : [];
    return {
      ...q,
      _clientKey: q._clientKey || newQuestionClientKey(),
      question_type: QUESTION_TYPE_ESSAY,
      answers: [],
      answer_texts: [],
      correct_answer: '',
      valid_correct_answers: valid,
      question_explanation: q.question_explanation || '',
      use_desmos: q.use_desmos === true || q.use_desmos === 'true',
    };
  }
  const answers =
    Array.isArray(q.answers) && q.answers.length >= 2
      ? q.answers
      : ['A', 'B', 'C', 'D'];
  const answerTexts = Array.isArray(q.answer_texts)
    ? q.answer_texts
    : answers.map(() => '');
  while (answerTexts.length < answers.length) answerTexts.push('');
  return {
    ...q,
    _clientKey: q._clientKey || newQuestionClientKey(),
    question_type: QUESTION_TYPE_MCQ,
    answers,
    answer_texts: answerTexts.slice(0, answers.length),
    correct_answer: q.correct_answer || '',
    valid_correct_answers: [],
    question_explanation: q.question_explanation || '',
    use_desmos: q.use_desmos === true || q.use_desmos === 'true',
  };
}

export function switchQuestionType(question, nextType) {
  if (nextType === QUESTION_TYPE_ESSAY) {
    const existing = Array.isArray(question.valid_correct_answers)
      ? question.valid_correct_answers.map((v) => String(v ?? '').trim()).filter((v) => v !== '')
      : [];
    return {
      ...question,
      question_type: QUESTION_TYPE_ESSAY,
      answers: [],
      answer_texts: [],
      correct_answer: '',
      valid_correct_answers: existing,
    };
  }
  return {
    ...question,
    question_type: QUESTION_TYPE_MCQ,
    answers:
      Array.isArray(question.answers) && question.answers.length >= 2
        ? question.answers
        : ['A', 'B', 'C', 'D'],
    answer_texts:
      Array.isArray(question.answer_texts) && question.answer_texts.length >= 2
        ? question.answer_texts
        : ['', '', '', ''],
    correct_answer: question.correct_answer || '',
    valid_correct_answers: [],
  };
}

/** Case-sensitive match after trim (typed answers). */
export function isEssayAnswerCorrect(studentAnswer, validCorrectAnswers) {
  const ans = String(studentAnswer ?? '').trim();
  if (!ans) return false;
  const list = Array.isArray(validCorrectAnswers) ? validCorrectAnswers : [];
  return list.some((v) => String(v ?? '').trim() === ans);
}

export function normalizeValidCorrectAnswers(list) {
  if (!Array.isArray(list)) return [];
  return list.map((v) => String(v ?? '').trim()).filter((v) => v !== '');
}
