import React, { useState, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { BarChart } from 'react-native-gifted-charts';
import { format, subDays, subMonths } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const SCREEN_WIDTH = Dimensions.get('window').width;

interface MoodEntry {
  id: string;
  mood_type: string;
  mood_value: number;
  emoji: string;
  note: string | null;
  date: string;
}

interface MoodStats {
  period_days: number;
  total_entries: number;
  average_mood: number;
  mood_distribution: Record<string, number>;
}

const MOOD_COLORS: Record<string, string> = {
  great: '#22C55E',
  good: '#84CC16',
  okay: '#EAB308',
  low: '#F97316',
  bad: '#EF4444',
};

const MOOD_EMOJIS: Record<string, string> = {
  great: '😄',
  good: '🙂',
  okay: '😐',
  low: '😔',
  bad: '😢',
};

type TimeRange = '7days' | '30days' | '90days';

export default function TrendsScreen() {
  const [moods, setMoods] = useState<MoodEntry[]>([]);
  const [stats, setStats] = useState<MoodStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('7days');

  const getDaysForRange = (range: TimeRange): number => {
    switch (range) {
      case '7days': return 7;
      case '30days': return 30;
      case '90days': return 90;
      default: return 7;
    }
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const days = getDaysForRange(timeRange);
      const end = format(new Date(), 'yyyy-MM-dd');
      const start = format(subDays(new Date(), days), 'yyyy-MM-dd');

      const [moodsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/moods?start_date=${start}&end_date=${end}`),
        fetch(`${API_URL}/api/moods/stats/summary?days=${days}`),
      ]);

      if (moodsRes.ok) {
        const moodsData = await moodsRes.json();
        setMoods(moodsData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const getChartData = () => {
    if (!moods.length) return [];

    // Sort moods by date ascending
    const sortedMoods = [...moods].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return sortedMoods.map(mood => ({
      value: mood.mood_value,
      label: format(new Date(mood.date), 'MM/dd'),
      frontColor: MOOD_COLORS[mood.mood_type],
      topLabelComponent: () => (
        <Text style={{ fontSize: 14, marginBottom: 4 }}>{mood.emoji}</Text>
      ),
    }));
  };

  const getDistributionData = () => {
    if (!stats?.mood_distribution) return [];

    const order = ['great', 'good', 'okay', 'low', 'bad'];
    return order
      .filter(type => stats.mood_distribution[type])
      .map(type => ({
        type,
        count: stats.mood_distribution[type],
        color: MOOD_COLORS[type],
        emoji: MOOD_EMOJIS[type],
      }));
  };

  const getAverageMoodInfo = () => {
    if (!stats?.average_mood) return { emoji: '📊', label: 'No data', color: '#6B7280' };
    
    const avg = stats.average_mood;
    if (avg >= 4.5) return { emoji: '😄', label: 'Great', color: MOOD_COLORS.great };
    if (avg >= 3.5) return { emoji: '🙂', label: 'Good', color: MOOD_COLORS.good };
    if (avg >= 2.5) return { emoji: '😐', label: 'Okay', color: MOOD_COLORS.okay };
    if (avg >= 1.5) return { emoji: '😔', label: 'Low', color: MOOD_COLORS.low };
    return { emoji: '😢', label: 'Bad', color: MOOD_COLORS.bad };
  };

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
            {range === '7days' ? '7 Days' : range === '30days' ? '30 Days' : '90 Days'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading trends...</Text>
      </View>
    );
  }

  const chartData = getChartData();
  const distributionData = getDistributionData();
  const avgMoodInfo = getAverageMoodInfo();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderTimeRangeSelector()}

        {/* Average Mood Card */}
        <View style={styles.avgCard}>
          <Text style={styles.avgEmoji}>{avgMoodInfo.emoji}</Text>
          <View>
            <Text style={styles.avgLabel}>Average Mood</Text>
            <Text style={[styles.avgValue, { color: avgMoodInfo.color }]}>
              {stats?.average_mood ? stats.average_mood.toFixed(1) : '-'} / 5.0
            </Text>
            <Text style={styles.avgDesc}>
              Overall: {avgMoodInfo.label}
            </Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_entries || 0}</Text>
            <Text style={styles.statLabel}>Entries</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats?.total_entries && stats.period_days
                ? Math.round((stats.total_entries / stats.period_days) * 100)
                : 0}%
            </Text>
            <Text style={styles.statLabel}>Consistency</Text>
          </View>
        </View>

        {/* Chart */}
        {chartData.length > 0 ? (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Mood History</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <BarChart
                data={chartData}
                barWidth={30}
                spacing={timeRange === '7days' ? 20 : 10}
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
                backgroundColor="#1F2937"
                hideRules
                isAnimated
              />
            </ScrollView>
          </View>
        ) : (
          <View style={styles.emptyChart}>
            <Text style={styles.emptyChartText}>No mood data to display</Text>
            <Text style={styles.emptyChartSubtext}>
              Start recording your mood to see trends!
            </Text>
          </View>
        )}

        {/* Mood Distribution */}
        {distributionData.length > 0 && (
          <View style={styles.distributionCard}>
            <Text style={styles.chartTitle}>Mood Distribution</Text>
            {distributionData.map((item) => (
              <View key={item.type} style={styles.distributionRow}>
                <View style={styles.distributionLeft}>
                  <Text style={styles.distributionEmoji}>{item.emoji}</Text>
                  <Text style={styles.distributionType}>
                    {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                  </Text>
                </View>
                <View style={styles.distributionBarContainer}>
                  <View
                    style={[
                      styles.distributionBar,
                      {
                        width: `${(item.count / (stats?.total_entries || 1)) * 100}%`,
                        backgroundColor: item.color,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.distributionCount}>{item.count}</Text>
              </View>
            ))}
          </View>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
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
  avgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
  },
  avgEmoji: {
    fontSize: 50,
    marginRight: 20,
  },
  avgLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  avgValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  avgDesc: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: '#1F2937',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  emptyChart: {
    backgroundColor: '#1F2937',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
  },
  emptyChartText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyChartSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  distributionCard: {
    backgroundColor: '#1F2937',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  distributionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 100,
  },
  distributionEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  distributionType: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  distributionBarContainer: {
    flex: 1,
    height: 20,
    backgroundColor: '#374151',
    borderRadius: 10,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  distributionBar: {
    height: '100%',
    borderRadius: 10,
  },
  distributionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    width: 30,
    textAlign: 'right',
  },
});
