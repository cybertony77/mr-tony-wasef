import { useNationalSystem, getCourseFieldLabels } from '../../../lib/api/system';
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../../lib/axios';
import { useProfile } from '../../../lib/api/auth';
import Title from '../../../components/Title';
import CourseSelect from '../../../components/CourseSelect';
import CourseTypeSelect from '../../../components/CourseTypeSelect';
import CenterSelect from '../../../components/CenterSelect';
import ScoreSelect from '../../../components/ScoreSelect';
import { IconArrowRight, IconSearch, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { ActionIcon, TextInput, useMantineTheme, ScrollArea, Table } from '@mantine/core';
import LoadingSkeleton from '../../../components/LoadingSkeleton';
import Image from 'next/image';
import cx from 'clsx';
import classes from '../../../styles/TableScrollArea.module.css';

function getScoreColor(score) {
  if (score >= 400) return '#28a745';
  if (score >= 150) return '#1FA8DC';
  if (score >= 50) return '#0ac5b2';
  if (score <= 20) return '#6c757d';
  return '#dc3545';
}

function InputWithButton({ onButtonClick, onKeyDown, ...props }) {
  const theme = useMantineTheme();
  
  const handleKeyDown = (e) => {
    if (onKeyDown) {
      onKeyDown(e);
    }
    if (props.onKeyDown) {
      props.onKeyDown(e);
    }
  };
  
  return (
    <TextInput
      radius="xl"
      size="md"
      placeholder="Search by Student ID, Name, or Student Number"
      rightSectionWidth={42}
      leftSection={<IconSearch size={18} stroke={1.5} />}
      rightSection={
        <ActionIcon 
          size={32} 
          radius="xl" 
          color={theme.primaryColor} 
          variant="filled"
          onClick={onButtonClick}
          style={{ cursor: 'pointer' }}
          aria-label="Search"
        >
          <IconArrowRight size={18} stroke={1.5} />
        </ActionIcon>
      }
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export default function ViewScores() {
  const isNational = useNationalSystem();
  const courseLabels = getCourseFieldLabels(isNational);
  const router = useRouter();
  const containerRef = useRef(null);
  const { data: profile, isLoading: profileLoading } = useProfile();
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedCourseType, setSelectedCourseType] = useState("");
  const [selectedCenter, setSelectedCenter] = useState("");
  const [selectedScore, setSelectedScore] = useState("");
  const [openDropdown, setOpenDropdown] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showPagePopup, setShowPagePopup] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pageSize = 100;

  useEffect(() => {
    if (!profileLoading && profile) {
      const allowedRoles = ['admin', 'developer', 'assistant'];
      if (!allowedRoles.includes(profile.role)) {
        setAccessDenied(true);
      }
    }
  }, [profile, profileLoading]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch students with scores and rankings
  const { data: studentsResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['scoring-view-scores', currentPage, searchTerm || '', selectedCourse, selectedCourseType, selectedCenter, selectedScore],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage);
      params.append('limit', pageSize);
      // Only append search if it's not empty (empty string means show all)
      if (searchTerm && searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      if (selectedCourse) params.append('course', selectedCourse);
      if (selectedCourseType) params.append('courseType', selectedCourseType);
      if (selectedCenter) params.append('center', selectedCenter);
      if (selectedScore) params.append('score', selectedScore);
      params.append('sortBy', 'score');
      params.append('sortOrder', 'desc');
      
      const response = await apiClient.get(`/api/scoring/view-scores?${params.toString()}`);
      return response.data;
    },
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 2 * 60 * 1000,
  });

  const students = studentsResponse?.data || [];
  const pagination = studentsResponse?.pagination || {
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false,
  };

  const handleSearch = () => {
    const trimmedSearch = searchInput.trim();
    setSearchTerm(trimmedSearch);
    setCurrentPage(1); // Reset to first page when searching
  };

  // Automatically reset search and go to page 1 when search input is cleared
  useEffect(() => {
    if (searchInput.trim() === "" && searchTerm !== "") {
      // If input is cleared but search term still has value, automatically clear search
      setSearchTerm("");
      setCurrentPage(1);
    }
  }, [searchInput, searchTerm]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCourse, selectedCourseType, selectedCenter, selectedScore, searchTerm]);

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handlePreviousPage = () => {
    if (pagination.hasPrevPage) {
      setCurrentPage(prev => Math.max(1, prev - 1));
      setShowPagePopup(false);
      // Scroll to top of table
      if (containerRef.current) {
        containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const handleNextPage = () => {
    if (pagination.hasNextPage) {
      setCurrentPage(prev => prev + 1);
      setShowPagePopup(false);
      // Scroll to top of table
      if (containerRef.current) {
        containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const handlePageClick = (pageNum) => {
    if (pageNum >= 1 && pageNum <= pagination.totalPages) {
      setCurrentPage(pageNum);
      setShowPagePopup(false);
      // Scroll to top of table
      if (containerRef.current) {
        containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showPagePopup && !event.target.closest('.pagination-page-info') && !event.target.closest('.page-popup')) {
        setShowPagePopup(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPagePopup]);

  if (profileLoading || isLoading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        padding: "20px 5px 20px 5px"
      }}>
        <div style={{ maxWidth: 1400, width: '100%', margin: "40px auto", padding: "12px" }}>
          <Title backText="Back" href="/dashboard/manage_scoring_system">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Image src="/stars.svg" alt="View Scores" width={32} height={32} />
              View Scores and Ranks
            </div>
          </Title>
          <LoadingSkeleton type="table" rows={8} columns={8} />
        </div>
      </div>
    );
  }

  if (accessDenied || !profile || !['admin', 'developer', 'assistant'].includes(profile.role)) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p>You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: "100vh", 
      padding: "20px 5px 20px 5px" 
    }}>
      <div ref={containerRef} style={{ maxWidth: 1000, width: '100%', margin: "40px auto", padding: "12px" }}>
        <Title backText="Back" href="/dashboard/manage_scoring_system">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Image src="/stars.svg" alt="View Scores" width={32} height={32} />
            View Scores and Ranks
          </div>
        </Title>

        {/* Search Bar */}
        <div style={{ marginBottom: 20 }}>
          <InputWithButton
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyPress}
            onButtonClick={handleSearch}
          />
        </div>

        {/* Filters */}
        <div className="filters-container">
          <div className="filter-row">
            <div className="filter-group">
              <label className="filter-label">{courseLabels.filterByCourse}</label>
              <CourseSelect
                selectedGrade={selectedCourse}
                onGradeChange={(course) => {
                  setSelectedCourse(course);
                  setCurrentPage(1);
                }}
                isOpen={openDropdown === 'course'}
                onToggle={() => setOpenDropdown(openDropdown === 'course' ? null : 'course')}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
            {courseLabels.showCourseType && (
<div className="filter-group">
              <label className="filter-label">Filter by Course Type</label>
              <CourseTypeSelect
                selectedCourseType={selectedCourseType}
                onCourseTypeChange={(courseType) => {
                  setSelectedCourseType(courseType);
                  setCurrentPage(1);
                }}
                isOpen={openDropdown === 'courseType'}
                onToggle={() => setOpenDropdown(openDropdown === 'courseType' ? null : 'courseType')}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
)}
            <div className="filter-group">
              <label className="filter-label">Filter by Main Center</label>
              <CenterSelect
                selectedCenter={selectedCenter}
                onCenterChange={(center) => {
                  setSelectedCenter(center);
                  setCurrentPage(1);
                }}
                isOpen={openDropdown === 'center'}
                onToggle={() => setOpenDropdown(openDropdown === 'center' ? null : 'center')}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
            <div className="filter-group">
              <label className="filter-label">Filter by Score</label>
              <ScoreSelect
                selectedScore={selectedScore}
                onScoreChange={(score) => {
                  setSelectedScore(score);
                  setCurrentPage(1);
                }}
                isOpen={openDropdown === 'score'}
                onToggle={() => setOpenDropdown(openDropdown === 'score' ? null : 'score')}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="history-container">
          <div className="history-title">
            Student Scores ({pagination.totalCount} records)
          </div>
          {error && (
            <div style={{
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
              textAlign: 'center',
              fontWeight: 600,
              border: '1.5px solid #fca5a5',
              fontSize: '1.1rem',
              boxShadow: '0 4px 16px rgba(220, 53, 69, 0.08)'
            }}>
              {error.message || "Failed to fetch students data"}
            </div>
          )}

          {students.length === 0 ? (
            <div className="no-results">
              {searchTerm || selectedCourse || selectedCourseType || selectedCenter
                ? "No students found with the current filters."
                : "No students found."}
            </div>
          ) : (
            <div className="scores-table-wrap">
              <ScrollArea
                h={isMobile ? 360 : 480}
                type="hover"
                onScrollPositionChange={({ y }) => setScrolled(y !== 0)}
                offsetScrollbars
              >
                <Table
                  miw={isMobile ? (courseLabels.showCourseType ? 940 : 840) : (courseLabels.showCourseType ? 1280 : 1160)}
                  verticalSpacing={isMobile ? 'xs' : 'sm'}
                  horizontalSpacing={isMobile ? 'xs' : 'md'}
                  highlightOnHover
                  striped
                  withTableBorder={false}
                  style={{ width: '100%' }}
                >
                  <Table.Thead className={cx(classes.header, { [classes.scrolled]: scrolled })}>
                    <Table.Tr>
                      <Table.Th style={{ minWidth: isMobile ? 44 : 70, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>ID</Table.Th>
                      <Table.Th style={{ minWidth: isMobile ? 72 : 140, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>Name</Table.Th>
                      <Table.Th style={{ minWidth: isMobile ? 52 : 90, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>Gender</Table.Th>
                      <Table.Th style={{ minWidth: isMobile ? 52 : 90, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>Grade</Table.Th>
                      <Table.Th style={{ minWidth: isMobile ? 56 : 110, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>{courseLabels.course}</Table.Th>
                      {courseLabels.showCourseType && (
                        <Table.Th style={{ minWidth: isMobile ? 56 : 110, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>Type</Table.Th>
                      )}
                      <Table.Th style={{ minWidth: isMobile ? 64 : 140, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>School</Table.Th>
                      <Table.Th style={{ minWidth: isMobile ? 64 : 120, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>Center</Table.Th>
                      <Table.Th style={{ minWidth: isMobile ? 44 : 90, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>Score</Table.Th>
                      <Table.Th style={{ minWidth: isMobile ? 72 : 140, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>Rank (Center)</Table.Th>
                      <Table.Th style={{ minWidth: isMobile ? 72 : 140, textAlign: 'center', fontSize: isMobile ? 11 : undefined }}>Rank ({courseLabels.course})</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {students.map((student, idx) => {
                      const score = student.score !== null && student.score !== undefined ? student.score : 0;
                      const cellFont = isMobile ? 11 : 15;
                      return (
                        <Table.Tr key={student.id || idx}>
                          <Table.Td style={{ textAlign: 'center', fontSize: cellFont }}>{student.id}</Table.Td>
                          <Table.Td style={{ textAlign: 'center', fontSize: cellFont, fontWeight: 500 }}>
                            {student.name || '-'}
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'center', fontSize: cellFont }}>{student.gender || '-'}</Table.Td>
                          <Table.Td style={{ textAlign: 'center', fontSize: cellFont }}>{student.grade || '-'}</Table.Td>
                          <Table.Td style={{ textAlign: 'center', fontSize: cellFont }}>
                            {student.course || student.grade || '-'}
                          </Table.Td>
                          {courseLabels.showCourseType && (
                            <Table.Td style={{ textAlign: 'center', fontSize: cellFont }}>
                              {student.courseType || '-'}
                            </Table.Td>
                          )}
                          <Table.Td style={{ textAlign: 'center', fontSize: cellFont }}>{student.school || '-'}</Table.Td>
                          <Table.Td style={{ textAlign: 'center', fontSize: cellFont }}>
                            {student.main_center || '-'}
                          </Table.Td>
                          <Table.Td
                            style={{
                              textAlign: 'center',
                              fontSize: cellFont,
                              fontWeight: 700,
                              color: getScoreColor(score),
                            }}
                          >
                            {score}
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'center', fontSize: cellFont }}>
                            {student.centerRank && student.centerTotal
                              ? `${student.centerRank}/${student.centerTotal}`
                              : '-'}
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'center', fontSize: cellFont }}>
                            {student.courseRank && student.courseTotal
                              ? `${student.courseRank}/${student.courseTotal}`
                              : '-'}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalCount > 0 && (
            <div className="pagination-container">
              <button
                className="pagination-button"
                onClick={handlePreviousPage}
                disabled={!pagination.hasPrevPage}
                aria-label="Previous page"
              >
                <IconChevronLeft size={20} stroke={2} />
              </button>
              
              <div 
                className={`pagination-page-info ${pagination.totalPages > 1 ? 'clickable' : ''}`}
                onClick={() => pagination.totalPages > 1 && setShowPagePopup(!showPagePopup)}
                style={{ position: 'relative', cursor: pagination.totalPages > 1 ? 'pointer' : 'default' }}
              >
                Page {pagination.currentPage} of {pagination.totalPages}
                
                {/* Page Number Popup */}
                {showPagePopup && pagination.totalPages > 1 && (
                  <div className="page-popup">
                    <div className="page-popup-content">
                      <div className="page-popup-header">Select Page</div>
                      <div className="page-popup-grid">
                        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(pageNum => (
                          <button
                            key={pageNum}
                            className={`page-number-btn ${pageNum === pagination.currentPage ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePageClick(pageNum);
                            }}
                          >
                            {pageNum}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <button
                className="pagination-button"
                onClick={handleNextPage}
                disabled={!pagination.hasNextPage}
                aria-label="Next page"
              >
                <IconChevronRight size={20} stroke={2} />
              </button>
            </div>
          )}
        </div>

        <style jsx>{`
          .filters-container {
            background: white;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            margin-bottom: 24px;
          }
          .filter-row {
            display: flex;
            gap: 12px;
            margin-bottom: 16px;
            flex-wrap: wrap;
          }
          .filter-group {
            flex: 1;
            min-width: 180px;
          }
          .filter-label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #495057;
            font-size: 0.95rem;
          }
          .history-container {
            background: white;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            overflow: hidden;
            width: 100%;
          }
          .scores-table-wrap {
            width: 100%;
            border-radius: 12px;
            border: 1px solid #e9ecef;
            overflow: hidden;
            background: #fff;
          }
          .history-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: #495057;
            margin-bottom: 20px;
            text-align: center;
          }
          .no-results {
            text-align: center;
            color: #6c757d;
            font-style: italic;
            padding: 40px 20px;
          }
          
          .pagination-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
            margin-top: 24px;
            padding-top: 24px;
            border-top: 2px solid #e9ecef;
          }
          
          .pagination-button {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 44px;
            height: 44px;
            border: 2px solid #1FA8DC;
            background: white;
            color: #1FA8DC;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(31, 168, 220, 0.1);
          }
          
          .pagination-button:hover:not(:disabled) {
            background: #1FA8DC;
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(31, 168, 220, 0.3);
          }
          
          .pagination-button:active:not(:disabled) {
            transform: translateY(0);
          }
          
          .pagination-button:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            border-color: #adb5bd;
            color: #adb5bd;
            box-shadow: none;
          }
          
          .pagination-page-info {
            font-size: 1.1rem;
            font-weight: 600;
            color: #495057;
            min-width: 120px;
            text-align: center;
            padding: 8px 16px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #e9ecef;
            transition: all 0.2s ease;
          }
          
          .pagination-page-info.clickable:hover {
            background: #e9ecef;
            border-color: #1FA8DC;
            cursor: pointer;
          }
          
          .page-popup {
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            margin-bottom: 8px;
            z-index: 1000;
          }
          
          .page-popup-content {
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            border: 2px solid #1FA8DC;
            padding: 16px;
            min-width: 300px;
            max-width: 500px;
            max-height: 400px;
            overflow-y: auto;
          }
          
          .page-popup-header {
            font-size: 1.1rem;
            font-weight: 700;
            color: #495057;
            margin-bottom: 12px;
            text-align: center;
            padding-bottom: 8px;
            border-bottom: 2px solid #e9ecef;
          }
          
          .page-popup-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
            gap: 8px;
            max-height: 300px;
            overflow-y: auto;
          }
          
          .page-number-btn {
            padding: 10px;
            border: 2px solid #e9ecef;
            background: white;
            color: #495057;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.95rem;
            transition: all 0.2s ease;
          }
          
          .page-number-btn:hover {
            background: #1FA8DC;
            color: white;
            border-color: #1FA8DC;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(31, 168, 220, 0.3);
          }
          
          .page-number-btn.active {
            background: #1FA8DC;
            color: white;
            border-color: #1FA8DC;
            font-weight: 700;
          }

          @media (max-width: 768px) {
            .filters-container {
              padding: 16px;
            }
            .filter-row {
              flex-direction: column;
            }
            .filter-group {
              min-width: 100%;
            }
            .history-container {
              padding: 16px;
              overflow-x: hidden;
            }
            .history-title {
              font-size: 1.3rem;
            }
            .scores-table-wrap {
              border-radius: 10px;
              zoom: 0.92;
            }
            .pagination-page-info {
              font-size: 1rem;
              min-width: 100px;
              padding: 6px 12px;
            }
            .page-popup {
              left: 50%;
              right: auto;
              width: calc(100vw - 40px);
              max-width: 400px;
            }
            
            .page-popup-content {
              min-width: auto;
              max-width: 100%;
              padding: 12px;
              max-height: 300px;
            }
            
            .page-popup-header {
              font-size: 1rem;
              margin-bottom: 10px;
              padding-bottom: 6px;
            }
            
            .page-popup-grid {
              grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
              gap: 6px;
              max-height: 250px;
            }
            
            .page-number-btn {
              padding: 8px;
              font-size: 0.85rem;
            }
          }
          @media (max-width: 480px) {
            .filters-container {
              padding: 12px;
            }
            .history-container {
              padding: 12px;
              overflow-x: hidden;
            }
            .history-title {
              font-size: 1.1rem;
            }
            .scores-table-wrap {
              zoom: 0.90;
            }
            .pagination-container {
              gap: 8px;
            }
            .pagination-button {
              width: 36px;
              height: 36px;
            }
            .pagination-page-info {
              font-size: 0.9rem;
              min-width: 90px;
              padding: 6px 10px;
            }
          }

          @supports not (zoom: 1) {
            @media (max-width: 768px) {
              .scores-table-wrap {
                zoom: unset;
                transform: scale(0.92);
                transform-origin: top left;
                width: 108.70%;
              }
            }
            @media (max-width: 480px) {
              .scores-table-wrap {
                transform: scale(0.90);
                width: 111.11%;
              }
            }
          }
        `}</style>
      </div>
    </div>
  );
}
