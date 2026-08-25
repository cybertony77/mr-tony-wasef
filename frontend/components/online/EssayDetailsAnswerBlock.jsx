import { IconCheck } from '@tabler/icons-react';
import AnswerStatusBubble from './AnswerStatusBubble';
import styles from '../../styles/EssayDetailsAnswerBlock.module.css';

/**
 * Student essay answer + valid answers (only when incorrect).
 */
export default function EssayDetailsAnswerBlock({
  studentAnswer = '',
  validCorrectAnswers = [],
  isCorrect = false,
  studentLabel = 'Your Answer:',
}) {
  const answeredText =
    studentAnswer && String(studentAnswer).trim() !== ''
      ? String(studentAnswer)
      : 'Not answered';

  const validList = Array.isArray(validCorrectAnswers)
    ? validCorrectAnswers.map((v) => String(v ?? '').trim()).filter(Boolean)
    : [];

  const showValid = !isCorrect && validList.length > 0;

  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.studentCard} ${
          isCorrect ? styles.studentCardCorrect : styles.studentCardWrong
        }`}
      >
        <div className={styles.cardBody}>
          <div className={styles.cardContent}>
            <div className={styles.cardLabel}>{studentLabel}</div>
            <div className={styles.cardValue}>{answeredText}</div>
          </div>
          <AnswerStatusBubble status={isCorrect ? 'correct' : 'wrong'} />
        </div>
      </div>

      {showValid ? (
        <div className={styles.validBlock}>
          <div className={styles.validHeader}>
            <span className={styles.validIcon} aria-hidden="true">
              <IconCheck size={16} stroke={2.5} />
            </span>
            <div className={styles.validTitle}>Valid Correct Answers</div>
          </div>
          <ul className={styles.validList}>
            {validList.map((ans, ansIdx) => (
              <li key={`${ansIdx}-${ans}`} className={styles.validItem}>
                <span className={styles.validDot} aria-hidden="true" />
                <span className={styles.validText}>{ans}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
