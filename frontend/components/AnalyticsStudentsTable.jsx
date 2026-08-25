import { useNationalSystem, getCourseFieldLabels } from '../lib/api/system';
import { useEffect, useMemo, useState } from 'react';
import { Table } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import styles from '../styles/TableScrollArea.module.css';

const PAGE_SIZE = 30;

export default function AnalyticsStudentsTable({ students = [], categoryLabel = 'Total Students' }) {
  const isNational = useNationalSystem();
  const courseLabels = getCourseFieldLabels(isNational);
  const columns = useMemo(() => [
    { key: 'id', label: 'ID', minWidth: 70 },
    { key: 'name', label: 'Name', minWidth: 140 },
    { key: 'course', label: courseLabels.course, minWidth: 110 },
    ...(courseLabels.showCourseType ? [{ key: 'courseType', label: 'Course Type', minWidth: 120 }] : []),
    { key: 'degree', label: 'Degree', minWidth: 90 },
    { key: 'percentage', label: 'Percentage', minWidth: 100 },
    { key: 'wrongQuestions', label: 'Wrong Questions', minWidth: 180 },
  ], [courseLabels.course, courseLabels.showCourseType]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showPagePopup, setShowPagePopup] = useState(false);

  const totalCount = students.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  useEffect(() => {
    setCurrentPage(1);
    setShowPagePopup(false);
  }, [students, categoryLabel]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!showPagePopup) return undefined;
    const handleClick = (event) => {
      if (!event.target.closest('.pagination-page-info') && !event.target.closest('.page-popup')) {
        setShowPagePopup(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPagePopup]);

  const pagedStudents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return students.slice(start, start + PAGE_SIZE);
  }, [students, currentPage]);

  const goToPage = (pageNumber) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      setShowPagePopup(false);
    }
  };

  return (
    <div className="analytics-table-section">
      <div className="analytics-table-heading">
        <h3>Students</h3>
        <p>
          Showing {pagedStudents.length} of {totalCount} student{totalCount !== 1 ? 's' : ''} · {categoryLabel}
        </p>
      </div>
      <div
        className="analytics-table-scroll"
        onWheel={(e) => e.stopPropagation()}
      >
        <Table
          striped
          highlightOnHover
          withTableBorder
          withColumnBorders
          stickyHeader
          stickyHeaderOffset={0}
          horizontalSpacing="sm"
          verticalSpacing="sm"
          style={{ minWidth: 720 }}
        >
          <Table.Thead className={styles.header}>
            <Table.Tr>
              {columns.map((col) => (
                <Table.Th
                  key={col.key}
                  style={{ minWidth: col.minWidth, textAlign: 'center', whiteSpace: 'nowrap' }}
                >
                  {col.label}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pagedStudents.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length} style={{ textAlign: 'center', color: '#6c757d', padding: 28 }}>
                  No students in this category
                </Table.Td>
              </Table.Tr>
            ) : (
              pagedStudents.map((student, index) => (
                <Table.Tr key={`${student.id}-${index}`}>
                  <Table.Td style={{ fontWeight: 700, color: '#1FA8DC', textAlign: 'center' }}>
                    {student.id}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'center' }}>{student.name}</Table.Td>
                  <Table.Td style={{ textAlign: 'center' }}>{student.course}</Table.Td>
                  {courseLabels.showCourseType && (
                  <Table.Td style={{ textAlign: 'center' }}>{student.courseType}</Table.Td>
                  )}
                  <Table.Td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{student.degree}</Table.Td>
                  <Table.Td style={{ textAlign: 'center', fontWeight: 600 }}>{student.percentage}</Table.Td>
                  <Table.Td style={{ textAlign: 'center', wordBreak: 'break-word' }}>
                    {student.wrongQuestions}
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </div>

      {totalCount > 0 && (
        <div className="pagination-container">
          <button
            type="button"
            className="pagination-button"
            onClick={() => goToPage(currentPage - 1)}
            disabled={!hasPrevPage}
            aria-label="Previous page"
          >
            <IconChevronLeft size={20} stroke={2} />
          </button>

          <div
            className={`pagination-page-info${totalPages > 1 ? ' clickable' : ''}`}
            onClick={() => totalPages > 1 && setShowPagePopup(!showPagePopup)}
          >
            Page {currentPage} of {totalPages}

            {showPagePopup && totalPages > 1 && (
              <div className="page-popup">
                <div className="page-popup-content">
                  <div className="page-popup-header">Select Page</div>
                  <div className="page-popup-grid">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        className={`page-number-btn${pageNum === currentPage ? ' active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          goToPage(pageNum);
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
            type="button"
            className="pagination-button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={!hasNextPage}
            aria-label="Next page"
          >
            <IconChevronRight size={20} stroke={2} />
          </button>
        </div>
      )}

      <style jsx>{`
        .analytics-table-section {
          margin-top: 20px;
        }
        .analytics-table-scroll {
          overflow: auto;
          max-height: 420px;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          touch-action: pan-x pan-y;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          border: 1px solid #e9ecef;
        }
        .analytics-table-heading {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .analytics-table-heading h3 {
          margin: 0;
          font-size: 1.15rem;
          color: #212529;
          font-weight: 700;
        }
        .analytics-table-heading p {
          margin: 0;
          color: #6c757d;
          font-size: 0.9rem;
          font-weight: 500;
        }
        .pagination-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-top: 20px;
          padding-top: 16px;
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
        .pagination-button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          border-color: #adb5bd;
          color: #adb5bd;
          box-shadow: none;
        }
        .pagination-page-info {
          position: relative;
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
        .pagination-page-info.clickable {
          cursor: pointer;
        }
        .pagination-page-info.clickable:hover {
          background: #e9ecef;
          border-color: #1FA8DC;
          transform: translateY(-1px);
        }
        .page-popup {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          margin-bottom: 8px;
          z-index: 20;
        }
        .page-popup-content {
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          border: 2px solid #1FA8DC;
          padding: 16px;
          min-width: 260px;
          max-width: 420px;
          max-height: 280px;
          overflow-y: auto;
        }
        .page-popup-header {
          font-size: 1rem;
          font-weight: 700;
          color: #495057;
          margin-bottom: 12px;
          text-align: center;
          padding-bottom: 8px;
          border-bottom: 2px solid #e9ecef;
        }
        .page-popup-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
          gap: 8px;
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
        .page-number-btn:hover,
        .page-number-btn.active {
          background: #1FA8DC;
          color: white;
          border-color: #1FA8DC;
        }
        @media (max-width: 768px) {
          .analytics-table-heading h3 {
            font-size: 1rem;
          }
          .analytics-table-heading p {
            font-size: 0.8rem;
          }
          .analytics-table-scroll {
            max-height: min(52vh, 520px);
            min-height: 380px;
          }
          .pagination-container {
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 12px;
            padding-top: 12px;
          }
          .pagination-button {
            width: 40px;
            height: 40px;
          }
          .pagination-page-info {
            font-size: 0.95rem;
            min-width: 100px;
            padding: 6px 12px;
          }
        }
        @media (max-width: 480px) {
          .analytics-table-heading {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
          .analytics-table-scroll {
            max-height: min(55vh, 540px);
            min-height: 400px;
          }
          .page-popup-content {
            min-width: 200px;
            max-width: calc(100vw - 48px);
            padding: 12px;
          }
          .page-number-btn {
            padding: 8px;
            font-size: 0.85rem;
          }
        }
        @media (max-height: 500px) and (orientation: landscape) {
          .analytics-table-scroll {
            max-height: 220px;
            min-height: 0;
          }
        }
      `}</style>
    </div>
  );
}
