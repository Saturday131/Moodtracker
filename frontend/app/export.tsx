import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, subMonths } from 'date-fns';
import * as Clipboard from 'expo-clipboard';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface MoodLayers {
  overall: number;
  energy: number;
  stress: number;
  productivity: number;
  social: number;
}

interface MoodEntry {
  id: string;
  date: string;
  time_of_day: string;
  layers: MoodLayers;
  note: string | null;
  timestamp: string;
}

interface ExportData {
  export_date: string;
  total_entries: number;
  moods: MoodEntry[];
}

type ExportRange = 'all' | '30days' | '90days' | 'year';

export default function ExportScreen() {
  const [totalEntries, setTotalEntries] = useState(0);
  const [uniqueDays, setUniqueDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedRange, setSelectedRange] = useState<ExportRange>('all');

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/moods`);
      if (response.ok) {
        const data = await response.json();
        setTotalEntries(data.length);
        const days = new Set(data.map((m: MoodEntry) => m.date));
        setUniqueDays(days.size);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const getDateRange = (range: ExportRange): { start?: string; end: string } => {
    const end = format(new Date(), 'yyyy-MM-dd');
    switch (range) {
      case '30days':
        return { start: format(subDays(new Date(), 30), 'yyyy-MM-dd'), end };
      case '90days':
        return { start: format(subDays(new Date(), 90), 'yyyy-MM-dd'), end };
      case 'year':
        return { start: format(subMonths(new Date(), 12), 'yyyy-MM-dd'), end };
      default:
        return { end };
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const { start, end } = getDateRange(selectedRange);
      
      let url = `${API_URL}/api/moods/export/json`;
      const params = new URLSearchParams();
      if (start) params.append('start_date', start);
      params.append('end_date', end);
      url += `?${params.toString()}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Export failed');

      const data: ExportData = await response.json();
      const jsonString = JSON.stringify(data, null, 2);

      const summary = createExportSummary(data);

      Alert.alert(
        'Export Ready',
        `${data.total_entries} mood entries ready.\n\n${summary}`,
        [
          {
            text: 'Copy JSON',
            onPress: async () => {
              await Clipboard.setStringAsync(jsonString);
              Alert.alert('Copied!', 'Mood data copied to clipboard');
            },
          },
          {
            text: 'Share',
            onPress: async () => {
              try {
                await Share.share({
                  message: jsonString,
                  title: 'Mood Tracker Export',
                });
              } catch (error) {
                console.error('Share error:', error);
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', 'Failed to export data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const createExportSummary = (data: ExportData): string => {
    if (data.total_entries === 0) return 'No entries to export.';

    const uniqueDays = new Set(data.moods.map(m => m.date)).size;
    const dates = data.moods.map(m => m.date).sort();
    const dateRange = dates.length > 0 
      ? `${format(new Date(dates[0]), 'MMM d')} - ${format(new Date(dates[dates.length - 1]), 'MMM d, yyyy')}`
      : 'No dates';

    // Calculate average composite
    const avgComposite = data.moods.reduce((sum, m) => {
      const weights = { overall: 0.3, energy: 0.2, stress: 0.2, productivity: 0.15, social: 0.15 };
      let total = 0;
      for (const [key, weight] of Object.entries(weights)) {
        total += (m.layers[key as keyof MoodLayers] || 3) * weight;
      }
      return sum + total;
    }, 0) / data.total_entries;

    return `Period: ${dateRange}\nDays tracked: ${uniqueDays}\nAvg Score: ${avgComposite.toFixed(1)}/5`;
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data?',
      'This will permanently delete all your mood entries. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/moods`);
              const moods = await response.json();
              
              for (const mood of moods) {
                await fetch(`${API_URL}/api/moods/${mood.id}`, {
                  method: 'DELETE',
                });
              }
              
              setTotalEntries(0);
              setUniqueDays(0);
              Alert.alert('Cleared', 'All mood data has been deleted.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data.');
            }
          },
        },
      ]
    );
  };

  const rangeOptions: { key: ExportRange; label: string; desc: string }[] = [
    { key: 'all', label: 'All Time', desc: 'Export all mood entries' },
    { key: '30days', label: 'Last 30 Days', desc: 'Recent month data' },
    { key: '90days', label: 'Last 90 Days', desc: 'Recent quarter data' },
    { key: 'year', label: 'Last Year', desc: 'Past 12 months data' },
  ];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Stats Card */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Ionicons name="document-text" size={32} color="#6366F1" />
            <Text style={styles.statValue}>{totalEntries}</Text>
            <Text style={styles.statLabel}>Total Entries</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="calendar" size={32} color="#22C55E" />
            <Text style={styles.statValue}>{uniqueDays}</Text>
            <Text style={styles.statLabel}>Days Tracked</Text>
          </View>
        </View>

        {/* Data Format Info */}
        <View style={styles.formatCard}>
          <Text style={styles.formatTitle}>Export Format</Text>
          <Text style={styles.formatDesc}>
            Data includes all mood layers (Overall, Energy, Stress, Productivity, Social), 
            time of day (Morning, Midday, Evening), notes, and timestamps.
          </Text>
        </View>

        {/* Export Range Selection */}
        <Text style={styles.sectionTitle}>Export Range</Text>
        <View style={styles.rangeContainer}>
          {rangeOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.rangeOption,
                selectedRange === option.key && styles.rangeOptionActive,
              ]}
              onPress={() => setSelectedRange(option.key)}
            >
              <View style={styles.rangeContent}>
                <View style={styles.radioOuter}>
                  {selectedRange === option.key && (
                    <View style={styles.radioInner} />
                  )}
                </View>
                <View>
                  <Text style={styles.rangeLabel}>{option.label}</Text>
                  <Text style={styles.rangeDesc}>{option.desc}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Export Button */}
        <TouchableOpacity
          style={[
            styles.exportButton,
            totalEntries === 0 && styles.exportButtonDisabled,
          ]}
          onPress={handleExport}
          disabled={exporting || totalEntries === 0}
        >
          {exporting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="download-outline" size={24} color="#FFFFFF" />
              <Text style={styles.exportButtonText}>Export as JSON</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Danger Zone */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearData}
            disabled={totalEntries === 0}
          >
            <Ionicons name="trash-outline" size={24} color="#EF4444" />
            <Text style={styles.clearButtonText}>Clear All Data</Text>
          </TouchableOpacity>
        </View>
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
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    margin: 16,
    borderRadius: 16,
    padding: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#374151',
    marginHorizontal: 16,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  formatCard: {
    backgroundColor: '#1E1B4B',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#312E81',
  },
  formatTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A5B4FC',
    marginBottom: 8,
  },
  formatDesc: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 12,
  },
  rangeContainer: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  rangeOption: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rangeOptionActive: {
    borderColor: '#6366F1',
    backgroundColor: '#1E1B4B',
  },
  rangeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6366F1',
  },
  rangeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rangeDesc: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 18,
    gap: 10,
  },
  exportButtonDisabled: {
    backgroundColor: '#4B5563',
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  dangerZone: {
    margin: 16,
    marginTop: 30,
    padding: 20,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 16,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7F1D1D',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  clearButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
});
