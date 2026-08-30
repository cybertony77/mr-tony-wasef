import { useState, useRef, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Rectangle,
} from 'recharts';

function formatMockExamLabel(label) {
  const normalized = String(label || '').replace(/_/g, ' ').trim();
  const match = normalized.match(/^(?:mock\s+)?exam\s+(\d+)$/i);
  return match ? `Mock Exam ${match[1]}` : (label || 'Unknown');
}

function CenteredOverallBar(props) {
  const {
    x,
    payload,
    width,
  } = props;
  const hasSubjectScore =
    payload?.mathPercentage !== null && payload?.mathPercentage !== undefined ||
    payload?.englishPercentage !== null && payload?.englishPercentage !== undefined;
  const centeredX = hasSubjectScore ? x : x - width - 10;
  return <Rectangle {...props} x={centeredX} />;
}

export default function MockExamChart({ mockExams }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipData, setTooltipData] = useState(null);
  const chartRef = useRef(null);

  // Handle click outside to hide tooltip
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (chartRef.current && !chartRef.current.contains(event.target)) {
        setShowTooltip(false);
        setTooltipData(null);
      }
    };

    const handleTouchOutside = (event) => {
      if (chartRef.current && !chartRef.current.contains(event.target)) {
        setShowTooltip(false);
        setTooltipData(null);
      }
    };

    // Add event listeners for both mouse and touch events
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleTouchOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleTouchOutside);
    };
  }, []);
  if (!mockExams || mockExams.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: '#6c757d',
        fontSize: '1.1rem',
        fontWeight: '500',
        background: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        📊 No mock exams data to display yet
      </div>
    );
  }

  // Prepare data for the chart
  const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const chartData = mockExams.map((exam) => {
    const hasMath = exam.mathPercentage !== null && exam.mathPercentage !== undefined;
    const hasEnglish = exam.englishPercentage !== null && exam.englishPercentage !== undefined;
    return {
      exam: formatMockExamLabel(exam.exam),
      mathPercentage: hasMath ? toNumber(exam.mathPercentage) : null,
      englishPercentage: hasEnglish ? toNumber(exam.englishPercentage) : null,
      // Legacy records keep one aggregate bar instead of a subject bar.
      percentage: hasMath || hasEnglish ? null : toNumber(exam.percentage),
      mathDegree: exam.mathDegree,
      mathOutOf: exam.mathOutOf,
      englishDegree: exam.englishDegree,
      englishOutOf: exam.englishOutOf,
      examDegree: exam.examDegree,
      outOf: exam.outOf,
      result: exam.result || null,
    };
  });
  const minChartWidth = Math.max(chartData.length * 95, 320);

  return (
    <div ref={chartRef} className="mock-exam-chart-container" style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{ width: '100%', minWidth: `${minChartWidth}px`, height: 500 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 95 }} barCategoryGap="12%" barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
          <XAxis 
            dataKey="exam" 
            stroke="#6c757d"
            fontSize={12}
            tick={{ fill: '#495057', fontSize: 13 }}
            interval={0} 
            angle={-35} 
            textAnchor="end" 
            height={95}
            minTickGap={24}
            tickMargin={14}
          />
          <YAxis 
            stroke="#6c757d"
            fontSize={12}
            tick={{ fill: '#495057' }}
            domain={[0, 100]}
            label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            active={showTooltip}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
            formatter={(value, name, props) => {
              const entry = props.payload;
              const isMath = name === 'mathPercentage' || name === 'Math' || name === 'Math Exam' || name === 'Math Mock Exam';
              const isEnglish = name === 'englishPercentage' || name === 'English' || name === 'English Exam' || name === 'English Mock Exam';
              const section = isMath ? 'Math Mock Exam' : isEnglish ? 'English Mock Exam' : 'Overall Exam';
              const degree = isMath ? entry.mathDegree : isEnglish ? entry.englishDegree : entry.examDegree;
              const outOf = isMath ? entry.mathOutOf : isEnglish ? entry.englishOutOf : entry.outOf;
              const degreeDisplay = degree !== null && degree !== undefined && outOf
                ? ` — ${degree} / ${outOf}`
                : '';
              return [`${Number(value).toFixed(1)}%${degreeDisplay}`, section];
            }}
            labelStyle={{ display: 'none' }}
          />
          <Legend />
          <Bar
            dataKey="mathPercentage"
            name="Math Mock Exam"
            fill="#36a2eb"
            radius={[6, 6, 0, 0]}
            maxBarSize={42}
            onClick={(data) => {
              setShowTooltip(true);
              setTooltipData(data);
            }}
            onTouchStart={(data) => {
              setShowTooltip(true);
              setTooltipData(data);
            }}
          />
          <Bar
            dataKey="englishPercentage"
            name="English Mock Exam"
            fill="#ff6384"
            radius={[6, 6, 0, 0]}
            maxBarSize={42}
            onClick={(data) => {
              setShowTooltip(true);
              setTooltipData(data);
            }}
            onTouchStart={(data) => {
              setShowTooltip(true);
              setTooltipData(data);
            }}
          />
          <Bar
            dataKey="percentage"
            name="Overall Exam"
            fill="#9966ff"
            radius={[6, 6, 0, 0]}
            maxBarSize={42}
            shape={<CenteredOverallBar />}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
      <style jsx>{`
        .mock-exam-chart-container {
          -webkit-overflow-scrolling: touch;
        }
        @media (max-width: 768px) {
          .mock-exam-chart-container > div {
            height: 360px !important;
          }
        }
        @media (max-width: 480px) {
          .mock-exam-chart-container > div {
            height: 320px !important;
          }
        }
      `}</style>
    </div>
  );
}
