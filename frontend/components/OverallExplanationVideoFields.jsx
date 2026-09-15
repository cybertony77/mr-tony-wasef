import { useMemo } from 'react';
import VideoInput from './VideoInput';
import {
  createEmptyExplanationVideoForm,
  EXPLANATION_VIDEO_MAX_BYTES,
  EXPLANATION_VIDEO_MAX_MB,
  serializeExplanationVideoForDb,
} from '../lib/explanationVideo';

/**
 * Overall questions explanation video (quiz / mock exam only).
 * Radio Yes/No (default No). When Yes, shows VideoInput.
 */
export default function OverallExplanationVideoFields({
  enabled = false,
  onEnabledChange,
  videoValue,
  onVideoChange,
  syncKey = '',
}) {
  const video = videoValue && typeof videoValue === 'object'
    ? videoValue
    : createEmptyExplanationVideoForm();

  const videoInputKey = useMemo(() => {
    const saved = serializeExplanationVideoForDb(video);
    return saved
      ? `overall-${saved.video_type}:${saved.video_id}`
      : `overall-empty-${syncKey || 'new'}`;
  }, [video, syncKey]);

  const patchVideo = (patch) => {
    onVideoChange({ ...video, ...patch });
  };

  const radioStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '12px 10px',
    minHeight: 44,
    borderRadius: 8,
    border: active ? '2px solid #1FA8DC' : '2px solid #e9ecef',
    backgroundColor: active ? '#f0f8ff' : 'white',
    boxSizing: 'border-box',
    width: '100%',
  });

  return (
    <div style={{ marginBottom: 20, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <label
        style={{
          display: 'block',
          marginBottom: 12,
          fontWeight: 600,
          textAlign: 'left',
          fontSize: 'clamp(0.92rem, 3.8vw, 1rem)',
          lineHeight: 1.35,
        }}
      >
        Show overall questions explanation video
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        <label style={radioStyle(enabled === false)}>
          <input
            type="radio"
            name={`show_overall_questions_explanation_video_${syncKey || 'form'}`}
            checked={enabled === false}
            onChange={() => onEnabledChange(false)}
            style={{ marginRight: 10, width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
          />
          <span style={{ fontWeight: 500 }}>No</span>
        </label>
        <label style={radioStyle(enabled === true)}>
          <input
            type="radio"
            name={`show_overall_questions_explanation_video_${syncKey || 'form'}`}
            checked={enabled === true}
            onChange={() => onEnabledChange(true)}
            style={{ marginRight: 10, width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
          />
          <span style={{ fontWeight: 500 }}>Yes</span>
        </label>
      </div>

      {enabled ? (
        <div style={{ marginTop: 14, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
          <p style={{ margin: '0 0 10px', fontSize: 'clamp(0.78rem, 3.2vw, 0.85rem)', color: '#64748b' }}>
            Overall explanation video · Upload max {EXPLANATION_VIDEO_MAX_MB} MB
          </p>
          <VideoInput
            key={videoInputKey}
            index={0}
            video={video}
            hideTitle
            hideVideoName
            showUploadTab
            maxFileSizeBytes={EXPLANATION_VIDEO_MAX_BYTES}
            canRemove={false}
            onRemove={() => {}}
            onVideoNameChange={(_i, name) => patchVideo({ video_name: name })}
            onYouTubeUrlChange={(_i, url) =>
              patchVideo({
                youtube_url: url,
                video_source: 'youtube',
                r2_key: '',
                zoom_meeting_id: '',
                google_meet_id: '',
              })
            }
            onClearYouTubeUrl={() => patchVideo({ youtube_url: '' })}
            onZoomMeetingIdChange={(_i, id) =>
              patchVideo({
                zoom_meeting_id: id,
                video_source: 'zoom',
                youtube_url: '',
                r2_key: '',
                google_meet_id: '',
              })
            }
            onClearZoomMeetingId={() => patchVideo({ zoom_meeting_id: '' })}
            onGoogleMeetIdChange={(_i, id) =>
              patchVideo({
                google_meet_id: id,
                video_source: 'google_meet',
                youtube_url: '',
                r2_key: '',
                zoom_meeting_id: '',
              })
            }
            onClearGoogleMeetId={() => patchVideo({ google_meet_id: '' })}
            onR2Upload={(_i, key, fileName) =>
              patchVideo({
                r2_key: key,
                r2_file_name: fileName || '',
                upload_file_name: fileName || '',
                upload_status: 'done',
                video_source: 'r2',
                youtube_url: '',
                zoom_meeting_id: '',
                google_meet_id: '',
              })
            }
            onClearR2Upload={() =>
              patchVideo({
                r2_key: '',
                r2_file_name: '',
                upload_file_name: '',
                upload_status: 'idle',
                upload_progress: 0,
              })
            }
            onVideoSourceChange={(_i, source) => patchVideo({ video_source: source })}
            errors={{}}
          />
        </div>
      ) : null}
    </div>
  );
}
