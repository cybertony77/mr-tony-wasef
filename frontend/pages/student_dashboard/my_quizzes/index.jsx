import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Image from 'next/image';
import dynamic from 'next/dynamic';
import Title from '../../../components/Title';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../../lib/axios';
import { downloadFileUrl } from '../../../lib/downloadFileUrl';
import { useProfile } from '../../../lib/api/auth';
import { useSystemConfig, useNationalSystem } from '../../../lib/api/system';
import NeedHelp from '../../../components/NeedHelp';
import QuizPerformanceChart from '../../../components/QuizPerformanceChart';
const PdfViewerModal = dynamic(() => import('../../../components/PdfViewerModal'), { ssr: false });
import StudentLessonSelect from '../../../components/StudentLessonSelect';
import { isDownloadingAllowed } from '../../../components/AllowDownloadingRadio';
import { TextInput, ActionIcon, useMantineTheme } from '@mantine/core';
import { IconSearch, IconArrowRight } from '@tabler/icons-react';
import { clientItemVisibleByCenter } from '../../../lib/studentCenterMatch';
import { formatDeadlineCardLabel, isDeadlinePassedEgypt } from '../../../lib/deadlineTimeEgypt';

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

export default function MyQuizzes() {
  const { data: systemConfig } = useSystemConfig();
  const isNational = useNationalSystem();
  const isScoringEnabled = systemConfig?.scoring_system === true || systemConfig?.scoring_system === 'true';
  const isQuizzesEnabled = systemConfig?.quizzes === true || systemConfig?.quizzes === 'true';
  
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Redirect if feature is disabled
  useEffect(() => {
    if (systemConfig && !isQuizzesEnabled) {
      router.push('/student_dashboard');
    }
  }, [systemConfig, isQuizzesEnabled, router]);
  
  // Don't render if feature is disabled
  if (systemConfig && !isQuizzesEnabled) {
    return null;
  }
  const { data: profile } = useProfile();
  const [completedQuizzes, setCompletedQuizzes] = useState(new Set());
  const [errorMessage, setErrorMessage] = useState('');
  const [notePopup, setNotePopup] = useState(null);
  const [onlineQuizzes, setOnlineQuizzes] = useState([]);
  const [pdfViewer, setPdfViewer] = useState({ isOpen: false, url: '', name: '' });
  const [deadlineClockTick, setDeadlineClockTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setDeadlineClockTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  // Check for error message in URL query
  useEffect(() => {
    if (router.query.error) {
      setErrorMessage(router.query.error);
      // Clear error from URL
      router.replace('/student_dashboard/my_quizzes', undefined, { shallow: true });
    }
  }, [router.query.error]);

  // Fetch quizzes
  const { data: quizzesData, isLoading } = useQuery({
    queryKey: ['quizzes-student'],
    queryFn: async () => {
      const response = await apiClient.get('/api/quizzes/student');
      return response.data;
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: false, // Disabled to prevent auto-refresh on window focus
    refetchOnMount: true,
    refetchOnReconnect: true,
  });

  const quizzes = quizzesData?.quizzes || [];

  const centerFilteredQuizzes = useMemo(
    () =>
      quizzes
        .filter((quiz) => (quiz.state || quiz.account_state || 'Activated') !== 'Deactivated')
        .filter((q) => clientItemVisibleByCenter(q.center, profile?.main_center)),
    [quizzes, profile?.main_center]
  );

  // Search and filter states
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLesson, setFilterLesson] = useState('');
  const [filterLessonDropdownOpen, setFilterLessonDropdownOpen] = useState(false);

  // Get available lessons from quizzes (only lessons that exist in quizzes and match student's course/courseType)
  const getAvailableLessons = () => {
    const lessonSet = new Set();
    const studentCourse = (profile?.course || '').trim();
    const studentCourseType = (profile?.courseType || '').trim();
    
    centerFilteredQuizzes.forEach(quiz => {
      if (quiz.lesson && quiz.lesson.trim()) {
        // Check if quiz matches student's course and courseType
        const quizCourse = (quiz.course || '').trim();
        const quizCourseType = (quiz.courseType || '').trim();
        
        // Course match: if quiz course is "All", it matches any student course
        const courseMatch = quizCourse.toLowerCase() === 'all' || 
                           quizCourse.toLowerCase() === studentCourse.toLowerCase();
        
        // CourseType match: skip when national system; otherwise match as before
        const courseTypeMatch = isNational ||
                               !quizCourseType || 
                               !studentCourseType ||
                               quizCourseType.toLowerCase() === studentCourseType.toLowerCase();
        
        if (courseMatch && courseTypeMatch) {
          lessonSet.add(quiz.lesson);
        }
      }
    });
    return Array.from(lessonSet).sort();
  };

  const availableLessons = getAvailableLessons();

  // Filter quizzes based on search and filters
  const filteredQuizzes = centerFilteredQuizzes.filter(quiz => {
    // Search filter (by lesson name - case-insensitive)
    if (searchTerm.trim()) {
      const lessonName = quiz.lesson_name || '';
      if (!lessonName.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
    }

    // Lesson filter
    if (filterLesson) {
      if (quiz.lesson !== filterLesson) {
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

  // Fetch quiz performance chart data - always fetch even if no quizzes
  const { data: performanceData, isLoading: isChartLoading, refetch: refetchChart } = useQuery({
    queryKey: ['quiz-performance', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return { chartData: [] };
      try {
        const response = await apiClient.get(`/api/students/${profile.id}/quiz-performance`);
        return response.data || { chartData: [] };
      } catch (error) {
        console.error('Error fetching quiz performance:', error);
        return { chartData: [] }; // Return empty array on error
      }
    },
    enabled: !!profile?.id,
    refetchInterval: 15000,
    refetchOnWindowFocus: false, // Disabled to prevent auto-refresh on window focus
    refetchOnMount: true,
    refetchOnReconnect: true,
    retry: 1, // Retry once on failure
  });

  const chartData = performanceData?.chartData || [];

  // Only show chart lessons that have at least one Activated quiz
  const activeLessons = new Set(
    centerFilteredQuizzes
      .map(quiz => quiz.lesson)
      .filter(Boolean)
  );

  const filteredChartData = Array.isArray(chartData)
    ? chartData.filter(item => {
        const label = (item.lesson_name || item.lesson || '').toString().toLowerCase();
        if (!label) return false;
        if (activeLessons.size === 0) return true;
        return Array.from(activeLessons).some(lesson =>
          label.includes(String(lesson).toLowerCase()) || String(lesson).toLowerCase().includes(label)
        );
      })
    : [];

  // Fetch student's online_quizzes to check quizDegree
  const fetchStudentData = async () => {
    if (!profile?.id) return;
    try {
      const response = await apiClient.get(`/api/students/${profile.id}`);
      if (response.data) {
        if (Array.isArray(response.data.online_quizzes)) {
          setOnlineQuizzes(response.data.online_quizzes);
        }
      }
    } catch (err) {
      console.error('Error fetching student data:', err);
    }
  };

  // Refetch chart data when returning to this page
  useEffect(() => {
    const handleRouteChange = () => {
      // Invalidate and refetch chart data when route changes
      if (profile?.id) {
        queryClient.invalidateQueries({ queryKey: ['quiz-performance', profile.id] });
        queryClient.invalidateQueries({ queryKey: ['quizzes-student'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        fetchStudentData();
      }
    };

    const handleVisibilityChange = () => {
      // Refetch when page becomes visible
      if (document.visibilityState === 'visible' && profile?.id) {
        refetchChart();
        queryClient.invalidateQueries({ queryKey: ['quizzes-student'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        fetchStudentData();
      }
    };

    // Refetch when component mounts (user returns to page)
    if (profile?.id) {
      queryClient.invalidateQueries({ queryKey: ['quiz-performance', profile.id] });
      queryClient.invalidateQueries({ queryKey: ['quizzes-student'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      fetchStudentData();
    }

    // Listen for route changes
    router.events.on('routeChangeComplete', handleRouteChange);
    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router, queryClient, profile?.id, refetchChart]);

  useEffect(() => {
    fetchStudentData();
  }, [profile?.id]);

  // Keep Done/Start buttons in sync with admin resets (same cadence as charts)
  useEffect(() => {
    if (!profile?.id) return undefined;
    const id = setInterval(() => {
      fetchStudentData();
    }, 15000);
    return () => clearInterval(id);
  }, [profile?.id]);

  // Check which quizzes exist in online_quizzes array
  useEffect(() => {
    if (!profile?.id || centerFilteredQuizzes.length === 0 || !Array.isArray(onlineQuizzes)) return;

    const checkCompletions = () => {
      const completed = new Set();
      for (const quiz of centerFilteredQuizzes) {
        // Check if quiz exists in online_quizzes array
        const exists = onlineQuizzes.some(oqz => {
          const qzId = oqz.quiz_id?.toString();
          const targetId = quiz._id?.toString();
          return qzId === targetId;
        });
        if (exists) {
          completed.add(quiz._id);
        }
      }
      setCompletedQuizzes(completed);
    };

    checkCompletions();
  }, [profile?.id, centerFilteredQuizzes, onlineQuizzes]);

  // Helper function to get quizDegree for a given week and quiz_id
  const getQuizDegree = (lessonName, quizId = null) => {
    // First, try to get from lessons object
    if (lessonName && profile?.lessons) {
      const lessonData = profile.lessons[lessonName];
      if (lessonData?.quizDegree) {
        return lessonData.quizDegree;
      }
    }
    
    // If not found in weeks, try online_quizzes
    if (quizId && Array.isArray(onlineQuizzes)) {
      const quizResult = onlineQuizzes.find(qz => {
        const qzId = qz.quiz_id?.toString();
        const targetId = quizId.toString();
        return qzId === targetId;
      });
      
      if (quizResult?.result) {
        return quizResult.result; // Format: "1 / 1" or "8 / 10"
      }
    }
    
    return null;
  };

  // After deadline: mark missed quiz + apply scoring (server-side idempotent).
  useEffect(() => {
    if (!profile?.id || centerFilteredQuizzes.length === 0) return;

    const checkDeadlines = async () => {
      let profileInvalidated = false;

      for (const quiz of centerFilteredQuizzes) {
        if (
          quiz.deadline_type !== 'with_deadline' ||
          !quiz.deadline_date ||
          completedQuizzes.has(quiz._id) ||
          !quiz.lesson?.trim()
        ) {
          continue;
        }

        if (!isDeadlinePassedEgypt(quiz.deadline_date, quiz.deadline_time)) {
          continue;
        }

        try {
          await apiClient.post('/api/scoring/apply-deadline', {
            studentId: profile.id,
            kind: 'quiz',
            itemId: quiz._id.toString(),
            lesson: quiz.lesson.trim(),
          });
          profileInvalidated = true;
        } catch (err) {
          console.error(`[DEADLINE] Quiz ${quiz._id} apply-deadline failed:`, err);
        }
      }

      if (profileInvalidated) {
        queryClient.invalidateQueries(['profile']);
      }
    };

    checkDeadlines();
  }, [profile?.id, profile?.lessons, centerFilteredQuizzes, completedQuizzes, queryClient, deadlineClockTick]);

  if (isLoading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        padding: "20px 5px 20px 5px"
      }}>
        <div style={{ maxWidth: 800, margin: "40px auto", padding: "20px 5px 20px 5px" }}>
          <Title backText="Back" href="/student_dashboard">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Image src="/notepad.svg" alt="Notepad" width={32} height={32} />
              My Quizzes
            </div>
          </Title>
          
          {/* Error Message */}
          {errorMessage && (
            <div style={{
              background: '#f8d7da',
              color: '#721c24',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid #f5c6cb',
              textAlign: 'center',
              fontWeight: '500'
            }}>
              {errorMessage}
            </div>
          )}
          
          {/* White Background Container */}
          <div className="quizzes-container" style={{
            background: 'white',
            borderRadius: '16px',
            padding: '40px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{
              width: "50px",
              height: "50px",
              border: "4px solid rgba(31, 168, 220, 0.2)",
              borderTop: "4px solid #1FA8DC",
              borderRadius: "50%",
              margin: "0 auto 20px",
              animation: "spin 1s linear infinite"
            }} />
            <p style={{ color: "#6c757d", fontSize: "1rem" }}>Loading quizzes...</p>
            <style jsx>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper" style={{ 
      minHeight: "100vh", 
      padding: "20px 5px 20px 5px" 
    }}>
      <div className="page-content" style={{ maxWidth: 800, margin: "40px auto", padding: "20px 5px 20px 5px" }}>
        <Title backText="Back" href="/student_dashboard">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Image src="/notepad.svg" alt="Notepad" width={32} height={32} />
            My Quizzes
          </div>
        </Title>

        {/* Quiz Performance Chart - Outside container, under Title */}
        <div style={{
          marginBottom: '24px',
          padding: '24px',
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            margin: '0 0 20px 0',
            fontSize: '1.3rem',
            fontWeight: '700',
            color: '#212529'
          }}>
            Quiz Performance by Lesson
          </h2>
          {isChartLoading ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#6c757d',
              fontSize: '1.1rem',
              fontWeight: '500'
            }}>
              Loading chart data...
            </div>
          ) : (
            <QuizPerformanceChart chartData={filteredChartData} height={400} />
          )}
        </div>

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
        {centerFilteredQuizzes.length > 0 && (
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
        <div className="quizzes-container" style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
        }}>
          {/* Quizzes List */}
          {filteredQuizzes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>
              {centerFilteredQuizzes.length === 0 ? '❌ No quizzes available.' : '❌ No quizzes match your filters.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredQuizzes.map((quiz) => (
                <div
                  key={quiz._id}
                  className="quiz-item"
                  style={{
                    border: '2px solid #e9ecef',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#1FA8DC';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(31, 168, 220, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e9ecef';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '8px' }}>
                      {[quiz.lesson, quiz.lesson_name].filter(Boolean).join(' • ')}
                    </div>
                    {quiz.quiz_type === 'pdf' ? (
                      <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '2px solid #e9ecef', borderRadius: '8px', fontSize: '0.95rem', color: '#495057', textAlign: 'left', display: 'inline-block', maxWidth: '350px' }}>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                          {`File Name : ${quiz.pdf_file_name || 'file'}.pdf`}
                        </div>
                      </div>
                    ) : (
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: '#ffffff',
                      border: '2px solid #e9ecef',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                      color: '#495057',
                      textAlign: 'left',
                      display: 'inline-block',
                      maxWidth: '350px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>{quiz.questions?.length || 0} Question{quiz.questions?.length !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Image src="/clock.svg" alt="Timer" width={18} height={18} />
                          {quiz.timer ? `Timer ${quiz.timer} minute${quiz.timer !== 1 ? 's' : ''}` : 'No Timer'}
                        </span>
                        {quiz.deadline_type === 'with_deadline' && quiz.deadline_date && (
                          <>
                            <span>•</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Image src="/clock.svg" alt="Deadline" width={18} height={18} />
                              {formatDeadlineCardLabel(quiz.deadline_date, quiz.deadline_time)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    )}
                  </div>
                  <div className="quiz-buttons" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {quiz.quiz_type === 'pdf' && quiz.pdf_url && isDownloadingAllowed(quiz.allow_downloading) && (
                      <button onClick={(e) => { e.stopPropagation(); downloadFileUrl(quiz.pdf_url, `${quiz.pdf_file_name || 'file'}.pdf`).catch((err) => alert(err.message || 'Download failed')); }} className="qz-action-btn"
                        style={{ padding: '8px 16px', backgroundColor: '#32b750', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Image src="/pdf.svg" alt="PDF" width={18} height={18} style={{ display: 'inline-block' }} />
                        Download PDF
                      </button>
                    )}
                    {quiz.quiz_type === 'pdf' && quiz.pdf_url && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPdfViewer({ isOpen: true, url: quiz.pdf_url, name: `${quiz.pdf_file_name || 'file'}.pdf` });
                        }}
                        className="qz-action-btn"
                        style={{ padding: '8px 16px', backgroundColor: '#0d6efd', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Image src="/external-link.svg" alt="Open PDF" width={18} height={18} style={{ display: 'inline-block' }} />
                        Open PDF
                      </button>
                    )}
                    {quiz.comment && (
                      <button onClick={(e) => { e.stopPropagation(); setNotePopup(quiz.comment); }} className="qz-action-btn"
                        style={{ padding: '8px 16px', backgroundColor: '#1FA8DC', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Image src="/notes4.svg" alt="Notes" width={18} height={18} style={{ display: 'inline-block' }} />
                        Notes
                      </button>
                    )}
                    {(() => {
                      // Get quizDegree from weeks database (for display purposes only)
                      const quizDegree = getQuizDegree(quiz.lesson, quiz._id);
                      
                      // IMPORTANT: Only hide Start button if quiz exists in online_quizzes
                      // Don't hide Start button just because weeks array has quizDegree
                      // If quiz is in online_quizzes, show Details and Done buttons
                      if (completedQuizzes.has(quiz._id)) {
                        return (
                          <>
                            {(quiz.show_details_after_submitting === true || quiz.show_details_after_submitting === 'true') && (
                              <button
                                onClick={() => router.push(`/student_dashboard/my_quizzes/details?id=${quiz._id}`)}
                                style={{
                                  padding: '8px 16px',
                                  backgroundColor: '#1FA8DC',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  fontSize: '0.9rem',
                                  fontWeight: '600',
                                  transition: 'all 0.2s ease',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.backgroundColor = '#0d5a7a';
                                  e.target.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.backgroundColor = '#1FA8DC';
                                  e.target.style.transform = 'translateY(0)';
                                }}
                              >
                                <Image src="/details.svg" alt="Details" width={18} height={18} />
                                Details
                              </button>
                            )}
                            <button
                              style={{
                                padding: '8px 16px',
                                backgroundColor: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '20px',
                                cursor: 'default',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              ✅ Done{quizDegree ? ` (${quizDegree})` : ''}
                            </button>
                          </>
                        );
                      }

                      if (
                        quiz.deadline_type === 'with_deadline' &&
                        quiz.deadline_date &&
                        isDeadlinePassedEgypt(quiz.deadline_date, quiz.deadline_time)
                      ) {
                        return (
                          <button
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '20px',
                              cursor: 'default',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            {`❌ Didn't Attend The Quiz`}
                          </button>
                        );
                      }

                      if (quizDegree === "Didn't Attend The Quiz" || quizDegree === "No Quiz") {
                        return (
                          <button
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '20px',
                              cursor: 'default',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            {quizDegree === "No Quiz" ? '🚫 No Quiz' : "❌ Didn't Attend The Quiz"}
                          </button>
                        );
                      }

                      if (quiz.quiz_type === 'pdf') return null;

                      // Default: show Start button
                      return (
                        <button
                          onClick={() => router.push(`/student_dashboard/my_quizzes/start?id=${quiz._id}`)}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#218838';
                            e.target.style.transform = 'translateY(-1px)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = '#28a745';
                            e.target.style.transform = 'translateY(0)';
                          }}
                        >
                          <Image src="/play.svg" alt="Play" width={16} height={16} />
                          Start
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Help Text */}
          <NeedHelp style={{ padding: "20px", borderTop: "1px solid #e9ecef" }} />
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          .page-wrapper {
            padding: 10px 5px;
          }
          .page-content {
            margin: 20px auto;
            padding: 8px;
          }
          .quizzes-container {
            padding: 16px;
          }
          .quiz-item {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px;
          }
          .quiz-buttons {
            width: 100%;
            flex-direction: column;
          }
          .quiz-buttons button,
          .quiz-buttons a,
          .quiz-buttons .qz-action-btn {
            width: 100%;
            justify-content: center;
          }
          /* Chart container responsive */
          .page-content > div:first-of-type {
            padding: 16px !important;
            margin-bottom: 16px !important;
          }
          .page-content > div:first-of-type h2 {
            font-size: 1.3rem !important;
            margin-bottom: 16px !important;
          }
        }
        @media (max-width: 480px) {
          .page-wrapper {
            padding: 5px;
          }
          .page-content {
            margin: 10px auto;
            padding: 5px;
          }
          .quizzes-container {
            padding: 12px;
          }
          /* Chart container responsive */
          .page-content > div:first-of-type {
            padding: 12px !important;
            margin-bottom: 12px !important;
          }
          .page-content > div:first-of-type h2 {
            font-size: 1.3rem !important;
            margin-bottom: 12px !important;
          }
        }
        @media (max-width: 360px) {
          .quizzes-container {
            padding: 10px;
          }
          /* Chart container responsive */
          .page-content > div:first-of-type {
            padding: 10px !important;
          }
          .page-content > div:first-of-type h2 {
            font-size: 1.3rem !important;
          }
        }
      `}</style>

      {notePopup && (
        <div onClick={() => setNotePopup(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)', borderRadius: '20px', padding: '0', maxWidth: '500px', width: '100%', position: 'relative', boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg, #1FA8DC 0%, #17a2b8 100%)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Image src="/notes4.svg" alt="Notes" width={22} height={22} style={{ filter: 'brightness(0) invert(1)' }} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white', fontWeight: '700' }}>Note</h3>
              </div>
              <button onClick={() => setNotePopup(null)} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', padding: 0, lineHeight: 1 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#c82333'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#dc3545'; e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1.1)'}>✕</button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: '1rem', lineHeight: '1.8', color: '#495057', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{notePopup}</div>
            </div>
          </div>
        </div>
      )}
      <PdfViewerModal
        isOpen={pdfViewer.isOpen}
        fileUrl={pdfViewer.url}
        fileName={pdfViewer.name}
        onClose={() => setPdfViewer({ isOpen: false, url: '', name: '' })}
      />
    </div>
  );
}

