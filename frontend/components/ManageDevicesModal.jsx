import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import {
  IconTrash,
  IconDevices,
  IconWorld,
  IconClock,
  IconShieldLock,
  IconBrowser,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
} from '@tabler/icons-react';
import styles from '../styles/ManageDevicesModal.module.css';

function deviceTypeIcon(type) {
  const t = String(type || 'desktop').toLowerCase();
  if (t === 'mobile') return IconDeviceMobile;
  if (t === 'tablet') return IconDeviceTablet;
  return IconDeviceDesktop;
}

function deviceTypeTone(type) {
  const t = String(type || 'desktop').toLowerCase();
  if (t === 'mobile') return styles.typeMobile;
  if (t === 'tablet') return styles.typeTablet;
  return styles.typeDesktop;
}

/**
 * Shared manage-devices popup for students & assistants.
 */
export default function ManageDevicesModal({
  open,
  subject,
  subjectKind = 'student',
  isDeveloper = false,
  allowedDevicesInput,
  originalAllowedDevices,
  onAllowedDevicesChange,
  onSave,
  onDeleteDevice,
  onClose,
  saving = false,
  deleting = false,
  modalError = '',
  modalSuccess = '',
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !subject || typeof document === 'undefined') return null;

  const kindLabel = subjectKind === 'assistant' ? 'assistant' : 'student';
  const devices = Array.isArray(subject.devices) ? subject.devices : [];
  const saveDisabled =
    saving ||
    !String(allowedDevicesInput || '').trim() ||
    String(allowedDevicesInput).trim() === String(originalAllowedDevices ?? '');

  const modal = (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-devices-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerTitleRow}>
            <span className={styles.headerIconWrap} aria-hidden>
              <Image src="/settings.svg" alt="" width={22} height={22} />
            </span>
            <div>
              <h3 id="manage-devices-title" className={styles.title}>
                Manage Devices
              </h3>
              <p className={styles.subtitle}>Device access & login activity</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </header>

        <div className={styles.body}>
          <section className={styles.profileCard}>
            <div className={styles.avatar} aria-hidden>
              <Image
                src="/user.svg"
                alt=""
                width={26}
                height={26}
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            </div>
            <div className={styles.profileMeta}>
              <div className={styles.profileName}>{subject.name || 'Unknown'}</div>
              <div className={styles.profileBadges}>
                <span className={styles.badge}>
                  {subjectKind === 'assistant' ? 'User' : 'ID'}: {subject.id}
                </span>
                {subject.role ? <span className={styles.badgeMuted}>{subject.role}</span> : null}
              </div>
            </div>
            <div className={styles.deviceCountPill}>
              <IconDevices size={16} stroke={1.75} />
              <span>
                {devices.length} device{devices.length === 1 ? '' : 's'}
              </span>
            </div>
          </section>

          <section className={styles.settingsCard}>
            <div className={styles.sectionHeading}>
              <h4>Device settings</h4>
              <p>Control how many devices this {kindLabel} can use, then review registered logins.</p>
            </div>

            <div className={styles.settingsGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  Allowed devices <span className={styles.required}>*</span>
                </span>
                <input
                  type="number"
                  min={1}
                  value={allowedDevicesInput}
                  onChange={(e) => onAllowedDevicesChange?.(e.target.value)}
                  className={styles.input}
                  placeholder="e.g. 2"
                />
                <span className={styles.fieldHint}>
                  Max different devices this {kindLabel} can sign in from.
                </span>
              </label>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Last login</span>
                <div className={styles.readonlyBox}>
                  <IconClock size={16} stroke={1.75} className={styles.readonlyIcon} />
                  <span>{subject.last_login || "Didn't login yet"}</span>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.devicesSection}>
            <div className={styles.sectionHeadingRow}>
              <h4>Registered devices</h4>
              {devices.length > 0 ? (
                <span className={styles.countChip}>{devices.length}</span>
              ) : null}
            </div>

            {devices.length === 0 ? (
              <div className={styles.emptyState}>
                <IconDevices size={28} stroke={1.5} />
                <p>No devices registered yet.</p>
              </div>
            ) : (
              <div className={styles.deviceList}>
                {devices.map((d) => {
                  const TypeIcon = deviceTypeIcon(d.device_type);
                  return (
                    <article key={d.device_id} className={styles.deviceCard}>
                      <div className={styles.deviceCardTop}>
                        <div className={styles.deviceIdentity}>
                          <span className={`${styles.typeIcon} ${deviceTypeTone(d.device_type)}`}>
                            <TypeIcon size={18} stroke={1.75} />
                          </span>
                          <div>
                            <div className={styles.deviceTitle}>
                              {d.browser || 'Unknown browser'}
                              <span className={styles.dotSep}>·</span>
                              {d.os || 'Unknown OS'}
                            </div>
                            <div className={styles.deviceIdLine} title={d.device_id}>
                              {d.device_id || '—'}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => onDeleteDevice?.(d.device_id)}
                          disabled={deleting}
                          aria-label="Delete device"
                        >
                          <IconTrash size={15} stroke={1.75} />
                          <span className={styles.deleteLabel}>Delete</span>
                        </button>
                      </div>

                      <div className={styles.metaRow}>
                        <span className={`${styles.metaChip} ${deviceTypeTone(d.device_type)}`}>
                          <TypeIcon size={13} stroke={1.75} />
                          {d.device_type || 'desktop'}
                        </span>
                        <span className={styles.metaChipNeutral}>
                          <IconBrowser size={13} stroke={1.75} />
                          {d.browser || 'Unknown'}
                        </span>
                        <span className={styles.metaChipNeutral}>
                          <IconWorld size={13} stroke={1.75} />
                          {d.os || 'Unknown'}
                        </span>
                      </div>

                      <div className={styles.timeGrid}>
                        <div>
                          <span className={styles.timeLabel}>First login</span>
                          <span className={styles.timeValue}>{d.first_login || '—'}</span>
                        </div>
                        <div>
                          <span className={styles.timeLabel}>Last login</span>
                          <span className={styles.timeValue}>{d.last_login || '—'}</span>
                        </div>
                      </div>

                      {isDeveloper ? (
                        <div className={styles.securityPanel}>
                          <div className={styles.securityHeader}>
                            <IconShieldLock size={15} stroke={1.75} />
                            <span>Network (developer)</span>
                          </div>
                          <div className={styles.securityLastIp}>
                            <span className={styles.securityLabel}>Last IP</span>
                            <code>{d.last_ip || d.ip || 'unknown'}</code>
                          </div>
                          <div className={styles.securityHistory}>
                            <span className={styles.securityLabel}>IP history</span>
                            {Array.isArray(d.ip_history) && d.ip_history.length > 0 ? (
                              <ul className={styles.ipList}>
                                {d.ip_history.map((h, idx) => (
                                  <li key={`${h.ip}-${idx}`}>
                                    <code>{h.ip || 'unknown'}</code>
                                    {h.last_seen ? (
                                      <span className={styles.ipSeen}>last seen {h.last_seen}</span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className={styles.noHistory}>No IP history</span>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {modalError ? <div className={styles.alertError}>{modalError}</div> : null}
          {modalSuccess ? <div className={styles.alertSuccess}>{modalSuccess}</div> : null}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onSave}
            disabled={saveDisabled}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={saving || deleting}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
