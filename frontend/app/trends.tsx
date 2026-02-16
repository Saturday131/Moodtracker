import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { format, subDays } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const SCREEN_WIDTH = Dimensions.get('window').width;

interface Analytics {
  period_days: number;
  total_entries: number;
  average_layers: Record<string, number>;
  average_composite: number;
  by_time_of_day: Record<string, { layers: Record<string, number>; composite: number; count: number }>;
  by_day_of_week: Record<string, { layers: Record<string, number>; composite: number; count: number }>;
}

interface CompareData {
  current: { count: number; layers: Record<string, number>; composite: number };
  previous: { count: number; layers: Record<string, number>; composite: number };
  changes: Record<string, number>;
}

const SCORE_COLORS = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'];
const LAYER_COLORS = {
  overall: '#6366F1',
  energy: '#F59E0B',
  stress: '#10B981',
  productivity: '#EC4899',
  social: '#8B5CF6',
};

const LAYER_EMOJIS = {
  overall: '😊',
  energy: '⚡',
  stress: '🧘',
  productivity: '💪',
  social: '👥',
};

const TIME_EMOJIS = {
  morning: '🌅',
  midday: '☀️',
  evening: '🌙',
};

type TimeRange = '7days' | '30days' | '90days';
type ViewMode = 'overview' | 'layers' | 'time' | 'days';

function getScoreColor(score: number): string {
  const index = Math.min(Math.max(Math.round(score) - 1, 0), 4);
  return SCORE_COLORS[index];
}

