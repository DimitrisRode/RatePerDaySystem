import { useMemo } from 'react';
import { ProcessedData, RentalRecord, ComparisonResult, AlignedMonth, MetricSet, VarianceSet } from '../types';

type DateRangeType = 'All' | '1-10' | '11-20' | '21-End';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const useComparisonData = (
  primaryData: ProcessedData | undefined,
  comparisonData: ProcessedData | undefined,
  selectedStation: string,
  selectedGroups: string[],
  selectedDateRange: DateRangeType
): ComparisonResult => {

  // Helper to process a single year's data
  const processYear = (data: ProcessedData | undefined): Record<number, MetricSet> => {
    const months: Record<number, MetricSet> = {};

    // Init months 0-11
    for (let i = 0; i < 12; i++) {
      months[i] = { revenue: 0, days: 0, count: 0, rate: 0, hasData: false };
    }

    if (!data) return months;

    // Normalize Selection Keys
    const targetStationKey = selectedStation === 'All' ? null : selectedStation.toLowerCase().trim();
    const targetGroupKeys = selectedGroups.includes('All') 
      ? null 
      : new Set(selectedGroups.map(g => g.toLowerCase().trim()));

    data.records.forEach(r => {
      // 1. Filter Station
      if (targetStationKey && r.stationKey !== targetStationKey) return;
      
      // 2. Filter Group
      if (targetGroupKeys && !targetGroupKeys.has(r.groupKey)) return;

      // 3. Filter Date Range
      if (selectedDateRange === '1-10' && (r.day < 1 || r.day > 10)) return;
      if (selectedDateRange === '11-20' && (r.day < 11 || r.day > 20)) return;
      if (selectedDateRange === '21-End' && r.day < 21) return;

      // Aggregate
      const mIndex = r.date.getMonth();
      const m = months[mIndex];

      m.revenue += r.charge;
      m.days += r.days;
      m.count += 1;
      m.hasData = true;
    });

    // Calculate Rates
    for (let i = 0; i < 12; i++) {
      if (months[i].days > 0) {
        months[i].rate = months[i].revenue / months[i].days;
      }
    }

    return months;
  };

  const primaryMetrics = useMemo(() => processYear(primaryData), [primaryData, selectedStation, selectedGroups, selectedDateRange]);
  const comparisonMetrics = useMemo(() => processYear(comparisonData), [comparisonData, selectedStation, selectedGroups, selectedDateRange]);

  const calcVariance = (p: number, c: number, pHasData: boolean, cHasData: boolean): number | null => {
    if (!cHasData) return null; // No baseline
    if (c === 0) {
      if (pHasData && p === 0) return 0; // 0 vs 0 -> 0%
      return null; // X vs 0 -> Undefined (Infinity)
    }
    if (!pHasData) return null; // Comparison exists, but Primary is missing/future
    
    return (p - c) / c;
  };

  // Combine
  const alignedMonths: AlignedMonth[] = useMemo(() => {
    return MONTH_NAMES.map((name, i) => {
      const p = primaryMetrics[i];
      const c = comparisonMetrics[i];

      const revenueVar = calcVariance(p.revenue, c.revenue, p.hasData, c.hasData);
      const daysVar = calcVariance(p.days, c.days, p.hasData, c.hasData);
      const rateVar = calcVariance(p.rate, c.rate, p.hasData, c.hasData);

      return {
        monthIndex: i,
        monthName: name,
        primary: p,
        comparison: c,
        variance: {
          revenue: revenueVar,
          days: daysVar,
          rate: rateVar
        }
      };
    });
  }, [primaryMetrics, comparisonMetrics]);

  // Grand Totals
  const totals = useMemo(() => {
    const sum = (metrics: Record<number, MetricSet>): MetricSet => {
      const acc = { revenue: 0, days: 0, count: 0, rate: 0, hasData: false };
      Object.values(metrics).forEach(m => {
        if (m.hasData) {
          acc.revenue += m.revenue;
          acc.days += m.days;
          acc.count += m.count;
          acc.hasData = true;
        }
      });
      if (acc.days > 0) acc.rate = acc.revenue / acc.days;
      return acc;
    };

    const pTotal = sum(primaryMetrics);
    const cTotal = sum(comparisonMetrics);

    return {
      primary: pTotal,
      comparison: cTotal,
      variance: {
        revenue: calcVariance(pTotal.revenue, cTotal.revenue, pTotal.hasData, cTotal.hasData),
        days: calcVariance(pTotal.days, cTotal.days, pTotal.hasData, cTotal.hasData),
        rate: calcVariance(pTotal.rate, cTotal.rate, pTotal.hasData, cTotal.hasData)
      }
    };
  }, [primaryMetrics, comparisonMetrics]);

  return { alignedMonths, totals };
};