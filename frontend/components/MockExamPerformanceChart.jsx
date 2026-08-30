import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Rectangle,
} from "recharts";

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

export default function MockExamPerformanceChart({ chartData, height = 500 }) {
  const data = useMemo(() => {
    if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
      return [];
    }
    return chartData.map(item => {
      const hasMath = item.mathPercentage != null || item.math_percentage != null;
      const hasEnglish = item.englishPercentage != null || item.english_percentage != null;
      return {
        lesson: formatMockExamLabel(item.lesson_name || item.lesson || 'Unknown'),
        percentage: hasMath || hasEnglish ? null : (item.percentage || 0),
        mathPercentage: item.mathPercentage ?? item.math_percentage ?? null,
        englishPercentage: item.englishPercentage ?? item.english_percentage ?? null,
        mathDegree: item.mathDegree ?? item.math_degree ?? null,
        mathOutOf: item.mathOutOf ?? item.math_out_of ?? null,
        englishDegree: item.englishDegree ?? item.english_degree ?? null,
        englishOutOf: item.englishOutOf ?? item.english_out_of ?? null,
        result: item.result || '0 / 0',
      };
    });
  }, [chartData]);
  const minChartWidth = Math.max(data.length * 95, 320);

  if (!data.length) {
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
        📊 No mock exam data to display yet
      </div>
    );
  }

  return (
    <>
      <div className="mock-exam-chart-container" style={{ width: '100%', height: height, overflowX: 'auto' }}>
        <div style={{ width: '100%', minWidth: `${minChartWidth}px`, height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
          data={data} 
          margin={{ top: 20, right: 20, left: 20, bottom: 95 }}
          barCategoryGap="12%"
          barGap={2}
          className="mock-exam-bar-chart"
        >
            <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
            <XAxis 
              dataKey="lesson" 
              stroke="#6c757d"
              fontSize={12}
              tick={{ fill: '#495057', fontSize: 14 }}
              interval={0} 
              angle={-35} 
              textAnchor="end" 
              height={95}
              minTickGap={24}
              tickMargin={14}
              className="mock-exam-x-axis"
            />
            <YAxis 
              domain={[0, 100]} 
              tick={{ fill: '#495057', fontSize: 14 }}
              stroke="#6c757d"
              label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft', offset: -5, style: { textAnchor: 'middle', fontSize: 14 } }}
              className="mock-exam-y-axis"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                fontSize: '0.875rem'
              }}
              formatter={(value, name, props) => {
                const lesson = props.payload.lesson;
                const percentage = value.toFixed(1);
                const entry = props.payload;
                const isMath = name === 'mathPercentage' || name === 'Math' || name === 'Math Exam' || name === 'Math Mock Exam';
                const isEnglish = name === 'englishPercentage' || name === 'English' || name === 'English Exam' || name === 'English Mock Exam';
                const section = isMath ? 'Math Mock Exam' : isEnglish ? 'English Mock Exam' : 'Overall Exam';
                const degree = isMath ? entry.mathDegree : isEnglish ? entry.englishDegree : null;
                const outOf = isMath ? entry.mathOutOf : isEnglish ? entry.englishOutOf : null;
                const result = degree != null && outOf != null
                  ? `${degree} / ${outOf}`
                  : (entry.result || '0 / 0');
                return [
                  <div key="tooltip" style={{ color: '#000000' }}>
                    <div><strong style={{ color: '#000000' }}>Lesson:</strong> {lesson}</div>
                    <div><strong style={{ color: '#000000' }}>Section:</strong> {section}</div>
                    <div><strong style={{ color: '#000000' }}>Percentage:</strong> {percentage}%</div>
                    <div><strong style={{ color: '#000000' }}>Result:</strong> {result}</div>
                  </div>
                ];
              }}
              labelStyle={{ display: 'none' }}
            />
            <Legend />
            <Bar
              dataKey="mathPercentage"
              name="Math Mock Exam"
              fill="rgb(54, 162, 235)"
              radius={[6, 6, 0, 0]}
              maxBarSize={42}
            />
            <Bar
              dataKey="englishPercentage"
              name="English Mock Exam"
              fill="rgb(255, 99, 132)"
              radius={[6, 6, 0, 0]}
              maxBarSize={42}
            />
            <Bar
              dataKey="percentage"
              name="Overall Exam"
              fill="#3dd228"
              radius={[6, 6, 0, 0]}
              maxBarSize={42}
              shape={<CenteredOverallBar />}
            />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
      <style jsx global>{`
        @media (max-width: 768px) {
          .mock-exam-chart-container {
            height: 350px !important;
            overflow-x: auto;
          }
          .mock-exam-bar-chart {
            min-width: 100%;
          }
          .mock-exam-chart-container .recharts-cartesian-axis-tick text {
            font-size: 11px !important;
          }
          .mock-exam-chart-container .mock-exam-x-axis .recharts-cartesian-axis-tick text {
            font-size: 10px !important;
          }
          .mock-exam-chart-container .mock-exam-y-axis .recharts-label {
            font-size: 16px !important;
            font-weight: 600 !important;
          }
          .mock-exam-chart-container .mock-exam-y-axis .recharts-cartesian-axis-tick text {
            font-size: 12px !important;
          }
        }
        
        @media (max-width: 480px) {
          .mock-exam-chart-container {
            height: 320px !important;
            overflow-x: auto;
          }
          .mock-exam-bar-chart {
            min-width: 100%;
          }
          .mock-exam-chart-container .recharts-cartesian-axis-tick text {
            font-size: 10px !important;
          }
          .mock-exam-chart-container .mock-exam-x-axis .recharts-cartesian-axis-tick text {
            font-size: 9px !important;
          }
          .mock-exam-chart-container .mock-exam-y-axis .recharts-label {
            font-size: 18px !important;
            font-weight: 700 !important;
          }
          .mock-exam-chart-container .mock-exam-y-axis .recharts-cartesian-axis-tick text {
            font-size: 11px !important;
          }
        }
        
        @media (max-width: 360px) {
          .mock-exam-chart-container {
            height: 280px !important;
            overflow-x: auto;
          }
          .mock-exam-bar-chart {
            min-width: 100%;
          }
          .mock-exam-chart-container .recharts-cartesian-axis-tick text {
            font-size: 9px !important;
          }
          .mock-exam-chart-container .mock-exam-x-axis .recharts-cartesian-axis-tick text {
            font-size: 8px !important;
          }
          .mock-exam-chart-container .mock-exam-y-axis .recharts-label {
            font-size: 16px !important;
            font-weight: 700 !important;
          }
          .mock-exam-chart-container .mock-exam-y-axis .recharts-cartesian-axis-tick text {
            font-size: 10px !important;
          }
        }
      `}</style>
    </>
  );
}