export default function TrendsScreen() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [compare, setCompare] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('7days');
  const [viewMode, setViewMode] = useState<ViewMode>('overview');

  const getDays = (range: TimeRange): number => {
    switch (range) {
      case '7days': return 7;
      case '30days': return 30;
      case '90days': return 90;
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const days = getDays(timeRange);

      const [analyticsRes, compareRes] = await Promise.all([
        fetch(`${API_URL}/api/analytics/summary?days=${days}`),
        fetch(`${API_URL}/api/analytics/compare?current_days=${days}`),
      ]);

      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setAnalytics(data);
      }

      if (compareRes.ok) {
        const data = await compareRes.json();
        setCompare(data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  const renderTimeRangeSelector = () => (
    <View style={styles.timeRangeContainer}>
      {(['7days', '30days', '90days'] as TimeRange[]).map((range) => (
        <TouchableOpacity
          key={range}
          style={[
            styles.timeRangeButton,
            timeRange === range && styles.timeRangeButtonActive,
          ]}
          onPress={() => setTimeRange(range)}
        >
          <Text
            style={[
              styles.timeRangeText,
              timeRange === range && styles.timeRangeTextActive,
            ]}
          >
            {range === '7days' ? '7D' : range === '30days' ? '30D' : '90D'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderViewModeSelector = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.viewModeScroll}>
      <View style={styles.viewModeContainer}>
        {[
          { key: 'overview', label: 'Przegląd' },
          { key: 'layers', label: 'Wg Warstwy' },
          { key: 'time', label: 'Wg Pory' },
          { key: 'days', label: 'Wg Dnia' },
        ].map((mode) => (
          <TouchableOpacity
            key={mode.key}
            style={[
              styles.viewModeButton,
              viewMode === mode.key && styles.viewModeButtonActive,
            ]}
            onPress={() => setViewMode(mode.key as ViewMode)}
          >
            <Text
              style={[
                styles.viewModeText,
                viewMode === mode.key && styles.viewModeTextActive,
              ]}
            >
              {mode.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const renderOverview = () => {
    if (!analytics || !compare) return null;

    const compositeChange = compare.changes.composite || 0;

    return (
      <>
        {/* Composite Score Card */}
        <View style={styles.compositeCard}>
          <Text style={styles.compositeLabel}>Średni Wynik Łączny</Text>
          <Text style={[styles.compositeValue, { color: getScoreColor(analytics.average_composite) }]}>
            {analytics.average_composite.toFixed(1)} / 5.0
          </Text>
          <View style={styles.changeRow}>
            <Text style={[
              styles.changeValue,
              { color: compositeChange >= 0 ? '#22C55E' : '#EF4444' }
            ]}>
              {compositeChange >= 0 ? '+' : ''}{compositeChange.toFixed(2)}
            </Text>
            <Text style={styles.changeLabel}>vs poprzedni okres</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{analytics.total_entries}</Text>
            <Text style={styles.statLabel}>Entries</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {analytics.total_entries > 0 && analytics.period_days > 0
                ? Math.round((analytics.total_entries / (analytics.period_days * 3)) * 100)
                : 0}%
            </Text>
            <Text style={styles.statLabel}>Consistency</Text>
          </View>
        </View>

        {/* Layer Averages */}
        <View style={styles.layersCard}>
          <Text style={styles.cardTitle}>Layer Averages</Text>
          {Object.entries(analytics.average_layers).map(([key, value]) => (
            <View key={key} style={styles.layerRow}>
              <Text style={styles.layerEmoji}>{LAYER_EMOJIS[key as keyof typeof LAYER_EMOJIS]}</Text>
              <Text style={styles.layerLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
              <View style={styles.layerBarContainer}>
                <View
                  style={[
                    styles.layerBar,
                    { width: `${(value / 5) * 100}%`, backgroundColor: LAYER_COLORS[key as keyof typeof LAYER_COLORS] },
                  ]}
                />
              </View>
              <Text style={[styles.layerValue, { color: getScoreColor(value) }]}>{value.toFixed(1)}</Text>
              {compare && (
                <Text style={[
                  styles.layerChange,
                  { color: (compare.changes[key] || 0) >= 0 ? '#22C55E' : '#EF4444' }
                ]}>
                  {(compare.changes[key] || 0) >= 0 ? '+' : ''}{(compare.changes[key] || 0).toFixed(1)}
                </Text>
              )}
            </View>
          ))}
        </View>
      </>
    );
  };

  const renderByTime = () => {
    if (!analytics?.by_time_of_day) return null;

    const timeData = analytics.by_time_of_day;
    const chartData = ['morning', 'midday', 'evening'].map(time => ({
      value: timeData[time]?.composite || 0,
      label: time.charAt(0).toUpperCase() + time.slice(1),
      frontColor: getScoreColor(timeData[time]?.composite || 0),
    }));

    return (
      <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>Mood by Time of Day</Text>
        <Text style={styles.cardSubtitle}>Average composite scores</Text>
        
        <View style={styles.chartContainer}>
          <BarChart
            data={chartData}
            barWidth={50}
            spacing={30}
            roundedTop
            roundedBottom
            xAxisThickness={1}
            yAxisThickness={1}
            xAxisColor="#374151"
            yAxisColor="#374151"
            yAxisTextStyle={{ color: '#9CA3AF', fontSize: 12 }}
            xAxisLabelTextStyle={{ color: '#9CA3AF', fontSize: 11 }}
            noOfSections={5}
            maxValue={5}
            backgroundColor="transparent"
            hideRules
            isAnimated
          />
        </View>

        {/* Detailed breakdown */}
        <View style={styles.timeBreakdown}>
          {['morning', 'midday', 'evening'].map(time => (
            <View key={time} style={styles.timeCard}>
              <Text style={styles.timeEmoji}>{TIME_EMOJIS[time as keyof typeof TIME_EMOJIS]}</Text>
              <Text style={styles.timeLabel}>{time.charAt(0).toUpperCase() + time.slice(1)}</Text>
              <Text style={[styles.timeScore, { color: getScoreColor(timeData[time]?.composite || 0) }]}>
                {(timeData[time]?.composite || 0).toFixed(1)}
              </Text>
              <Text style={styles.timeCount}>{timeData[time]?.count || 0} entries</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderByDay = () => {
    if (!analytics?.by_day_of_week) return null;

    const dayData = analytics.by_day_of_week;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    const chartData = days.map(day => ({
      value: dayData[day]?.composite || 0,
      label: day.slice(0, 3),
      frontColor: getScoreColor(dayData[day]?.composite || 0),
    }));

    // Find best and worst days
    const sortedDays = days
      .filter(d => (dayData[d]?.count || 0) > 0)
      .sort((a, b) => (dayData[b]?.composite || 0) - (dayData[a]?.composite || 0));

    return (
      <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>Mood by Day of Week</Text>
        <Text style={styles.cardSubtitle}>Average composite scores</Text>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chartContainer}>
            <BarChart
              data={chartData}
              barWidth={35}
              spacing={15}
              roundedTop
              roundedBottom
              xAxisThickness={1}
              yAxisThickness={1}
              xAxisColor="#374151"
              yAxisColor="#374151"
              yAxisTextStyle={{ color: '#9CA3AF', fontSize: 12 }}
              xAxisLabelTextStyle={{ color: '#9CA3AF', fontSize: 10 }}
              noOfSections={5}
              maxValue={5}
              backgroundColor="transparent"
              hideRules
              isAnimated
            />
          </View>
        </ScrollView>

        {/* Best/Worst days */}
        {sortedDays.length >= 2 && (
          <View style={styles.dayInsights}>
            <View style={styles.insightCard}>
              <Text style={styles.insightLabel}>Best Day</Text>
              <Text style={[styles.insightDay, { color: '#22C55E' }]}>{sortedDays[0]}</Text>
              <Text style={styles.insightScore}>
                {(dayData[sortedDays[0]]?.composite || 0).toFixed(1)} avg
              </Text>
            </View>
            <View style={styles.insightCard}>
              <Text style={styles.insightLabel}>Needs Care</Text>
              <Text style={[styles.insightDay, { color: '#EF4444' }]}>{sortedDays[sortedDays.length - 1]}</Text>
              <Text style={styles.insightScore}>
                {(dayData[sortedDays[sortedDays.length - 1]]?.composite || 0).toFixed(1)} avg
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderByLayers = () => {
    if (!analytics) return null;

    return (
      <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>Layer Analysis</Text>
        <Text style={styles.cardSubtitle}>Detailed breakdown by mood dimension</Text>

        {Object.entries(analytics.average_layers).map(([key, value]) => {
          const timeData = ['morning', 'midday', 'evening'].map(time => ({
            value: analytics.by_time_of_day[time]?.layers[key] || 0,
            time,
          }));

          return (
            <View key={key} style={styles.layerAnalysisCard}>
              <View style={styles.layerAnalysisHeader}>
                <Text style={styles.layerAnalysisEmoji}>
                  {LAYER_EMOJIS[key as keyof typeof LAYER_EMOJIS]}
                </Text>
                <Text style={styles.layerAnalysisTitle}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </Text>
                <Text style={[styles.layerAnalysisAvg, { color: getScoreColor(value) }]}>
                  {value.toFixed(1)}
                </Text>
              </View>
              
              <View style={styles.layerTimeRow}>
                {timeData.map(({ value: v, time }) => (
                  <View key={time} style={styles.layerTimeItem}>
                    <Text style={styles.layerTimeEmoji}>
                      {TIME_EMOJIS[time as keyof typeof TIME_EMOJIS]}
                    </Text>
                    <View style={[
                      styles.layerTimeDot,
                      { backgroundColor: v > 0 ? getScoreColor(v) : '#374151' }
                    ]} />
                    <Text style={styles.layerTimeValue}>
                      {v > 0 ? v.toFixed(1) : '-'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderTimeRangeSelector()}
        {renderViewModeSelector()}

        {analytics?.total_entries === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Data Yet</Text>
            <Text style={styles.emptyText}>Start recording your mood to see trends!</Text>
          </View>
        ) : (
          <>
            {viewMode === 'overview' && renderOverview()}
            {viewMode === 'time' && renderByTime()}
            {viewMode === 'days' && renderByDay()}
            {viewMode === 'layers' && renderByLayers()}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 10,
    fontSize: 16,
  },
  timeRangeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1F2937',
    borderRadius: 10,
    alignItems: 'center',
  },
  timeRangeButtonActive: {
    backgroundColor: '#6366F1',
  },
  timeRangeText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  timeRangeTextActive: {
    color: '#FFFFFF',
  },
  viewModeScroll: {
    marginTop: 12,
  },
  viewModeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  viewModeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#1F2937',
    borderRadius: 20,
  },
  viewModeButtonActive: {
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  viewModeText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  viewModeTextActive: {
    color: '#FFFFFF',
  },
  compositeCard: {
    backgroundColor: '#1F2937',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  compositeLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  compositeValue: {
    fontSize: 36,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  changeLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  layersCard: {
    backgroundColor: '#1F2937',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 16,
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  layerEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  layerLabel: {
    width: 80,
    fontSize: 13,
    color: '#D1D5DB',
  },
  layerBarContainer: {
    flex: 1,
    height: 10,
    backgroundColor: '#374151',
    borderRadius: 5,
    marginHorizontal: 8,
  },
  layerBar: {
    height: '100%',
    borderRadius: 5,
  },
  layerValue: {
    width: 32,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  layerChange: {
    width: 40,
    fontSize: 11,
    textAlign: 'right',
  },
  analysisCard: {
    backgroundColor: '#1F2937',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  chartContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  timeBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  timeCard: {
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 14,
    minWidth: 90,
  },
  timeEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  timeLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  timeScore: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  timeCount: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  dayInsights: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  insightCard: {
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 14,
    minWidth: 120,
  },
  insightLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  insightDay: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  insightScore: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  layerAnalysisCard: {
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  layerAnalysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  layerAnalysisEmoji: {
    fontSize: 22,
    marginRight: 10,
  },
  layerAnalysisTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  layerAnalysisAvg: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  layerTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  layerTimeItem: {
    alignItems: 'center',
  },
  layerTimeEmoji: {
    fontSize: 16,
    marginBottom: 4,
  },
  layerTimeDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginBottom: 4,
  },
  layerTimeValue: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});
