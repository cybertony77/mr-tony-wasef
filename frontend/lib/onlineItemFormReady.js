import { listQuestionPicturePublicIds } from './questionPictures';
import { isEssayQuestion, normalizeValidCorrectAnswers } from './onlineQuestionTypes';
import {
  isDeadlineStrictlyInFutureEgypt,
  normalizeDeadlineTimeField,
  parseDeadlineTime,
} from './deadlineTimeEgypt';

function hasText(value) {
  return value != null && String(value).trim() !== '';
}

function questionContentReady(q) {
  const hasQuestionText = hasText(q?.question_text);
  const hasQuestionImage = listQuestionPicturePublicIds(q).length > 0;
  if (!hasQuestionText && !hasQuestionImage) return false;

  if (isEssayQuestion(q)) {
    return normalizeValidCorrectAnswers(q.valid_correct_answers).length >= 1;
  }
  if (!Array.isArray(q.answers) || q.answers.length < 2) return false;
  if (!q.correct_answer) return false;
  return true;
}

function questionsReady(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return false;
  return questions.every(questionContentReady);
}

function deadlineReady(formData) {
  if (formData?.deadline_type !== 'with_deadline') return true;
  if (!formData.deadline_date) return false;
  const rawT = formData.deadline_time;
  if (rawT != null && String(rawT).trim() !== '' && !parseDeadlineTime(String(rawT).trim())) {
    return false;
  }
  const normT = normalizeDeadlineTimeField('with_deadline', rawT);
  return isDeadlineStrictlyInFutureEgypt(formData.deadline_date, normT);
}

function commonMetaReady({ formData, selectedCourse, accountState, requireAccountState }) {
  if (!hasText(selectedCourse)) return false;
  if (!hasText(formData?.lesson_name)) return false;
  if (formData?.shuffle_questions_and_answers === undefined || formData?.shuffle_questions_and_answers === null) {
    return false;
  }
  if (formData?.show_details_after_submitting === undefined || formData?.show_details_after_submitting === null) {
    return false;
  }
  if (requireAccountState && !hasText(accountState)) return false;
  if (!deadlineReady(formData)) return false;
  return true;
}

function pdfReady(formData) {
  return hasText(formData?.pdf_file_name) && hasText(formData?.pdf_url);
}

function timerReady(formData) {
  if (formData?.timer_type !== 'with_timer') return true;
  return formData?.timer != null && parseInt(formData.timer, 10) >= 1;
}

export function isHomeworkFormReady({
  formData,
  selectedCourse,
  selectedLesson,
  accountState,
}) {
  if (!commonMetaReady({ formData, selectedCourse, accountState, requireAccountState: true })) {
    return false;
  }
  if (!hasText(selectedLesson)) return false;

  if (formData.homework_type === 'pdf') {
    return pdfReady(formData);
  }
  if (formData.homework_type === 'pages_from_book') {
    if (!hasText(formData.book_name)) return false;
    const from = parseInt(formData.from_page, 10);
    const to = parseInt(formData.to_page, 10);
    if (!from || from < 1) return false;
    if (!to || to < 1) return false;
    if (from > to) return false;
    return true;
  }
  // questions
  if (!timerReady(formData)) return false;
  return questionsReady(formData.questions);
}

export function isQuizFormReady({
  formData,
  selectedCourse,
  selectedLesson,
  accountState,
}) {
  if (!commonMetaReady({ formData, selectedCourse, accountState, requireAccountState: true })) {
    return false;
  }
  if (!hasText(selectedLesson)) return false;

  if (formData.quiz_type === 'pdf') {
    return pdfReady(formData);
  }
  if (!timerReady(formData)) return false;
  return questionsReady(formData.questions);
}

export function isMockExamFormReady({
  formData,
  selectedCourse,
  selectedMockExam,
  accountState,
}) {
  // Mock exams validate account state in UI select but submit does not require it;
  // keep consistent with submit: do not require accountState.
  if (!commonMetaReady({ formData, selectedCourse, accountState, requireAccountState: false })) {
    return false;
  }
  if (!hasText(selectedMockExam)) return false;

  if (formData.mock_exam_type === 'pdf') {
    return pdfReady(formData);
  }
  if (!timerReady(formData)) return false;
  return questionsReady(formData.questions);
}
