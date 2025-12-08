import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { onValue, ref } from 'firebase/database';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { auth, database } from '../../firebaseConfig';

const { width, height } = Dimensions.get('window');

// Design System Constants
const COLORS = {
  primary: '#1999e8',
  primaryDark: '#1488d0',
  primaryLight: '#2da8f0',
  primaryGradient: ['#1999e8', '#1488d0'] as const,
  
  success: '#10b981',
  successLight: '#d1fae5',
  successDark: '#059669',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  warningDark: '#d97706',
  error: '#ef4444',
  errorLight: '#fee2e2',
  errorDark: '#dc2626',
  info: '#06b6d4',
  infoLight: '#cffafe',
  infoDark: '#0891b2',
  
  white: '#ffffff',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',
  
  background: '#f8fafc',
  card: '#ffffff',
  cardDark: '#f8fafc',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

const TYPOGRAPHY = {
  xs: { fontSize: 10, lineHeight: 14, fontFamily: 'System' },
  sm: { fontSize: 12, lineHeight: 16, fontFamily: 'System' },
  base: { fontSize: 14, lineHeight: 20, fontFamily: 'System' },
  lg: { fontSize: 16, lineHeight: 22, fontFamily: 'System' },
  xl: { fontSize: 18, lineHeight: 24, fontFamily: 'System' },
  '2xl': { fontSize: 20, lineHeight: 26, fontFamily: 'System' },
  '3xl': { fontSize: 24, lineHeight: 30, fontFamily: 'System' },
};

const BORDER_RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 22,
  full: 999,
};

const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
};

interface Student {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  gradeLevel?: string;
  parentId?: string;
}

interface Report {
  id: string;
  studentId: string;
  studentName?: string;
  childName?: string;
  reportType: string;
  quarter: string;
  schoolYear: string;
  uploadDate: number;
  fileData?: string;
  visibleToParent?: boolean;
  gradeLevel?: string;
}

