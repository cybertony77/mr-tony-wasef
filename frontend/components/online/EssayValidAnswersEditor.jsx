import { useState } from 'react';
import Image from 'next/image';
import { IconCheck, IconTrash } from '@tabler/icons-react';
import styles from '../../styles/EssayValidAnswersEditor.module.css';

export default function EssayValidAnswersEditor({
  values = [],
  onChange,
  error,
  questionIndex = 0,
}) {
  const list = Array.isArray(values)
    ? values.map((v) => String(v ?? '').trim()).filter((v) => v !== '')
    : [];
  const [draft, setDraft] = useState('');

  const add = () => {
    const next = draft.trim();
    if (!next) return;
    onChange?.([...list, next]);
    setDraft('');
  };

  const remove = (idx) => {
    onChange?.(list.filter((_, i) => i !== idx));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className={styles.wrap}>
      <label className={styles.label}>Valid Correct Answers</label>
      <p className={styles.hint}>
        Type an accepted answer, then press Add. Students match any item in the list.
      </p>

      <div className={styles.composer}>
        <input
          type="text"
          className={`${styles.input} ${error && list.length === 0 ? styles.inputError : ''}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Enter a valid correct answer"
          aria-label={`Valid correct answer input for question ${questionIndex + 1}`}
        />
        <button
          type="button"
          className={styles.addBtn}
          onClick={add}
          disabled={!draft.trim()}
        >
          <Image src="/plus.svg" alt="" width={18} height={18} />
          Add
        </button>
      </div>

      {list.length > 0 ? (
        <ul className={styles.list}>
          {list.map((value, aIdx) => (
            <li key={`essay-valid-${questionIndex}-${aIdx}-${value}`} className={styles.item}>
              <span className={styles.itemMark} aria-hidden="true">
                <IconCheck size={18} stroke={2.5} />
              </span>
              <div className={styles.itemBody}>
                <span className={styles.itemText}>{value}</span>
                <span className={styles.itemMeta}>Accepted answer</span>
              </div>
              <button
                type="button"
                className={styles.trashBtn}
                onClick={() => remove(aIdx)}
                aria-label={`Remove accepted answer: ${value}`}
                title="Remove"
              >
                <IconTrash size={18} stroke={1.8} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>No valid answers added yet</div>
      )}

      {error ? <div className={styles.error}>{error}</div> : null}
    </div>
  );
}
