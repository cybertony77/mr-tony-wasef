import { Tabs } from '@mantine/core';
import { QUESTION_TYPE_ESSAY, QUESTION_TYPE_MCQ } from '../../lib/onlineQuestionTypes';
import styles from '../../styles/QuestionTypeTabs.module.css';

export default function QuestionTypeTabs({ value, onChange, disabled = false }) {
  const current = value === QUESTION_TYPE_ESSAY ? QUESTION_TYPE_ESSAY : QUESTION_TYPE_MCQ;

  return (
    <Tabs
      value={current}
      onChange={(next) => {
        if (disabled || !next) return;
        onChange?.(next);
      }}
      variant="pills"
      radius="md"
      className={styles.tabsRoot}
      style={{ opacity: disabled ? 0.65 : 1, pointerEvents: disabled ? 'none' : 'auto' }}
      classNames={{
        list: styles.tabsList,
        tab: styles.tab,
      }}
    >
      <Tabs.List grow>
        <Tabs.Tab value={QUESTION_TYPE_MCQ}>MCQ</Tabs.Tab>
        <Tabs.Tab value={QUESTION_TYPE_ESSAY}>Essay</Tabs.Tab>
      </Tabs.List>
    </Tabs>
  );
}