const Reports: React.FC<any> = ({ navigation }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));

  const handlePDFAction = async (report: Report) => {
    if (!report.fileData) {
      Alert.alert(
        '📄 No PDF Available',
        'This report does not have a PDF file attached yet.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    setDownloading(report.id);

    try {
      let fileUri = report.fileData;

      // Handle base64 data
      if (report.fileData.startsWith('data:application/pdf;base64,')) {
        console.log(`📄 Processing base64 PDF...`);
        
        const base64Data = report.fileData.split('base64,')[1];
        const filename = `${report.childName}_${report.reportType}_${report.quarter}.pdf`
          .replace(/[^a-zA-Z0-9_\-.]/g, '_');
        
        const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!cacheDir) {
          throw new Error('No cache directory available');
        }
        
        fileUri = cacheDir + filename;
        
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        console.log('✅ PDF file created:', fileUri);
        
        const isAvailable = await Sharing.isAvailableAsync();
        
        if (isAvailable) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Save Report',
            UTI: 'com.adobe.pdf'
          });
        } else {
          await Linking.openURL(fileUri);
        }
        
        setDownloading(null);
        return;
      }

      // Handle web URLs
      if (fileUri.startsWith('http')) {
        const canOpen = await Linking.canOpenURL(fileUri);
        if (canOpen) {
          await Linking.openURL(fileUri);
          setDownloading(null);
          return;
        } else {
          Alert.alert(
            '❌ Cannot Open URL',
            'Unable to open this PDF URL. Please try again later.',
            [{ text: 'OK', style: 'default' }]
          );
        }
      } 
      // Handle file URIs
      else if (fileUri.startsWith('file://')) {
        await Linking.openURL(fileUri);
        setDownloading(null);
        return;
      }
      else {
        Alert.alert(
          'Unable to Open',
          'This report format is not supported. Please contact your school for assistance.',
          [{ text: 'OK', style: 'default' as const }]
        );
      }

    } catch (error) {
      console.error(`PDF action error:`, error);
      
      Alert.alert(
        '❌ Operation Failed',
        'Could not open the PDF file. Please make sure you have a PDF viewer app installed.',
        [{ text: 'OK', style: 'default' as const }]
      );
    } finally {
      setDownloading(null);
    }
  };

  const loadUserData = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      navigation.replace('Login');
      return;
    }

    try {
      const studentsRef = ref(database, 'students');
      
      onValue(studentsRef, (snapshot) => {
        if (!snapshot.exists()) {
          setInitialLoading(false);
          setRefreshing(false);
          return;
        }

        const childrenList: Student[] = [];
        
        snapshot.forEach((childSnapshot) => {
          const childData = childSnapshot.val();
          const child: Student = {
            id: childSnapshot.key!,
            ...childData
          };
          
          if (childData.guardians && Array.isArray(childData.guardians)) {
            const isUserGuardian = childData.guardians.some((guardian: any) => {
              const guardianEmail = guardian.email || guardian.Email;
              return guardianEmail?.toLowerCase() === user.email?.toLowerCase();
            });
            
            if (isUserGuardian) {
              childrenList.push(child);
            }
          }
        });

        setChildren(childrenList);

        if (childrenList.length > 0) {
          loadReports(childrenList);
        } else {
          setInitialLoading(false);
          setRefreshing(false);
          setReports([]);
          setFilteredReports([]);
        }
      }, (error) => {
        console.error('Students data error:', error);
        setInitialLoading(false);
        setRefreshing(false);
      });

    } catch (error) {
      console.error('User data error:', error);
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  const loadReports = useCallback((childrenList: Student[]) => {
    try {
      const reportsRef = ref(database, 'reports');
      
      onValue(reportsRef, (snapshot) => {
        const reportsData: Report[] = [];
        
        if (snapshot.exists()) {
          snapshot.forEach((reportSnapshot) => {
            const reportData = reportSnapshot.val();
            const report: Report = {
              id: reportSnapshot.key!,
              ...reportData
            };
            
            const isChildReport = childrenList.some(child => 
              child.id === report.studentId
            );
            
            const isVisible = report.visibleToParent !== false;
            
            if (isChildReport && isVisible) {
              const child = childrenList.find(c => c.id === report.studentId);
              report.childName = child?.name || 
                                (child?.firstName && child?.lastName ? 
                                  `${child.firstName} ${child.lastName}` : 'Student');
              report.gradeLevel = child?.gradeLevel || 'N/A';
              
              reportsData.unshift(report);
            }
          });
        }
        
        setReports(reportsData);
        setFilteredReports(reportsData);
        setInitialLoading(false);
        setRefreshing(false);
        
        // Trigger fade-in animation
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]).start();
        
      }, (error) => {
        console.error('Reports data error:', error);
        setInitialLoading(false);
        setRefreshing(false);
      });
    } catch (error) {
      console.error('Load reports error:', error);
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const filterReports = (filter: string) => {
    setSelectedFilter(filter);
    
    let filtered = reports;
    
    switch (filter) {
      case 'quarterly':
        filtered = reports.filter(report => 
          report.reportType?.toLowerCase().includes('quarterly')
        );
        break;
      case 'attendance':
        filtered = reports.filter(report => 
          report.reportType?.toLowerCase().includes('attendance')
        );
        break;
      case 'test':
        filtered = reports.filter(report => 
          report.reportType?.toLowerCase().includes('test')
        );
        break;
      default:
        if (filter !== 'all') {
          filtered = reports.filter(report => report.studentId === filter);
        }
        break;
    }
    
    setFilteredReports(filtered);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadUserData();
  }, [loadUserData]);

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Date unavailable';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getReportTypeConfig = (type: string) => {
    const configs = {
      'Quarterly Report': { 
        color: COLORS.primary, 
        icon: 'bar-chart' as const, 
        gradient: [COLORS.primary, COLORS.primaryDark] as const 
      },
      'Attendance Summary': { 
        color: COLORS.success, 
        icon: 'calendar-check-o' as const, 
        gradient: [COLORS.success, COLORS.successDark] as const 
      },
      'Standardized Test Result': { 
        color: COLORS.warning, 
        icon: 'graduation-cap' as const, 
        gradient: [COLORS.warning, COLORS.warningDark] as const 
      },
      'default': { 
        color: COLORS.gray500, 
        icon: 'file-text' as const, 
        gradient: [COLORS.gray500, COLORS.gray600] as const 
      }
    };
    
    return configs[type as keyof typeof configs] || configs.default;
  };

  const renderReportItem = ({ item, index }: { item: Report; index: number }) => {
    const config = getReportTypeConfig(item.reportType);
    
    return (
      <Animated.View 
        style={[
          styles.reportCard,
          {
            opacity: fadeAnim,
            transform: [
              { 
                translateY: slideAnim.interpolate({
                  inputRange: [0, 30],
                  outputRange: [0, 30 - (index * 8)],
                })
              },
            ],
          },
        ]}
      >
        <View style={styles.cardContent}>
          {/* Header Section */}
          <View style={styles.headerSection}>
            <View style={styles.studentInfo}>
              <View style={styles.avatarContainer}>
                <LinearGradient
                  colors={config.gradient}
                  style={styles.avatarGradient}
                >
                  <Icon name="user" size={18} color={COLORS.white} />
                </LinearGradient>
              </View>
              <View style={styles.studentTextContainer}>
                <Text style={styles.studentName} numberOfLines={1}>
                  {item.childName}
                </Text>
                <Text style={styles.gradeLevel}>
                  Grade {item.gradeLevel}
                </Text>
              </View>
            </View>
            <View style={styles.reportTypeBadge}>
              <LinearGradient
                colors={config.gradient}
                style={styles.typeBadgeGradient}
              >
                <Icon name={config.icon} size={12} color={COLORS.white} />
                <Text style={styles.reportTypeText}>
                  {item.reportType}
                </Text>
              </LinearGradient>
            </View>
          </View>

          {/* Details Section */}
          <View style={styles.detailsSection}>
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <View style={[styles.detailIcon, { backgroundColor: `${config.color}15` }]}>
                  <Icon name="calendar" size={14} color={config.color} />
                </View>
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>Quarter & Year</Text>
                  <Text style={styles.detailValue}>
                    {item.quarter} • {item.schoolYear}
                  </Text>
                </View>
              </View>
              
              <View style={styles.detailItem}>
                <View style={[styles.detailIcon, { backgroundColor: `${config.color}15` }]}>
                  <Icon name="clock-o" size={14} color={config.color} />
                </View>
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>Upload Date</Text>
                  <Text style={styles.detailValue}>
                    {formatDate(item.uploadDate)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity 
            style={styles.downloadButton}
            onPress={() => handlePDFAction(item)}
            disabled={!item.fileData || downloading === item.id}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={item.fileData ? [COLORS.primary, COLORS.primaryDark] : [COLORS.gray400, COLORS.gray500]}
              style={styles.downloadButtonGradient}
            >
              {downloading === item.id ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <View style={styles.buttonContent}>
                  <Icon name="download" size={16} color={COLORS.white} />
                  <Text style={styles.downloadButtonText}>
                    {item.fileData ? 'Download Report' : 'No PDF Available'}
                  </Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  const renderFilterButtons = () => (
    <Animated.View style={[styles.filterContainer, { opacity: fadeAnim }]}>
      <Text style={styles.filterTitle}>Filter Reports</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScrollContent}
      >
        {[
          { key: 'all', label: 'All Reports', icon: 'th-large' as const },
          { key: 'quarterly', label: 'Quarterly', icon: 'bar-chart' as const },
          { key: 'attendance', label: 'Attendance', icon: 'calendar-check-o' as const },
          { key: 'test', label: 'Test Results', icon: 'graduation-cap' as const },
        ].map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterButton,
              selectedFilter === filter.key && styles.filterButtonActive
            ]}
            onPress={() => filterReports(filter.key)}
          >
            <View style={styles.filterButtonContent}>
              <Icon 
                name={filter.icon} 
                size={14} 
                color={selectedFilter === filter.key ? COLORS.white : COLORS.primary} 
              />
              <Text style={[
                styles.filterButtonText,
                selectedFilter === filter.key && styles.filterButtonTextActive
              ]}>
                {filter.label}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );

  if (initialLoading) {
    return (
      <View style={styles.fullScreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <LinearGradient
          colors={COLORS.primaryGradient}
          style={styles.loadingContainer}
        >
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={COLORS.white} />
            <Text style={styles.loadingText}>Loading Reports...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.fullScreenContainer}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* Header */}
      <LinearGradient colors={COLORS.primaryGradient} style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>📚 Student Reports</Text>
            <Text style={styles.headerSubtitle}>
              Track your children's academic progress
            </Text>
          </View>
        </View>
      </LinearGradient>

      <FlatList
        data={filteredReports}
        renderItem={renderReportItem}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        ListHeaderComponent={children.length > 0 ? renderFilterButtons : null}
        ListEmptyComponent={
          <Animated.View 
            style={[
              styles.emptyContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.emptyContent}>
              <View style={styles.emptyIllustration}>
                <Icon name="file-text" size={48} color={COLORS.gray300} />
              </View>
              <Text style={styles.emptyTitle}>No Reports Available</Text>
              <Text style={styles.emptyText}>
                {children.length === 0 
                  ? "Connect with your school to link your children's accounts and view their reports here."
                  : "No reports have been published yet. Check back later for updates."
                }
              </Text>
              <TouchableOpacity 
                style={styles.retryButton}
                onPress={loadUserData}
              >
                <LinearGradient
                  colors={COLORS.primaryGradient}
                  style={styles.retryButtonGradient}
                >
                  <Icon name="refresh" size={14} color={COLORS.white} />
                  <Text style={styles.retryButtonText}>Refresh</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: { 
    flex: 1, 
    backgroundColor: COLORS.primary 
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    ...TYPOGRAPHY.base,
    color: COLORS.white,
    fontWeight: '600',
  },
  header: {
    paddingTop: 50,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPOGRAPHY['2xl'],
    fontWeight: '700',
    color: COLORS.white,
  },
  headerSubtitle: {
    ...TYPOGRAPHY.sm,
    color: 'rgba(255,255,255,0.9)',
    marginTop: SPACING.xs,
  },
  filterContainer: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  filterTitle: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  filterScrollContent: {
    paddingRight: SPACING.sm,
  },
  filterButton: {
    borderRadius: BORDER_RADIUS.lg,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  filterButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterButtonText: {
    ...TYPOGRAPHY.sm,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: SPACING.xs,
  },
  filterButtonTextActive: {
    color: COLORS.white,
  },
  listContent: {
    paddingBottom: SPACING.xl,
    flexGrow: 1,
    backgroundColor: COLORS.background,
  },
  reportCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    ...SHADOWS.md,
  },
  cardContent: {
    padding: SPACING.lg,
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    marginRight: SPACING.md,
  },
  avatarGradient: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentTextContainer: {
    flex: 1,
  },
  studentName: {
    ...TYPOGRAPHY.lg,
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: 2,
  },
  gradeLevel: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray600,
    fontWeight: '500',
  },
  reportTypeBadge: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  typeBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.xs,
  },
  reportTypeText: {
    ...TYPOGRAPHY.xs,
    fontWeight: '700',
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  detailsSection: {
    marginBottom: SPACING.lg,
  },
  detailRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  detailItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailText: {
    flex: 1,
  },
  detailLabel: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray600,
    fontWeight: '500',
    marginBottom: 2,
  },
  detailValue: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray800,
    fontWeight: '600',
  },
  downloadButton: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  downloadButtonGradient: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  downloadButtonText: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.white,
  },
  emptyContainer: {
    marginTop: SPACING.xl,
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    ...SHADOWS.sm,
  },
  emptyContent: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyIllustration: {
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    ...TYPOGRAPHY.lg,
    fontWeight: '600',
    color: COLORS.gray600,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  retryButton: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  retryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  retryButtonText: {
    ...TYPOGRAPHY.sm,
    color: COLORS.white,
    fontWeight: '600',
  },
});

export default Reports;