import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { Stack, Switch, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import TitleBar from '../../components/Title';
import DesmosQuestionAssist from '../../components/student/DesmosQuestionAssist';
import { useSystemConfig, useNationalSystem, getCourseFieldLabels, isFeatureEnabled } from '../../lib/api/system';
import { useDesmosConfig, useSaveDesmosConfig } from '../../lib/api/desmosConfig';
import {
  desmosConfigKey,
  filterDesmosConfigItems,
  formatCourseTypeLabel,
} from '../../lib/desmosConfigUtils';
import dc from '../../styles/desmos_config.module.css';

function ConfigSwitch({ checked, onChange, disabled, label }) {
  return (
    <div className={dc.switchWrap}>
      <Switch
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        color="teal"
        size="lg"
        disabled={disabled}
        label={label}
        styles={{ label: { color: '#e2e8f0', fontWeight: 700 } }}
        thumbIcon={
          checked ? (
            <IconCheck size={12} color="var(--mantine-color-teal-6)" />
          ) : (
            <IconX size={12} color="var(--mantine-color-red-6)" />
          )
        }
      />
    </div>
  );
}

export default function DesmosConfigPage() {
  const router = useRouter();
  const { data: systemConfig } = useSystemConfig();
  const isDesmosEnabled = isFeatureEnabled(systemConfig, 'desmos_integrations');
  const isNational = useNationalSystem();
  const labels = getCourseFieldLabels(isNational);

  const { data, isLoading, isError } = useDesmosConfig({
    enabled: isDesmosEnabled,
  });
  const saveMutation = useSaveDesmosConfig();

  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!isDesmosEnabled) {
      router.replace('/dashboard');
    }
  }, [isDesmosEnabled, router]);

  useEffect(() => {
    if (data?.items) {
      setItems(filterDesmosConfigItems(data.items, isNational));
    }
  }, [data?.items, isNational]);

  const grouped = useMemo(() => {
    const visibleItems = filterDesmosConfigItems(items, isNational);
    const map = new Map();
    for (const item of visibleItems) {
      const course = item.course;
      if (!map.has(course)) map.set(course, []);
      map.get(course).push(item);
    }
    return Array.from(map.entries()).map(([course, rows]) => ({
      course,
      rows: rows.sort((a, b) =>
        String(a.courseType || '').localeCompare(String(b.courseType || ''))
      ),
    }));
  }, [items, isNational]);

  const nationalRows = useMemo(
    () => filterDesmosConfigItems(items, true),
    [items]
  );

  const handleToggle = useCallback(
    async (course, courseType, nextEnabled) => {
      const key = desmosConfigKey(course, courseType);
      const previous = items;
      const nextItems = items.map((item) =>
        desmosConfigKey(item.course, item.courseType) === key
          ? { ...item, enabled: nextEnabled }
          : item
      );
      setItems(nextItems);
      try {
        await saveMutation.mutateAsync(filterDesmosConfigItems(nextItems, isNational));
      } catch {
        setItems(previous);
      }
    },
    [items, isNational, saveMutation]
  );

  if (!isDesmosEnabled) return null;

  const sectionTitle = isNational
    ? `${labels.course} Configuration`
    : `${labels.course} & Course Type Configuration`;

  const sectionDesc = isNational
    ? `Control which students see the Desmos calculator on their dashboard by ${labels.courseLower}. Switches default to open (enabled).`
    : 'Control which students see the Desmos calculator on their dashboard by course and course type. Switches default to open (enabled).';

  return (
    <div className={dc.pageRoot}>
      <TitleBar backText="Back" href="/dashboard">
        <div className={dc.titleHeading}>
          <Image src="/calculator.svg" alt="" width={32} height={32} />
          <span className={dc.titleText}>Desmos Configuration</span>
        </div>
      </TitleBar>

      <div className={dc.mainContainer}>
        <div className={dc.containerInner}>
          <div className={dc.containerHeader}>
            <Text fw={800} className={dc.sectionTitle}>
              {sectionTitle}
            </Text>
            <Text size="sm" className={dc.sectionDesc} mt={8}>
              {sectionDesc}
            </Text>
          </div>

          {isLoading && <Text className={dc.loadingText}>Loading configuration…</Text>}
          {isError && (
            <Text className={dc.loadingText} c="red">
              Failed to load configuration. Please refresh the page.
            </Text>
          )}

          {!isLoading && !isError && isNational && (
            <Stack gap="sm">
              {nationalRows.map((row) => {
                const switchLabel = row.enabled ? 'Open' : 'Closed';
                return (
                  <div
                    key={desmosConfigKey(row.course, row.courseType)}
                    className={dc.nationalRow}
                  >
                    <span className={dc.nationalGrade}>{row.course}</span>
                    <ConfigSwitch
                      checked={row.enabled !== false}
                      disabled={saveMutation.isPending}
                      label={switchLabel}
                      onChange={(checked) => handleToggle(row.course, row.courseType, checked)}
                    />
                  </div>
                );
              })}
            </Stack>
          )}

          {!isLoading && !isError && !isNational && (
            <Stack gap="md">
              {grouped.map(({ course, rows }) => (
                <div key={course} className={dc.courseGroup}>
                  <div className={dc.courseHeader}>
                    <span className={dc.courseName}>{course}</span>
                  </div>
                  {rows.map((row) => {
                    const typeLabel = formatCourseTypeLabel(row.courseType);
                    const switchLabel = row.enabled ? 'Open' : 'Closed';
                    return (
                      <div
                        key={desmosConfigKey(row.course, row.courseType)}
                        className={dc.configRow}
                      >
                        <div className={dc.rowLabel}>
                          <span>{typeLabel}</span>
                        </div>
                        <ConfigSwitch
                          checked={row.enabled !== false}
                          disabled={saveMutation.isPending}
                          label={switchLabel}
                          onChange={(checked) => handleToggle(row.course, row.courseType, checked)}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </Stack>
          )}

          <div className={dc.calcDivider} />

          <div className={dc.calcSection}>
            <DesmosQuestionAssist standalone instanceKey="desmos-config-page">
              {({ showDesmos, openCalculator, isOpen }) =>
                showDesmos ? (
                  <button
                    type="button"
                    className={dc.calcBtn}
                    onClick={() => openCalculator?.()}
                    disabled={isOpen || !openCalculator}
                  >
                    <Image src="/calculator.svg" alt="Desmos Calculator" width={20} height={20} />
                    Desmos Calculator
                  </button>
                ) : null
              }
            </DesmosQuestionAssist>
          </div>
        </div>
      </div>
    </div>
  );
}
