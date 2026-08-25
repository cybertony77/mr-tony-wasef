import { IconCheck, IconX } from '@tabler/icons-react';
import styles from '../../styles/AnswerStatusBubble.module.css';

/**
 * Premium Correct / Wrong status pill for details answer rows.
 */
export default function AnswerStatusBubble({ status = 'wrong', className = '' }) {
  const isCorrect = status === 'correct';

  return (
    <span
      className={`${styles.bubble} ${isCorrect ? styles.correct : styles.wrong} ${className}`.trim()}
      aria-label={isCorrect ? 'Correct' : 'Wrong'}
    >
      <span className={styles.icon} aria-hidden="true">
        {isCorrect ? <IconCheck size={14} stroke={2.75} /> : <IconX size={14} stroke={2.75} />}
      </span>
      <span className={styles.label}>{isCorrect ? 'Correct' : 'Wrong'}</span>
    </span>
  );
}
