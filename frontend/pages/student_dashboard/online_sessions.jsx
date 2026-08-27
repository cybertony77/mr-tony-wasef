import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Image from 'next/image';
import Title from '../../components/Title';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../lib/axios';
import { useProfile } from '../../lib/api/auth';
import { useSystemConfig, useNationalSystem } from '../../lib/api/system';
import { useStudent, studentKeys } from '../../lib/api/students';
import StudentLessonSelect from '../../components/StudentLessonSelect';
import NeedHelp from '../../components/NeedHelp';
import R2VideoPlayer from '../../components/R2VideoPlayer';
import YoutubeEmbedWithProgress from '../../components/YoutubeEmbedWithProgress';
import ZoomVideoPlayer from '../../components/ZoomVideoPlayer';
import GoogleMeetVideoPlayer from '../../components/GoogleMeetVideoPlayer';
import { TextInput, ActionIcon, useMantineTheme } from '@mantine/core';
import { IconSearch, IconArrowRight } from '@tabler/icons-react';
import {
  FREE_ONLINE_SESSION_PAYMENT_STATES,
  isFreeViewingAccessValid,
  isFreeViewingExpired,
  attendedInCenter,
} from '../../lib/onlineSessionViewing';
import { getStudentLesson } from '../../lib/studentLessons';
import { isDeadlinePassedEgypt } from '../../lib/deadlineTimeEgypt';
import { isCodeNumberOfDaysValid } from '../../lib/codeNumberOfDays';
import CodePopupMessage from '../../components/CodePopupMessage';
import {
  CODE_ERROR,
  getVerificationCodeMessage,
  resolveVerificationCodeError,
} from '../../lib/verificationCodeMessages';

function unlockInfoFromVvcResponse(data) {
  if (!data) return null;
  return {
    vvc_id: data.vvc_id,
    code_settings: data.code_settings || 'number_of_views',
    number_of_views: data.number_of_views ?? null,
    number_of_days: data.number_of_days ?? null,
    access_started_at: data.access_started_at || null,
    deadline_date: data.deadline_date || null,
  };
}

// Input with Button Component (matching manage online system style)
function InputWithButton(props) {
  const theme = useMantineTheme();
  return (
    <TextInput
      radius="xl"
      size="md"
      placeholder="Search by lesson name..."
      rightSectionWidth={42}
      leftSection={<IconSearch size={18} stroke={1.5} />}
      rightSection={
        <ActionIcon size={32} radius="xl" color={theme.primaryColor} variant="filled" onClick={props.onButtonClick}>
          <IconArrowRight size={18} stroke={1.5} />
        </ActionIcon>
      }
      {...props}
    />
  );
}


// Build embed URL
function buildEmbedUrl(videoId) {
  return `https://www.youtube.com/embed/${videoId}?controls=0&rel=0&modestbranding=1&disablekb=1&fs=0&iv_load_policy=3&playsinline=1`;
}

const VVC_UNLOCK_STORAGE_PREFIX = 'vvc-unlocked:';

function readUnlockMap(studentId) {
  if (typeof window === 'undefined' || !studentId) return new Map();
  try {
    const raw = window.sessionStorage.getItem(`${VVC_UNLOCK_STORAGE_PREFIX}${studentId}`);
    if (!raw) return new Map();
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? new Map(entries) : new Map();
  } catch {
    return new Map();
  }
}

function writeUnlockMap(studentId, map) {
  if (typeof window === 'undefined' || !studentId) return;
  try {
    window.sessionStorage.setItem(
      `${VVC_UNLOCK_STORAGE_PREFIX}${studentId}`,
      JSON.stringify([...map.entries()])
    );
  } catch {
    /* ignore quota / private mode */
  }
}


