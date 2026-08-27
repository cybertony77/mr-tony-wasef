import React, { useState } from 'react';
import Image from 'next/image';
import { useUpdateMessageState } from '../lib/api/students';
import { generatePublicStudentLink } from '../lib/generatePublicLink';
import { useSystemConfig } from '../lib/api/system';
import apiClient from '../lib/axios';

const WhatsAppButton = ({ student, onMessageSent, onScoreUpdate, cooldownLeft = 0, showCooldown = false, onCooldownStart }) => {
  const { data: systemConfig } = useSystemConfig();
  const systemName = systemConfig?.name || 'Demo Attendance System';
  const isScoringEnabled = systemConfig?.scoring_system === true || systemConfig?.scoring_system === 'true';
  const isNational =
    systemConfig?.national_system === true || systemConfig?.national_system === 'true';
  const [message, setMessage] = useState('');
  const updateMessageStateMutation = useUpdateMessageState();
  const isCoolingDown = cooldownLeft > 0;

  const handleWhatsAppClick = () => {
    if (isCoolingDown) return;
    setMessage('');

    try {
      // Get phone number from DB (should already include country code, e.g., "201211172756")
      let parentNumber = student.parents_phone ? student.parents_phone.replace(/[^0-9]/g, '') : null;
      
      // Validate phone number exists
      if (!parentNumber || parentNumber.length < 3) {
        setMessage('Missing or invalid parent phone number');
        setTimeout(() => setMessage(''), 3000);
        // Update database to mark as failed
        const lessonName = student.attendanceLesson || student.currentLesson || (student.lessons && Object.keys(student.lessons).length > 0 ? Object.keys(student.lessons)[0] : 'N/A');
        updateMessageStateMutation.mutate({ id: student.id, message_state: false, lesson: lessonName });
        return;
      }
      
      // Auto-convert only local Egyptian mobile numbers; keep other international numbers as-is.
      const startsWithEgyptLocalMobile =
        parentNumber.startsWith('010') ||
        parentNumber.startsWith('011') ||
        parentNumber.startsWith('012') ||
        parentNumber.startsWith('015');

      if (startsWithEgyptLocalMobile) {
        parentNumber = `20${parentNumber.substring(1)}`;
      }

      // Validate student data
      if (!student.name) {
        setMessage('Student data incomplete - missing name');
        setTimeout(() => setMessage(''), 3000);
        // Update database to mark as failed
        const lessonName = student.attendanceLesson || student.currentLesson || (student.lessons && Object.keys(student.lessons).length > 0 ? Object.keys(student.lessons)[0] : 'N/A');
        updateMessageStateMutation.mutate({ id: student.id, message_state: false, lesson: lessonName });
        return;
      }

      // Get current lesson data - check attendanceLesson, currentLesson, then fallback to first lesson key
      const currentLessonName = student.attendanceLesson || student.currentLesson || (student.lessons && Object.keys(student.lessons).length > 0 ? Object.keys(student.lessons)[0] : null);
      const lessonName = currentLessonName || 'N/A'; // Use for API calls
      const lessonData = currentLessonName && student.lessons && typeof student.lessons === 'object' ? student.lessons[currentLessonName] : null;
      const currentLesson = {
        attended: student.attended_the_session || (lessonData ? lessonData.attended : false) || false,
        lastAttendance: student.lastAttendance || (lessonData ? lessonData.lastAttendance : null) || 'N/A',
        hwDone: student.hwDone || (lessonData ? lessonData.hwDone : false) || false,
        hwDegree: student.hwDegree || (lessonData ? lessonData.homework_degree : null) || null,
        quizDegree: (student.quizDegree || (lessonData ? lessonData.quizDegree : null)) ?? null
      };


      // National system: HW/quiz from SAME (current) lesson
      // Non-national: HW/quiz from PREVIOUS lesson (index - 1)
      const lessonKeys = Object.keys(student.lessons || {});
      const currentIndex = lessonKeys.findIndex(
        key => key.trim().toLowerCase() === lessonName.trim().toLowerCase()
      );

      let hwQuizLesson = null;
      let hwQuizLessonName = null;
      if (isNational) {
        hwQuizLesson = lessonData || null;
        hwQuizLessonName = currentLessonName || null;
      } else if (currentIndex > 0) {
        hwQuizLessonName = lessonKeys[currentIndex - 1];
        hwQuizLesson = student.lessons[hwQuizLessonName];
        console.log(`Previous lesson found: ${hwQuizLessonName}`, hwQuizLesson);
      } else {
        console.log(`No previous lesson found for ${lessonName}`);
      }

      // Compute homework and quiz from selected lesson (current for national, previous otherwise)
      let assignmentText = null;
      let quizDegreeText = null;

      if (hwQuizLesson) {
        if (hwQuizLesson.hwDone === true) {
          if (
            hwQuizLesson.homework_degree !== null &&
            hwQuizLesson.homework_degree !== undefined &&
            String(hwQuizLesson.homework_degree).trim() !== ''
          ) {
            assignmentText = `Done (${hwQuizLesson.homework_degree})`;
          } else {
            assignmentText = 'Done';
          }
        } else if (hwQuizLesson.hwDone === false) {
          assignmentText = 'Not Done';
        } else if (hwQuizLesson.hwDone === 'No Homework') {
          assignmentText = 'No Homework';
        } else if (hwQuizLesson.hwDone === 'Not Completed') {
          assignmentText = 'Not Completed';
        } else {
          assignmentText = 'Not Done';
        }

        if (
          hwQuizLesson.quizDegree !== null &&
          hwQuizLesson.quizDegree !== undefined &&
          String(hwQuizLesson.quizDegree).trim() !== ''
        ) {
          quizDegreeText = hwQuizLesson.quizDegree;
        }

        console.log(`Assignment: ${assignmentText}, Quiz: ${quizDegreeText}`);
      }

      // Create the message using the specified format
      // Extract first name from full name
      const firstName = student.name ? student.name.split(' ')[0] : 'Student';
      let whatsappMessage = `Follow up Message:

Dear, ${firstName}'s Parent
We want to inform you that we are in:

  • Lesson: ${lessonName}
  • Attendance Info: ${currentLesson.attended ? `${currentLesson.lastAttendance}` : 'Absent'}`;

      // Add homework and quiz if available
      const hwLabel = isNational ? 'Homework' : 'Previous Assignment';
      const quizLabel = isNational ? 'Quiz Degree' : 'Previous Quiz Degree';
      if (assignmentText || quizDegreeText) {
        if (assignmentText) {
          whatsappMessage += `
  • ${hwLabel}: ${assignmentText}`;
        }
        if (quizDegreeText) {
          whatsappMessage += `
  • ${quizLabel}: ${quizDegreeText}`;
        }
      }
      
      // Add comment if it exists and is not null/undefined
      // Get comment from the current lesson data (reuse variables from above)
      const lessonComment = lessonData ? lessonData.comment : null;
      
      if (lessonComment && lessonComment.trim() !== '' && lessonComment !== 'undefined') {
        whatsappMessage += `
  • Comment: ${lessonComment}`;
      }

      // Generate public link with HMAC
      const publicLink = generatePublicStudentLink(student.id.toString());

      const isPaymentSystemEnabled = systemConfig?.payment_system === true || systemConfig?.payment_system === 'true';

      whatsappMessage += `

Please visit the following link to check ${firstName}'s grades and progress: ⬇️

🖇️ ${publicLink}

Note :-
  • ${firstName}'s ID: ${student.id}${isPaymentSystemEnabled ? `
  • Number of Remaining Sessions: ${student.payment?.numberOfSessions ?? 0}${(student.payment?.numberOfSessions ?? 0) <= 2 ? `

*Please renew to continue your sessions without interruption.*` : ''}` : ''}

We wish ${firstName} gets high grades 😊❤

– ${systemName}`;

      // Create WhatsApp URL with the formatted message
      const whatsappUrl = `https://wa.me/${parentNumber}?text=${encodeURIComponent(whatsappMessage)}`;
      
      // Log the final phone number for debugging
      console.log('Attempting to send WhatsApp to:', parentNumber, 'Original:', student.parents_phone);
      
      // Try to open WhatsApp in a new tab/window
      const whatsappWindow = window.open(whatsappUrl, '_blank');
      
      // Check if window was blocked or failed to open
      if (!whatsappWindow || whatsappWindow.closed || typeof whatsappWindow.closed == 'undefined') {
        setMessage('Popup blocked - please allow popups and try again');
        setTimeout(() => setMessage(''), 3000);
        // Update database to mark as failed
        updateMessageStateMutation.mutate({ id: student.id, message_state: false, lesson: lessonName });
        return;
      }
      
      // Additional check: if the window opened but immediately closed, it might be an invalid number
      setTimeout(() => {
        if (whatsappWindow.closed) {
          console.log('WhatsApp window closed immediately - possibly invalid number');
          // Note: We can't reliably detect this, so we'll rely on user feedback
        }
      }, 1000);
      
      // If we reach here, everything was successful
      setMessage('WhatsApp opened successfully!');
      if (typeof onCooldownStart === 'function') {
        onCooldownStart();
      }
      
      // Update message state in database
      console.log('Updating message state in database for student:', student.id, 'lesson:', lessonName);
      console.log('Student data:', { id: student.id, attendanceLesson: student.attendanceLesson, name: student.name });
      console.log('Student lessons data:', student.lessons);
      
      // Homework scoring lesson: current for national, previous for non-national
      const scoringHwLessonName = isNational
        ? lessonName
        : (currentIndex > 0 ? lessonKeys[currentIndex - 1] : null);
      const scoringHwLesson = isNational ? lessonData : hwQuizLesson;

      // Run message_state update and scoring in parallel (don't block on mutation)
      // 1. Update message_state in database
      updateMessageStateMutation.mutate(
        { id: student.id, message_state: true, lesson: lessonName },
        {
          onSuccess: () => {
            console.log('Message state updated successfully in database for lesson:', lessonName);
            if (onMessageSent) {
              onMessageSent(student.id, true);
            }
          },
          onError: (error) => {
            console.error('Failed to update message state in database:', error);
            console.error('Error details:', error.response?.data || error.message);
            setMessage('WhatsApp sent but failed to update status');
            setTimeout(() => setMessage(''), 3000);
          }
        }
      );

      // 2. Apply scoring rules (async, fire-and-forget)
      // IMPORTANT: Check scoring_system_history first to prevent duplicate scoring on multiple clicks
      if (isScoringEnabled) {
        (async () => {
          try {
            let scoreUpdated = false;

            // === ATTENDANCE: Apply absent scoring on CURRENT lesson (attend=false) ===
            if (!currentLesson.attended) {
              try {
                // Check if absent scoring was already applied for this student+lesson
                const historyResponse = await apiClient.post('/api/scoring/get-last-history', {
                  studentId: student.id,
                  type: 'attendance',
                  lesson: lessonName
                });

                const alreadyApplied = historyResponse.data.found && 
                  historyResponse.data.history?.data?.status === 'absent';

                if (alreadyApplied) {
                  console.log(`[SCORING] Absent scoring already applied for student ${student.id}, lesson "${lessonName}" — skipping to prevent duplicate`);
                } else {
                  // Get previous status for proper score calculation
                  const previousStatus = historyResponse.data.found 
                    ? historyResponse.data.history?.data?.status 
                    : null;

                  await apiClient.post('/api/scoring/calculate', {
                    studentId: student.id,
                    type: 'attendance',
                    lesson: lessonName,
                    data: {
                      status: 'absent',
                      previousStatus: previousStatus
                    }
                  });
                  console.log(`[SCORING] Absent score applied for student ${student.id}, lesson "${lessonName}"`);
                  scoreUpdated = true;
                }
              } catch (err) {
                console.error('Error calculating absent score:', err);
              }
            }

            // === HOMEWORK: Apply hwDone=false scoring
            // National: CURRENT lesson | Non-national: PREVIOUS lesson
            if (scoringHwLesson && scoringHwLesson.hwDone === false && scoringHwLessonName) {
              try {
                // Check if homework "Not Done" scoring was already applied for this student+lesson
                const historyResponse = await apiClient.post('/api/scoring/get-last-history', {
                  studentId: student.id,
                  type: 'homework',
                  lesson: scoringHwLessonName
                });

                const alreadyApplied = historyResponse.data.found && 
                  historyResponse.data.history?.data?.hwDone === false;

                if (alreadyApplied) {
                  console.log(`[SCORING] Homework "Not Done" scoring already applied for student ${student.id}, lesson "${scoringHwLessonName}" — skipping to prevent duplicate`);
                } else {
                  // Get previous hwDone state for proper score calculation
                  const previousHwDone = historyResponse.data.found 
                    ? (historyResponse.data.history?.data?.hwDone !== undefined ? historyResponse.data.history.data.hwDone : null)
                    : null;

                  await apiClient.post('/api/scoring/calculate', {
                    studentId: student.id,
                    type: 'homework',
                    lesson: scoringHwLessonName,
                    data: {
                      hwDone: false,
                      previousHwDone: previousHwDone
                    }
                  });
                  console.log(`[SCORING] Homework "Not Done" score applied for student ${student.id}, lesson "${scoringHwLessonName}"`);
                  scoreUpdated = true;
                }
              } catch (err) {
                console.error('Error calculating homework "Not Done" score:', err);
              }
            }

            if (scoreUpdated && onScoreUpdate) {
              onScoreUpdate();
            }
          } catch (err) {
            console.error('Error in scoring calculations:', err);
          }
        })();
      }
      
      setTimeout(() => setMessage(''), 3000);

    } catch (error) {
      // Handle any unexpected errors
      console.error('WhatsApp sending error:', error);
      setMessage('Error occurred while opening WhatsApp');
      setTimeout(() => setMessage(''), 3000);
      // Update database to mark as failed
      const lessonName = student.attendanceLesson || student.currentLesson || (student.lessons && Object.keys(student.lessons).length > 0 ? Object.keys(student.lessons)[0] : 'N/A');
      updateMessageStateMutation.mutate({ id: student.id, message_state: false, lesson: lessonName });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minHeight: '54px' }}>
      <button
        onClick={handleWhatsAppClick}
        disabled={isCoolingDown}
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: isCoolingDown ? '#1c1f24' : 'rgb(37, 211, 102)',
          color: '#ffffff',
          border: 'none',
          outline: 'none',
          borderRadius: '10px',
          padding: '6px 12px',
          fontSize: '12px',
          cursor: isCoolingDown ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: '600',
          transition: 'background 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.45s ease, letter-spacing 0.45s ease',
          boxShadow: isCoolingDown
            ? '0 6px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)'
            : '0 3px 10px rgba(37, 211, 102, 0.3)',
          minWidth: '78px',
          justifyContent: 'center',
          transform: isCoolingDown ? 'scale(0.985)' : 'scale(1)',
          letterSpacing: isCoolingDown ? '0.03em' : '0',
        }}
        onMouseEnter={(e) => {
          if (isCoolingDown) return;
          e.currentTarget.style.transform = 'translateY(-1px) scale(1)';
          e.currentTarget.style.boxShadow = '0 5px 14px rgba(37, 211, 102, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = isCoolingDown ? 'scale(0.985)' : 'scale(1)';
          e.currentTarget.style.boxShadow = isCoolingDown
            ? '0 6px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)'
            : '0 3px 10px rgba(37, 211, 102, 0.3)';
        }}
        title={isCoolingDown ? `Wait ${cooldownLeft}s before sending again` : 'Send WhatsApp'}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            background: 'linear-gradient(160deg, #2a2f36 0%, #1c1f24 55%, #14171b 100%)',
            opacity: isCoolingDown ? 1 : 0,
            transition: 'opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <span
          style={{
            position: 'relative',
            zIndex: 1,
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Image
            src="/whatsapp.svg"
            alt=""
            width={28}
            height={28}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: isCoolingDown ? 0 : 1,
              transform: isCoolingDown ? 'scale(0.65) rotate(-12deg)' : 'scale(1) rotate(0deg)',
              transition: 'opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
              pointerEvents: 'none',
            }}
          />
          <Image
            src="/close-cross.svg"
            alt=""
            width={28}
            height={28}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: isCoolingDown ? 1 : 0,
              transform: isCoolingDown ? 'scale(1) rotate(0deg)' : 'scale(0.65) rotate(12deg)',
              transition: 'opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
              pointerEvents: 'none',
            }}
          />
        </span>
        <span
          style={{
            position: 'relative',
            zIndex: 1,
            transition: 'opacity 0.4s ease, color 0.4s ease, letter-spacing 0.45s ease',
            opacity: isCoolingDown ? 0.88 : 1,
            color: isCoolingDown ? 'rgba(255,255,255,0.78)' : '#ffffff',
            letterSpacing: isCoolingDown ? '0.02em' : '0',
          }}
        >
          Send
        </span>
      </button>

      <div
        style={{
          minHeight: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          className="wa-cooldown-text"
          aria-live="polite"
          style={{
            opacity: showCooldown ? 1 : 0,
            transform: showCooldown ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.92)',
            transition: 'opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1), transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
            pointerEvents: 'none',
          }}
        >
          {showCooldown ? `${cooldownLeft}s` : '\u00a0'}
        </div>
        {!showCooldown && message ? (
          <div style={{
            position: 'absolute',
            fontSize: '10px',
            color: message.includes('success') ? '#28a745' : '#dc3545',
            textAlign: 'center',
            lineHeight: 1.2,
            opacity: 1,
            transition: 'opacity 0.35s ease',
          }}>
            {message}
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .wa-cooldown-text {
          font-size: 11px;
          font-weight: 800;
          color: #c62828;
          letter-spacing: 0.06em;
          line-height: 1.2;
          user-select: none;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(198, 40, 40, 0.08);
        }
      `}</style>
    </div>
  );
};

export default WhatsAppButton;