export default function OnlineSessions() {
  const { data: systemConfig } = useSystemConfig();
  const isNational = useNationalSystem();
  const isScoringEnabled = systemConfig?.scoring_system === true || systemConfig?.scoring_system === 'true';
  const isOnlineVideosEnabled = systemConfig?.online_videos === true || systemConfig?.online_videos === 'true';
  
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  
  // Fetch student data to get available lessons
  const studentId = profile?.id ? profile.id.toString() : null;
  const { data: studentData } = useStudent(studentId, {
    enabled: !!studentId,
    refetchOnMount: 'always',
  });
  
  // Redirect if feature is disabled
  useEffect(() => {
    if (systemConfig && !isOnlineVideosEnabled) {
      router.push('/student_dashboard');
    }
  }, [systemConfig, isOnlineVideosEnabled, router]);
  
  // Don't render if feature is disabled
  if (systemConfig && !isOnlineVideosEnabled) {
    return null;
  }
  const [expandedSessions, setExpandedSessions] = useState(new Set());
  const [videoPopupOpen, setVideoPopupOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const videoContainerRef = useRef(null);
  const videoStartTimeRef = useRef(null); // Track when video was opened
  const isClosingVideoRef = useRef(false); // Prevent multiple close calls
  const r2CompletedRef = useRef(false); // Track if R2 video was completed (>= 90%)
  const watchedTenPercentRef = useRef(false); // Attendance/watch marker at >=10%
  const selectedVideoRef = useRef(null);
  const vvcViewsDecrementDoneRef = useRef(false);
  const freeViewsDecrementDoneRef = useRef(false);
  const attendancePostedRef = useRef(false);
  const lastUnlockStudentIdRef = useRef(null);
  const [vvcPopupOpen, setVvcPopupOpen] = useState(false);
  const [vvc, setVvc] = useState('');
  const [vvcError, setVvcError] = useState('');
  const [isCheckingVvc, setIsCheckingVvc] = useState(false);
  const [pendingVideo, setPendingVideo] = useState(null); // Store video info while waiting for VVC
  const [unlockedSessions, setUnlockedSessions] = useState(new Map()); // Store unlocked sessions with VVC info

  // Auto-hide VVC popup messages after 6s
  useEffect(() => {
    if (!vvcError) return undefined;
    const timer = setTimeout(() => setVvcError(''), 6000);
    return () => clearTimeout(timer);
  }, [vvcError]);

  // Fetch online sessions
  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ['online_sessions-student'],
    queryFn: async () => {
      const response = await apiClient.get('/api/online_sessions/student');
      return response.data;
    },
    refetchInterval: 10 * 60 * 1000, // Auto-refresh every 10 minutes
    refetchIntervalInBackground: false, // Don't refetch when tab is not active
    refetchOnWindowFocus: true, // Refetch on window focus
    refetchOnMount: true, // Refetch on mount
    refetchOnReconnect: true, // Refetch on reconnect
  });

  const sessions = sessionsData?.sessions || [];

  // Hide deactivated sessions from students (support both new state and legacy account_state)
  const visibleSessions = sessions.filter((session) => {
    const effectiveState = session.state || session.account_state || 'Activated';
    return effectiveState !== 'Deactivated';
  });

  // Search and filter states
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLesson, setFilterLesson] = useState('');
  const [filterLessonDropdownOpen, setFilterLessonDropdownOpen] = useState(false);

  // Get available lessons from sessions (only lessons that exist in sessions, are Activated, and match student's course/courseType)
  const getAvailableLessons = () => {
    const lessonSet = new Set();
    const studentCourse = (studentData?.course || '').trim();
    const studentCourseType = (studentData?.courseType || '').trim();
    
    sessions.forEach(session => {
      const effectiveState = session.state || session.account_state || 'Activated';
      if (effectiveState === 'Deactivated') return;
      if (session.lesson && session.lesson.trim()) {
        // Check if session matches student's course and courseType
        const sessionCourse = (session.course || '').trim();
        const sessionCourseType = (session.courseType || '').trim();
        
        // Course match: if session course is "All", it matches any student course
        const courseMatch = sessionCourse.toLowerCase() === 'all' || 
                           sessionCourse.toLowerCase() === studentCourse.toLowerCase();
        
        // CourseType match: skip when national system; otherwise match as before
        const courseTypeMatch = isNational ||
                               !sessionCourseType || 
                               !studentCourseType ||
                               sessionCourseType.toLowerCase() === studentCourseType.toLowerCase();
        
        if (courseMatch && courseTypeMatch) {
          lessonSet.add(session.lesson);
        }
      }
    });
    return Array.from(lessonSet).sort();
  };

  const availableLessons = getAvailableLessons();

  // Filter sessions based on search and filters
  const filteredSessions = visibleSessions.filter(session => {
    // Search filter (by lesson name - case-insensitive)
    if (searchTerm.trim()) {
      const lessonName = session.name || '';
      if (!lessonName.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
    }

    // Lesson filter
    if (filterLesson) {
      if (session.lesson !== filterLesson) {
        return false;
      }
    }

    return true;
  });

  // Automatically reset search when search input is cleared
  useEffect(() => {
    if (searchInput.trim() === "" && searchTerm !== "") {
      setSearchTerm("");
    }
  }, [searchInput, searchTerm]);

  useEffect(() => {
    selectedVideoRef.current = selectedVideo;
  }, [selectedVideo]);

  useEffect(() => {
    if (videoPopupOpen) {
      vvcViewsDecrementDoneRef.current = false;
      freeViewsDecrementDoneRef.current = false;
      watchedTenPercentRef.current = false;
      attendancePostedRef.current = false;
    }
  }, [videoPopupOpen, selectedVideo?._id]);

  useEffect(() => {
    if (!studentId) return;
    if (lastUnlockStudentIdRef.current !== studentId) {
      lastUnlockStudentIdRef.current = studentId;
      const stored = readUnlockMap(studentId);
      if (stored.size > 0) {
        setUnlockedSessions((prev) => {
          const merged = new Map(stored);
          prev.forEach((value, key) => merged.set(key, value));
          return merged;
        });
      }
      return;
    }
    writeUnlockMap(studentId, unlockedSessions);
  }, [studentId, unlockedSessions]);

  // Restore unlocked sessions from student's online_sessions on page load
  useEffect(() => {
    const restoreUnlockedSessions = async () => {
      console.log('[RESTORE] studentData:', studentData);
      if (!studentData?.online_sessions || !Array.isArray(studentData.online_sessions)) {
        console.log('[RESTORE] No online_sessions found in studentData');
        return;
      }

      console.log('[RESTORE] Starting restore process, found', studentData.online_sessions.length, 'online_sessions');
      const newUnlocked = new Map();
      const invalidIds = [];
      
      // Process each online_session entry
      for (const onlineSession of studentData.online_sessions) {
        if (!onlineSession.vvc_id || !onlineSession.video_id) {
          console.log('[RESTORE] Skipping entry - missing vvc_id or video_id:', onlineSession);
          continue;
        }

        const videoId = typeof onlineSession.video_id === 'string' 
          ? onlineSession.video_id 
          : onlineSession.video_id.toString();

        try {
          console.log('[RESTORE] Fetching VVC details for video_id:', onlineSession.video_id, 'vvc_id:', onlineSession.vvc_id);
          // Fetch VVC details by ID
          const response = await apiClient.post('/api/vvc/get-by-id', {
            vvc_id: onlineSession.vvc_id
          });

          console.log('[RESTORE] VVC response:', response.data);
          if (response.data.success && response.data.valid) {
            console.log('[RESTORE] Adding to unlocked sessions - videoId:', videoId, 'vvc_id:', response.data.vvc_id);
            newUnlocked.set(videoId, unlockInfoFromVvcResponse(response.data));
          } else {
            console.log('[RESTORE] VVC not valid:', response.data);
            invalidIds.push(videoId);
          }
        } catch (err) {
          console.error('[RESTORE] Failed to restore VVC for video:', onlineSession.video_id, err);
          // Continue with other entries even if one fails
        }
      }

      // Update unlocked sessions state (add valid, remove expired/invalid)
      console.log('[RESTORE] Restored', newUnlocked.size, 'unlocked sessions');
      if (newUnlocked.size > 0 || invalidIds.length > 0) {
        setUnlockedSessions((prev) => {
          const merged = new Map(prev);
          invalidIds.forEach((id) => merged.delete(id));
          newUnlocked.forEach((value, key) => merged.set(key, value));
          return merged;
        });
      }
    };

    restoreUnlockedSessions();
  }, [studentData, sessionsData]);

  // Handle search
  const handleSearch = () => {
    const trimmedSearch = searchInput.trim();
    setSearchTerm(trimmedSearch);
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };


  // Toggle session expansion (only one can be open at a time)
  const toggleSession = (sessionId) => {
    if (expandedSessions.has(sessionId)) {
      // If clicking on an already expanded session, close it
      setExpandedSessions(new Set());
    } else {
      // If opening a new session, close all others and open only this one
      setExpandedSessions(new Set([sessionId]));
    }
  };


  // Helper function to check if video is unlocked
  const getFreeViewingEntry = (sessionId) => {
    const list = studentData?.online_sessions;
    if (!Array.isArray(list) || !sessionId) return null;
    return list.find((s) => {
      const videoIdStr = typeof s.video_id === 'string' ? s.video_id : s.video_id?.toString();
      return videoIdStr === String(sessionId) && s.free_viewing === true;
    }) || null;
  };

  const isVvcUnlockValid = (unlockedInfo) => {
    if (!unlockedInfo) return false;
    if (unlockedInfo.code_settings === 'number_of_days') {
      // Use live number_of_days from code (admin can extend days; window starts from first open)
      if (unlockedInfo.access_started_at != null && unlockedInfo.number_of_days != null) {
        return isCodeNumberOfDaysValid(unlockedInfo.access_started_at, unlockedInfo.number_of_days);
      }
      if (unlockedInfo.deadline_date && isDeadlinePassedEgypt(unlockedInfo.deadline_date, null)) {
        return false;
      }
      return !!unlockedInfo.deadline_date;
    }
    if (unlockedInfo.code_settings === 'deadline_date' && unlockedInfo.deadline_date) {
      if (isDeadlinePassedEgypt(unlockedInfo.deadline_date, null)) return false;
    } else if (unlockedInfo.code_settings === 'number_of_views') {
      const views = Number(unlockedInfo.number_of_views);
      if (!Number.isFinite(views) || views <= 0) return false;
    }
    return true;
  };

  const isVideoUnlocked = (session) => {
    const sessionId = session._id?.toString() || session._id;
    const unlockedInfo = unlockedSessions.get(sessionId);
    const lessonData = getStudentLesson(studentData?.lessons, session.lesson);

    if (session.payment_state === 'free' || session.payment_state === 'free_if_attended_in_center') {
      const entry = getFreeViewingEntry(sessionId);
      const freeExpired = isFreeViewingExpired(session, entry, lessonData);

      if (session.payment_state === 'free_if_attended_in_center' && !freeExpired) {
        // Prefer live student lesson data: attended=true + lastAttendanceCenter not Online
        let attended = attendedInCenter(lessonData);
        // Fallback to API flag if lesson data not loaded yet
        if (!attended && lessonData == null && session._attendedInCenter === true) {
          attended = true;
        }
        if (!attended) return false;
      }

      // Free + number_of_days also requires center attendance (window from lastAttendance)
      if (
        session.payment_state === 'free' &&
        session.viewing_limit_type === 'number_of_days' &&
        !freeExpired
      ) {
        let attended = attendedInCenter(lessonData);
        if (!attended && lessonData == null && session._attendedInCenter === true) {
          attended = true;
        }
        if (!attended) return false;
      }

      // After free viewing expires → paid path: VVC unlock
      if (isVvcUnlockValid(unlockedInfo)) {
        return true;
      }

      // Still within free window
      if (!freeExpired) {
        return isFreeViewingAccessValid(session, entry, lessonData);
      }

      return false;
    }

    if (session.payment_state === 'paid') {
      if (!isVvcUnlockValid(unlockedInfo)) {
        return false;
      }
      return true;
    }
    return false;
  };

  // Handle VVC submission
  const handleVVCSubmit = async () => {
    if (!vvc || vvc.length !== 9) {
      setVvcError(getVerificationCodeMessage('vvc', CODE_ERROR.INVALID_LENGTH));
      return;
    }

    if (!pendingVideo) {
      setVvcError(getVerificationCodeMessage('vvc', CODE_ERROR.NO_VIDEO_PENDING));
      return;
    }

    setIsCheckingVvc(true);
    setVvcError('');

    try {
      const sessionId = typeof pendingVideo.session._id === 'string' 
        ? pendingVideo.session._id 
        : pendingVideo.session._id.toString();

      const response = await apiClient.post('/api/vvc/check', {
        VVC: vvc,
        session_id: sessionId,
        lesson: pendingVideo.session.lesson || ''
      });

      if (response.data.valid) {
        // VVC is valid - unlock video
        const sessionId = typeof pendingVideo.session._id === 'string' 
          ? pendingVideo.session._id 
          : pendingVideo.session._id.toString();
        
        // Store unlocked session info
        const newUnlocked = new Map(unlockedSessions);
        newUnlocked.set(sessionId, unlockInfoFromVvcResponse(response.data));
        setUnlockedSessions(newUnlocked);

        if (studentId) {
          queryClient.setQueryData(studentKeys.detail(studentId), (old) => {
            if (!old) return old;
            const list = Array.isArray(old.online_sessions) ? [...old.online_sessions] : [];
            const entry = {
              video_id: sessionId,
              vvc_id: String(response.data.vvc_id),
              date: new Date().toISOString(),
            };
            const idx = list.findIndex((s) => String(s.video_id) === sessionId);
            if (idx !== -1) list[idx] = entry;
            else list.push(entry);
            return { ...old, online_sessions: list };
          });
          queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
        }
        
        setVvcPopupOpen(false);
        setSelectedVideo({ 
          ...pendingVideo.session, 
          video_ID: pendingVideo.videoId, 
          video_type: pendingVideo.videoType,
          ...unlockInfoFromVvcResponse(response.data),
        });
        setVideoPopupOpen(true);
        videoStartTimeRef.current = Date.now();
        r2CompletedRef.current = false;
        watchedTenPercentRef.current = false;
        attendancePostedRef.current = false;
        setPendingVideo(null);
        setVvc('');
      } else {
        setVvcError(resolveVerificationCodeError('vvc', response.data));
      }
    } catch (err) {
      setVvcError(resolveVerificationCodeError('vvc', err.response?.data || CODE_ERROR.VERIFY_FAILED));
    } finally {
      setIsCheckingVvc(false);
    }
  };

  // Close VVC popup
  const closeVvcPopup = () => {
    setVvcPopupOpen(false);
    setPendingVideo(null);
    setVvc('');
    setVvcError('');
  };

  const tryDecrementVvcViewsOnWatchProgress = useCallback(async () => {
    if (vvcViewsDecrementDoneRef.current) return;
    const v = selectedVideoRef.current;
    if (!v?.vvc_id || v.code_settings !== 'number_of_views') return;
    vvcViewsDecrementDoneRef.current = true;
    try {
      const decrementResponse = await apiClient.post('/api/vvc/decrement-views', {
        vvc_id: v.vvc_id
      });
      if (decrementResponse.data.success) {
        const sessionId = typeof v._id === 'string' ? v._id : v._id.toString();
        const remaining = Number(decrementResponse.data.number_of_views);
        setUnlockedSessions((prev) => {
          const updatedUnlocked = new Map(prev);
          const sessionInfo = updatedUnlocked.get(sessionId);
          if (!sessionInfo) return updatedUnlocked;
          if (!Number.isFinite(remaining) || remaining <= 0) {
            updatedUnlocked.delete(sessionId);
          } else {
            updatedUnlocked.set(sessionId, {
              ...sessionInfo,
              number_of_views: remaining,
            });
          }
          return updatedUnlocked;
        });
        if (studentId && (!Number.isFinite(remaining) || remaining <= 0)) {
          queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
        }
      } else {
        vvcViewsDecrementDoneRef.current = false;
      }
    } catch (err) {
      console.error('Failed to decrement VVC views:', err);
      vvcViewsDecrementDoneRef.current = false;
      if (err.response?.data?.error_code === CODE_ERROR.NO_VIEWS_REMAINING
        || err.response?.data?.error?.includes('no views remaining')) {
        const sessionId = typeof v._id === 'string' ? v._id : v._id.toString();
        setUnlockedSessions((prev) => {
          const next = new Map(prev);
          next.delete(sessionId);
          return next;
        });
        if (studentId) {
          queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
        }
        setVvcError(resolveVerificationCodeError('vvc', err.response?.data || CODE_ERROR.NO_VIEWS_REMAINING));
      }
    }
  }, [studentId, queryClient]);

  const postWatchAttendance = useCallback(async (currentVideo) => {
    if (attendancePostedRef.current) return;
    if (!currentVideo || !profile?.id || !currentVideo._id) return;

    // Free / free-if-attended-in-center: only views/days — never overwrite DB attendance
    if (FREE_ONLINE_SESSION_PAYMENT_STATES.includes(currentVideo.payment_state)) {
      attendancePostedRef.current = true;
      return;
    }

    attendancePostedRef.current = true;
    try {
      const sessionId = typeof currentVideo._id === 'string'
        ? currentVideo._id
        : currentVideo._id.toString();

      await apiClient.post(`/api/students/${profile.id}/watch-video`, {
        session_id: sessionId,
        action: 'finish',
        payment_state: currentVideo.payment_state
      });

      if (isScoringEnabled) {
        try {
          const sessionLesson = currentVideo.lesson || null;
          let alreadyScored = false;
          try {
            const historyResponse = await apiClient.post('/api/scoring/get-last-history', {
              studentId: profile.id,
              type: 'attendance',
              lesson: sessionLesson
            });

            if (historyResponse.data.found && historyResponse.data.history) {
              const lastHistory = historyResponse.data.history;
              if (lastHistory.data?.status === 'attend' &&
                  (sessionLesson === null || lastHistory.process_lesson === sessionLesson)) {
                const historyTime = new Date(lastHistory.timestamp);
                const now = new Date();
                if (now - historyTime < 3600000) {
                  alreadyScored = true;
                }
              }
            }
          } catch (historyErr) {
            console.error('Error checking attendance history:', historyErr);
          }

          if (!alreadyScored) {
            let previousStatus = null;
            try {
              const historyResponse = await apiClient.post('/api/scoring/get-last-history', {
                studentId: profile.id,
                type: 'attendance',
                lesson: sessionLesson
              });
              if (historyResponse.data.found && historyResponse.data.history) {
                previousStatus = historyResponse.data.history.data?.status;
              }
            } catch (historyErr) {
              console.error('Error getting attendance history:', historyErr);
            }

            await apiClient.post('/api/scoring/calculate', {
              studentId: profile.id,
              type: 'attendance',
              lesson: sessionLesson,
              source: {
                kind: 'attendance',
                id: sessionLesson,
                label: sessionLesson,
              },
              data: {
                status: 'attend',
                previousStatus: previousStatus
              }
            });
          }
        } catch (err) {
          console.error('Error calculating attendance score:', err);
        }
      }
    } catch (err) {
      attendancePostedRef.current = false;
      console.error('Failed to mark video as finished:', err);
    }
  }, [profile?.id, isScoringEnabled]);

  const applyFreeViewingEntryToCache = useCallback(
    (sessionId, entry) => {
      if (!studentId || !sessionId || !entry) return;
      queryClient.setQueryData(studentKeys.detail(studentId), (old) => {
        if (!old) return old;
        const list = Array.isArray(old.online_sessions) ? [...old.online_sessions] : [];
        const idx = list.findIndex((s) => {
          const videoIdStr =
            typeof s.video_id === 'string' ? s.video_id : s.video_id?.toString();
          return videoIdStr === String(sessionId) && s.free_viewing === true;
        });
        if (idx >= 0) list[idx] = entry;
        else list.push(entry);
        return { ...old, online_sessions: list };
      });
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
    },
    [studentId, queryClient]
  );

  const tryDecrementFreeViewsOnWatchProgress = useCallback(async () => {
    const v = selectedVideoRef.current;
    if (!v?._id || !profile?.id || !studentId) return;
    if (!FREE_ONLINE_SESSION_PAYMENT_STATES.includes(v.payment_state)) return;
    if (v.viewing_limit_type !== 'number_of_views') return;
    if (v.vvc_id) return; // unlocked via VVC — don't consume free views
    if (freeViewsDecrementDoneRef.current) return;
    freeViewsDecrementDoneRef.current = true;
    try {
      const sessionId = typeof v._id === 'string' ? v._id : v._id.toString();
      const decrementResponse = await apiClient.post(`/api/students/${profile.id}/watch-video`, {
        session_id: sessionId,
        action: 'decrement_free_views',
        payment_state: v.payment_state,
      });
      if (decrementResponse.data.success && !decrementResponse.data.skipped) {
        if (decrementResponse.data.entry) {
          applyFreeViewingEntryToCache(sessionId, decrementResponse.data.entry);
        } else {
          queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
        }
      } else if (!decrementResponse.data.success) {
        freeViewsDecrementDoneRef.current = false;
      }
    } catch (err) {
      console.error('Failed to decrement free views:', err);
      freeViewsDecrementDoneRef.current = false;
      if (err.response?.data?.require_vvc || err.response?.data?.expired) {
        const sessionId = typeof v._id === 'string' ? v._id : v._id.toString();
        if (err.response?.data?.entry) {
          applyFreeViewingEntryToCache(sessionId, err.response.data.entry);
        } else {
          queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
        }
      }
    }
  }, [profile?.id, studentId, queryClient, applyFreeViewingEntryToCache]);

  const handleWatchTenPercent = useCallback(async () => {
    watchedTenPercentRef.current = true;
    await tryDecrementVvcViewsOnWatchProgress();
    await tryDecrementFreeViewsOnWatchProgress();
    await postWatchAttendance(selectedVideoRef.current);
  }, [tryDecrementVvcViewsOnWatchProgress, tryDecrementFreeViewsOnWatchProgress, postWatchAttendance]);

  // Handle R2 video completion (>= 90% watched)
  const handleR2VideoComplete = useCallback(async (videoId, percent) => {
    r2CompletedRef.current = true;
    console.log(`[ONLINE SESSIONS] R2 video ${videoId} completed at ${Math.round(percent)}%`);
  }, []);

  // Open video popup
  const openVideoPopup = async (session, videoId, videoIndex) => {
    // Get video type, default to 'youtube' for backward compatibility
    const videoType = session[`video_type_${videoIndex}`] || 'youtube';
    const sessionId = session._id?.toString() || session._id;
    const freeEntry = getFreeViewingEntry(sessionId);
    
    // Check if video is unlocked
    if (isVideoUnlocked(session)) {
      // Video is unlocked - check deadline date (views decrement after >=10% watch via player)
      let unlockedInfo = unlockedSessions.get(sessionId);

      // Sync number_of_days from server so admin day extensions apply automatically
      if (unlockedInfo?.vvc_id && unlockedInfo.code_settings === 'number_of_days') {
        try {
          const syncRes = await apiClient.post('/api/vvc/get-by-id', {
            vvc_id: unlockedInfo.vvc_id,
          });
          if (syncRes.data?.success && syncRes.data?.valid) {
            unlockedInfo = unlockInfoFromVvcResponse(syncRes.data);
            setUnlockedSessions((prev) => {
              const next = new Map(prev);
              next.set(sessionId, unlockedInfo);
              return next;
            });
          } else {
            setVvcError(resolveVerificationCodeError('vvc', syncRes.data));
            setUnlockedSessions((prev) => {
              const next = new Map(prev);
              next.delete(sessionId);
              return next;
            });
            setPendingVideo({ session, videoId, videoIndex, videoType });
            setVvcPopupOpen(true);
            setVvc('');
            return;
          }
        } catch (err) {
          console.error('Failed to sync VVC number_of_days:', err);
        }
      } else if (unlockedInfo) {
        // Fixed deadline_date expiration (Africa/Cairo)
        if (unlockedInfo.code_settings === 'deadline_date' && unlockedInfo.deadline_date) {
          if (isDeadlinePassedEgypt(unlockedInfo.deadline_date, null)) {
            setVvcError(getVerificationCodeMessage('vvc', CODE_ERROR.DEADLINE_EXPIRED, {
              code_settings: 'deadline_date',
              deadline_date: unlockedInfo.deadline_date,
            }));
            const newUnlocked = new Map(unlockedSessions);
            newUnlocked.delete(sessionId);
            setUnlockedSessions(newUnlocked);
            return;
          }
        }
      }

      // Free / free-if-attended: continue free access (days from lastAttendance; views from first open)
      if (
        FREE_ONLINE_SESSION_PAYMENT_STATES.includes(session.payment_state) &&
        profile?.id &&
        !unlockedInfo &&
        isFreeViewingAccessValid(
          session,
          freeEntry,
          getStudentLesson(studentData?.lessons, session.lesson)
        )
      ) {
        try {
          const startRes = await apiClient.post(`/api/students/${profile.id}/watch-video`, {
            session_id: sessionId,
            action: 'start_free_access',
            payment_state: session.payment_state,
          });
          if (startRes.data?.entry) {
            applyFreeViewingEntryToCache(sessionId, startRes.data.entry);
          } else if (studentId) {
            queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
          }
        } catch (err) {
          // Free window expired / failed → require VVC (paid path)
          if (err.response?.data?.entry) {
            applyFreeViewingEntryToCache(sessionId, err.response.data.entry);
          } else if (studentId) {
            queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
          }
          setPendingVideo({ session, videoId, videoIndex, videoType });
          setVvcPopupOpen(true);
          setVvc('');
          setVvcError(
            err.response?.data?.require_vvc || err.response?.data?.expired
              ? getVerificationCodeMessage('vvc', CODE_ERROR.FREE_VIEWING_ENDED)
              : ''
          );
          return;
        }
      }
      
      // Video is unlocked - open directly
      setSelectedVideo({ 
        ...session, 
        video_ID: videoId, 
        video_type: videoType,
        vvc_id: unlockedInfo?.vvc_id,
        code_settings: unlockedInfo?.code_settings,
        number_of_views: unlockedInfo?.number_of_views,
        number_of_days: unlockedInfo?.number_of_days,
        access_started_at: unlockedInfo?.access_started_at,
        deadline_date: unlockedInfo?.deadline_date
      });
      setVideoPopupOpen(true);
      videoStartTimeRef.current = Date.now();
      r2CompletedRef.current = false;
      watchedTenPercentRef.current = false;
      freeViewsDecrementDoneRef.current = false;
      attendancePostedRef.current = false;
    } else {
      // Locked locally — but if student already redeemed a VVC, re-check server
      // (admin may have extended number_of_days)
      const redeemed = Array.isArray(studentData?.online_sessions)
        ? studentData.online_sessions.find((s) => {
            const videoIdStr = typeof s.video_id === 'string' ? s.video_id : s.video_id?.toString();
            return videoIdStr === String(sessionId) && s.vvc_id;
          })
        : null;
      if (redeemed?.vvc_id) {
        try {
          const syncRes = await apiClient.post('/api/vvc/get-by-id', {
            vvc_id: redeemed.vvc_id,
          });
          if (syncRes.data?.success && syncRes.data?.valid) {
            const unlockedInfo = unlockInfoFromVvcResponse(syncRes.data);
            setUnlockedSessions((prev) => {
              const next = new Map(prev);
              next.set(sessionId, unlockedInfo);
              return next;
            });
            setSelectedVideo({
              ...session,
              video_ID: videoId,
              video_type: videoType,
              ...unlockedInfo,
            });
            setVideoPopupOpen(true);
            videoStartTimeRef.current = Date.now();
            r2CompletedRef.current = false;
            watchedTenPercentRef.current = false;
            freeViewsDecrementDoneRef.current = false;
            attendancePostedRef.current = false;
            return;
          }
        } catch (err) {
          console.error('Failed to revive VVC after day extension:', err);
        }
      }

      // Locked (paid, free expired, or free-if-attended without center attendance) → VVC popup
      setPendingVideo({ session, videoId, videoIndex, videoType });
      setVvcPopupOpen(true);
      setVvc('');
      setVvcError(
        FREE_ONLINE_SESSION_PAYMENT_STATES.includes(session.payment_state) &&
          isFreeViewingExpired(
            session,
            freeEntry,
            getStudentLesson(studentData?.lessons, session.lesson)
          )
          ? getVerificationCodeMessage('vvc', CODE_ERROR.FREE_VIEWING_ENDED)
          : ''
      );
    }
  };

  // Close video popup; attendance is marked at >=10% watch (fallback if still pending)
  const closeVideoPopup = async () => {
    if (isClosingVideoRef.current) {
      return;
    }
    
    const currentVideo = selectedVideo;
    setVideoPopupOpen(false);
    setSelectedVideo(null);
    videoStartTimeRef.current = null;
    r2CompletedRef.current = false;
    const videoWasWatched = watchedTenPercentRef.current;
    watchedTenPercentRef.current = false;

    if (videoWasWatched) {
      isClosingVideoRef.current = true;
      try {
        await postWatchAttendance(currentVideo);
      } finally {
        isClosingVideoRef.current = false;
      }
    }
  };

  return (
    <div className="page-wrapper" style={{ 
      minHeight: "100vh", 
      padding: "20px 5px 20px 5px" 
    }}>
      <div className="page-content" style={{ maxWidth: 800, margin: "40px auto", padding: "12px" }}>
        <Title backText="Back" href="/student_dashboard">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Image src="/video.svg" alt="Videos" width={35} height={35} />
            Recorded Sessions
          </div>
        </Title>

        {/* Search Bar */}
        <div className="search-bar-container" style={{ marginBottom: 20, width: '100%' }}>
          <InputWithButton
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyPress}
            onButtonClick={handleSearch}
          />
        </div>

        {/* Filters */}
        {sessions.length > 0 && (
          <div className="filters-container" style={{
            background: 'white',
            borderRadius: 16,
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            marginBottom: 24,
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <div className="filter-row" style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap'
            }}>
              <div className="filter-group" style={{ flex: 1, minWidth: 180 }}>
                <label className="filter-label" style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#495057', fontSize: '0.95rem' }}>
                  Filter by Lesson
                </label>
                <StudentLessonSelect
                  availableLessons={availableLessons}
                  selectedLesson={filterLesson}
                  onLessonChange={(lesson) => {
                    setFilterLesson(lesson);
                  }}
                  isOpen={filterLessonDropdownOpen}
                  onToggle={() => {
                    setFilterLessonDropdownOpen(!filterLessonDropdownOpen);
                  }}
                  onClose={() => setFilterLessonDropdownOpen(false)}
                  placeholder="Select Lesson"
                />
              </div>
            </div>
          </div>
        )}

        {/* White Background Container */}
        <div className="sessions-container" style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
        }}>

          {/* Sessions List */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>Loading sessions...</div>
          ) : filteredSessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>
              {sessions.length === 0 ? 'No sessions available.' : 'No sessions match your filters.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredSessions.map((session, index) => {
                const sessionId = session._id?.toString() || `${session.name}-${session.lesson}-${index}`;
                const isExpanded = expandedSessions.has(sessionId);
                return (
                <div
                  key={sessionId}
                  style={{
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ flex: 1 }} onClick={(e) => { e.stopPropagation(); toggleSession(sessionId); }}>
                      <div style={{ fontWeight: '600', fontSize: '1.1rem', color: '#333', marginBottom: '4px' }}>
                        {[session.lesson, session.name].filter(Boolean).join(' • ')}
                      </div>
                      {session.description && (
                        <div style={{ fontSize: '0.9rem', color: '#6c757d', marginTop: '4px' }}>
                          {session.description}
                        </div>
                      )}
                      <div style={{ fontSize: '0.85rem', color: '#999', marginTop: '8px' }}>
                        {session.date}
                      </div>
                    </div>
                    <div 
                      onClick={(e) => { e.stopPropagation(); toggleSession(sessionId); }}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        color: '#1FA8DC',
                        cursor: 'pointer',
                        marginLeft: '8px'
                      }}
                    >
                      {isExpanded ? (
                        <Image src="/chevron-down.svg" alt="Collapse" width={20} height={20} />
                      ) : (
                        <Image src="/chevron-right.svg" alt="Expand" width={20} height={20} />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
                      {/* Get all video IDs from session */}
                      {(() => {
                        const videoIds = [];
                        let videoIndex = 1;
                        while (session[`video_ID_${videoIndex}`]) {
                          videoIds.push({
                            id: session[`video_ID_${videoIndex}`],
                            index: videoIndex,
                            name: session[`video_name_${videoIndex}`] || null
                          });
                          videoIndex++;
                        }
                        return videoIds.map((video, vidIndex) => {
                          // Get video type from session data, default to 'youtube' for backward compatibility
                          const videoType = session[`video_type_${video.index}`] || 'youtube';
                          // Get video name, default to "Video {index}" if not set
                          const videoName = video.name || `Video ${video.index}`;
                          const isUnlocked = isVideoUnlocked(session);
                          return (
                            <div key={vidIndex} style={{ marginBottom: vidIndex < videoIds.length - 1 ? '12px' : '0' }}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                <div
                                  onClick={() => openVideoPopup(session, video.id, video.index)}
                                  style={{
                                    flex: 1,
                                    padding: '10px 15px',
                                    backgroundColor: isUnlocked ? '#28a745' : '#6c757d',
                                    color: 'white',
                                    borderRadius: '6px',
                                    textAlign: 'center',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = isUnlocked ? '#218838' : '#5a6268';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = isUnlocked ? '#28a745' : '#6c757d';
                                  }}
                                >
                                  <Image 
                                    src={isUnlocked ? "/unlock.svg" : "/lock.svg"} 
                                    alt={isUnlocked ? "Unlocked" : "Locked"} 
                                    width={20} 
                                    height={20} 
                                    style={{ display: 'inline-block' }} 
                                  />
                                  {videoName}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {/* Help Text */}
          <NeedHelp style={{ padding: "20px", borderTop: "1px solid #e9ecef" }} />
        </div>

        {/* VVC Popup */}
        {vvcPopupOpen && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              padding: '20px'
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                closeVvcPopup();
              }
            }}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
                borderRadius: '20px',
                padding: '40px',
                maxWidth: '450px',
                width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.2)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '1.75rem', 
                color: '#212529',
                fontWeight: '700',
                textAlign: 'center',
                letterSpacing: '-0.5px'
              }}>
                {pendingVideo ? 'Enter VVC Code' : 'Video Locked'}
              </h2>
              <p style={{ 
                margin: '0 0 28px 0', 
                color: '#6c757d', 
                fontSize: '1rem',
                textAlign: 'center',
                lineHeight: '1.5'
              }}>
                {pendingVideo
                  ? 'This video requires a VVC code. Please enter your 9-character code below.'
                  : 'This video is locked.'}
              </p>
              {pendingVideo && (
              <input
                type="text"
                value={vvc}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 9);
                  setVvc(value);
                  setVvcError('');
                }}
                placeholder="Enter VVC Code"
                style={{
                  width: '100%',
                  padding: '16px',
                  fontSize: '1.3rem',
                  textAlign: 'center',
                  letterSpacing: '6px',
                  border: vvcError ? '3px solid #dc3545' : '2px solid #dee2e6',
                  borderRadius: '12px',
                  marginBottom: '12px',
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  backgroundColor: '#ffffff',
                  transition: 'all 0.3s ease',
                  boxShadow: vvcError ? '0 0 0 4px rgba(220, 53, 69, 0.1)' : '0 2px 8px rgba(0,0,0,0.08)',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.target.style.border = '3px solid #1FA8DC';
                  e.target.style.boxShadow = '0 0 0 4px rgba(31, 168, 220, 0.15)';
                }}
                onBlur={(e) => {
                  if (!vvcError) {
                    e.target.style.border = '2px solid #dee2e6';
                    e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleVVCSubmit();
                  }
                }}
                autoFocus
              />
              )}
              {vvcError && <CodePopupMessage message={vvcError} />}
              <div style={{ display: 'flex', gap: '12px', flexDirection: 'row-reverse' }}>
                <button
                  onClick={closeVvcPopup}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    border: 'none',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(220, 53, 69, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 6px 16px rgba(220, 53, 69, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.3)';
                  }}
                >
                  {pendingVideo ? 'Cancel' : 'Close'}
                </button>
                {pendingVideo && (
                <button
                  onClick={handleVVCSubmit}
                  disabled={isCheckingVvc || !vvc || vvc.length !== 9}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    border: 'none',
                    borderRadius: '10px',
                    background: isCheckingVvc || !vvc || vvc.length !== 9 
                      ? 'linear-gradient(135deg, #ccc 0%, #bbb 100%)' 
                      : 'linear-gradient(135deg, #28a745 0%, #218838 100%)',
                    color: 'white',
                    cursor: isCheckingVvc || !vvc || vvc.length !== 9 ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                    transition: 'all 0.3s ease',
                    boxShadow: isCheckingVvc || !vvc || vvc.length !== 9 
                      ? 'none' 
                      : '0 4px 12px rgba(40, 167, 69, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isCheckingVvc && vvc && vvc.length === 9) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 6px 16px rgba(40, 167, 69, 0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCheckingVvc && vvc && vvc.length === 9) {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.3)';
                    }
                  }}
                >
                  {isCheckingVvc ? 'Verifying...' : 'Submit'}
                </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Video Player Popup */}
        {videoPopupOpen && selectedVideo && (
          <div
            className="video-popup-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              padding: '20px'
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                closeVideoPopup();
              }
            }}
          >
            <div
              ref={videoContainerRef}
              className="video-player-container"
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '900px',
                backgroundColor: '#000',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                WebkitTouchCallout: 'none',
                WebkitTapHighlightColor: 'transparent'
              }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
              onSelectStart={(e) => e.preventDefault()}
            >
              {/* Close Button */}
              <button
                onClick={closeVideoPopup}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  zIndex: 10,
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  fontSize: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  lineHeight: '1',
                  fontWeight: 'bold'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'scale(1)';
                }}
              >
                <Image src="/close-cross.svg" alt="Close" width={35} height={35} />
              </button>

              {/* Video Title */}
              <div style={{
                padding: '16px',
                backgroundColor: '#1a1a1a',
                color: 'white',
                borderBottom: '1px solid #333'
              }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{selectedVideo.name}</h3>
              </div>

              {/* Video Player - YouTube iframe or R2 Video Player */}
              <div 
                className="video-player-wrapper"
                style={{ 
                  position: 'relative', 
                  width: '100%',
                  height: 'auto',
                  maxHeight: '100vh',
                  overflow: 'hidden',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                onSelectStart={(e) => e.preventDefault()}
              >
                {selectedVideo.video_type === 'r2' ? (
                  <R2VideoPlayer
                    r2Key={selectedVideo.video_ID}
                    videoId={selectedVideo._id}
                    watermarkText={`${profile?.id || 'unknown'}`}
                    onComplete={handleR2VideoComplete}
                    onMilestonePercent={handleWatchTenPercent}
                  />
                ) : selectedVideo.video_type === 'zoom' ? (
                  <ZoomVideoPlayer
                    meetingId={selectedVideo.video_ID || selectedVideo.video_ID_1 || ''}
                    videoId={selectedVideo._id}
                    watermarkText={`${profile?.id || 'unknown'}`}
                    onComplete={handleR2VideoComplete}
                    onMilestonePercent={handleWatchTenPercent}
                  />
                ) : selectedVideo.video_type === 'google_meet' ? (
                  <GoogleMeetVideoPlayer
                    secureId={selectedVideo.video_ID || selectedVideo.video_ID_1 || ''}
                    videoId={selectedVideo._id}
                    watermarkText={`${profile?.id || 'unknown'}`}
                    onComplete={handleR2VideoComplete}
                    onMilestonePercent={handleWatchTenPercent}
                  />
                ) : selectedVideo.code_settings === 'number_of_views' && selectedVideo.vvc_id ? (
                  <YoutubeEmbedWithProgress
                    youtubeVideoId={selectedVideo.video_ID || selectedVideo.video_ID_1 || ''}
                    watermarkText={`${profile?.id || 'unknown'}`}
                    onThresholdReached={handleWatchTenPercent}
                  />
                ) : (
                  <YoutubeEmbedWithProgress
                    youtubeVideoId={selectedVideo.video_ID || selectedVideo.video_ID_1 || ''}
                    watermarkText={`${profile?.id || 'unknown'}`}
                    onThresholdReached={handleWatchTenPercent}
                  />
                )}
              </div>

              {/* Video Description */}
              {selectedVideo.description && (
                <div style={{
                  padding: '16px',
                  backgroundColor: '#1a1a1a',
                  color: '#ccc',
                  fontSize: '0.9rem',
                  lineHeight: '1.5'
                }}>
                  {selectedVideo.description}
                </div>
              )}
            </div>
          </div>
        )}

        <style jsx>{`
          @keyframes codePopupMsgIn {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          :global(.code-popup-msg) {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            margin-bottom: 20px;
            padding: 12px 14px;
            border-radius: 12px;
            background: linear-gradient(135deg, #fff5f5 0%, #ffe8e8 100%);
            border: 1px solid #f5c2c7;
            border-left: 4px solid #dc3545;
            box-shadow: 0 4px 14px rgba(220, 53, 69, 0.12);
            color: #842029;
            font-size: 0.92rem;
            font-weight: 600;
            line-height: 1.45;
            text-align: left;
            animation: codePopupMsgIn 0.28s ease;
          }

          :global(.code-popup-msg-icon) {
            flex-shrink: 0;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: #dc3545;
            color: #fff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            font-weight: 700;
            margin-top: 1px;
          }

          :global(.code-popup-msg-text) {
            flex: 1;
          }

          .sessions-container {
            background: white;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            overflow-x: auto;
          }
          
          .video-player-wrapper {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
            -webkit-tap-highlight-color: transparent !important;
            pointer-events: auto;
          }
          
          .video-player-wrapper iframe {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
          }
          
          .video-player-container {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }
          
          .video-player-container * {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
          }
          
          @media print {
            .video-player-container,
            .video-player-wrapper {
              display: none !important;
            }
          }
          
          @media (max-width: 768px) {
            .page-wrapper {
              padding: 10px 5px 10px 5px !important;
            }
            
            .page-content {
              margin: 20px auto !important;
            }
            
            .sessions-container {
              padding: 16px;
            }
            
            
            .video-popup-overlay {
              padding: 10px !important;
            }
            
            .video-player-container {
              max-width: 100% !important;
              border-radius: 8px !important;
            }
            
            .video-player-container h3 {
              font-size: 1rem !important;
              padding: 12px !important;
            }
            
            .video-player-container button {
              width: 32px !important;
              height: 32px !important;
              font-size: 18px !important;
              top: 8px !important;
              right: 8px !important;
            }
          }
          
          @media (max-width: 480px) {
            .page-wrapper {
              padding: 5px !important;
            }
            
            .page-content {
              margin: 10px auto !important;
            }
            
            .sessions-container {
              padding: 12px;
              border-radius: 12px !important;
            }
            
            
            .video-popup-overlay {
              padding: 5px !important;
            }
            
            .video-player-container {
              border-radius: 0 !important;
            }
            
            .video-player-container h3 {
              font-size: 0.9rem !important;
              padding: 10px !important;
            }
            
            .video-player-container button {
              width: 28px !important;
              height: 28px !important;
              font-size: 16px !important;
              top: 5px !important;
              right: 5px !important;
            }
          }
          
        `}</style>
      </div>
    </div>
  );
}

