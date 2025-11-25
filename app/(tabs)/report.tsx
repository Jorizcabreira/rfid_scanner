// Reports.tsx
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

  // Removed loading animation - show content immediately

  // PDF action with proper base64 support
  const handlePDFAction = async (report: Report, action: 'view' | 'download') => {
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

      // Handle base64 data - convert to file and share
      if (report.fileData.startsWith('data:application/pdf;base64,')) {
        console.log(`📄 Processing base64 PDF for ${action}...`);
        
        const base64Data = report.fileData.split('base64,')[1];
        const filename = `${report.childName}_${report.reportType}_${report.quarter}.pdf`
          .replace(/[^a-zA-Z0-9_\-.]/g, '_');
        
        // Save to cache directory using legacy API
        const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!cacheDir) {
          throw new Error('No cache directory available');
        }
        
        fileUri = cacheDir + filename;
        
        // Write base64 to file
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        console.log('✅ PDF file created:', fileUri);
        
        // Use Sharing API to open/share
        const isAvailable = await Sharing.isAvailableAsync();
        
        if (isAvailable) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/pdf',
            dialogTitle: action === 'download' ? 'Save Report' : 'View Report',
            UTI: 'com.adobe.pdf'
          });
        } else {
          // Fallback: try Linking
          await Linking.openURL(fileUri);
        }
        
        setDownloading(null);
        return;
      }

      // Handle web URLs (Firebase Storage)
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
      console.error(`PDF ${action} error:`, error);
      
      Alert.alert(
        '❌ Operation Failed',
        'Could not open the PDF file. Please make sure you have a PDF viewer app installed.',
        [{ text: 'OK', style: 'default' as const }]
      );
    } finally {
      setDownloading(null);
    }
  };

  const viewPDF = async (report: Report) => {
    await handlePDFAction(report, 'view');
  };

  const downloadPDF = async (report: Report) => {
    await handlePDFAction(report, 'download');
  };

  // PDF handling with proper base64 support and sharing
  const handlePDFAlternative = async (report: Report) => {
    if (!report.fileData) {
      Alert.alert('No PDF', 'This report does not have a PDF file attached.');
      return;
    }

    setDownloading(report.id);

    try {
      let fileUri = report.fileData;

      // Handle base64 data - convert to file and open
      if (report.fileData.startsWith('data:application/pdf;base64,')) {
        console.log('📄 Processing base64 PDF...');
        
        const base64Data = report.fileData.split('base64,')[1];
        const filename = `${report.childName}_${report.reportType}_${report.quarter}.pdf`
          .replace(/[^a-zA-Z0-9_\-.]/g, '_');
        
        // Save to cache directory using legacy API
        const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!cacheDir) {
          throw new Error('No cache directory available');
        }
        
        const pdfFileUri = cacheDir + filename;
        
        // Write base64 to file
        await FileSystem.writeAsStringAsync(pdfFileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        console.log('✅ PDF file created:', pdfFileUri);
        
        // Check if sharing is available
        const isAvailable = await Sharing.isAvailableAsync();
        
        if (isAvailable) {
          // Share/Open the PDF file
          await Sharing.shareAsync(pdfFileUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'View/Save Report',
            UTI: 'com.adobe.pdf'
          });
        } else {
          // Fallback: try to open with Linking
          await Linking.openURL(pdfFileUri);
        }
        
        setDownloading(null);
        return;
      }
      
      // Handle direct URLs (Firebase Storage)
      if (report.fileData.startsWith('http')) {
        await Linking.openURL(report.fileData);
        setDownloading(null);
        return;
      }
      
      // Handle file URIs
      if (report.fileData.startsWith('file://')) {
        await Linking.openURL(report.fileData);
        setDownloading(null);
        return;
      }
      
      // Unknown format
      Alert.alert(
        'Unable to Open',
        'This report format is not supported. Please contact your school for assistance.',
        [{ text: 'OK', style: 'default' as const }]
      );
    } catch (error) {
      console.error('PDF handling error:', error);
      Alert.alert(
        'Error Opening PDF',
        'Could not open or save the PDF file. Please make sure you have a PDF viewer app installed.',
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
      'Quarterly Report': { color: '#6366F1', icon: 'bar-chart' as const, gradient: ['#6366F1', '#4F46E5'] as const },
      'Attendance Summary': { color: '#10B981', icon: 'calendar-check-o' as const, gradient: ['#10B981', '#059669'] as const },
      'Standardized Test Result': { color: '#F59E0B', icon: 'graduation-cap' as const, gradient: ['#F59E0B', '#D97706'] as const },
      'default': { color: '#6B7280', icon: 'file-text' as const, gradient: ['#6B7280', '#4B5563'] as const }
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
        <LinearGradient
          colors={['#FFFFFF', '#F8FAFF']}
          style={styles.cardGradient}
        >
          {/* STUDENT INFO SECTION */}
          <View style={styles.studentSection}>
            <LinearGradient
              colors={config.gradient as readonly [string, string]}
              style={styles.avatarGradient}
            >
              <Icon name="user" size={24} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.studentInfo}>
              <Text style={styles.studentName} numberOfLines={1}>
                {item.childName}
              </Text>
              <Text style={styles.gradeLevel}>
                Grade {item.gradeLevel}
              </Text>
            </View>
          </View>

          {/* REPORT TYPE BADGE */}
          <View style={styles.reportTypeSection}>
            <LinearGradient
              colors={config.gradient as readonly [string, string]}
              style={styles.reportTypeBadge}
            >
              <Icon name={config.icon} size={16} color="#FFFFFF" />
              <Text style={styles.reportTypeText}>
                {item.reportType}
              </Text>
            </LinearGradient>
          </View>

          {/* DETAILS GRID */}
          <View style={styles.detailsGrid}>
            <View style={styles.detailBox}>
              <View style={[styles.detailIconBox, { backgroundColor: `${config.color}15` }]}>
                <Icon name="calendar" size={16} color={config.color} />
              </View>
              <Text style={styles.detailTitle}>Quarter & Year</Text>
              <Text style={styles.detailContent} numberOfLines={1}>
                {item.quarter} • {item.schoolYear}
              </Text>
            </View>
            
            <View style={styles.detailBox}>
              <View style={[styles.detailIconBox, { backgroundColor: `${config.color}15` }]}>
                <Icon name="clock-o" size={16} color={config.color} />
              </View>
              <Text style={styles.detailTitle}>Upload Date</Text>
              <Text style={styles.detailContent} numberOfLines={1}>
                {formatDate(item.uploadDate)}
              </Text>
            </View>
          </View>

          <View style={styles.actionContainer}>
            <TouchableOpacity 
              style={styles.downloadButton}
              onPress={() => handlePDFAlternative(item)}
              disabled={!item.fileData || downloading === item.id}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={item.fileData ? ['#1999e8', '#0e77c0'] as const : ['#94a3b8', '#64748b'] as const}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.downloadButtonGradient}
              >
                {downloading === item.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <View style={styles.downloadIconContainer}>
                      <Icon name="download" size={22} color="#FFFFFF" />
                    </View>
                    <View style={styles.downloadTextContainer}>
                      <Text style={styles.downloadButtonTitle}>
                        {item.fileData ? 'Download File' : 'No PDF Available'}
                      </Text>
                      <Text style={styles.downloadButtonSubtitle}>
                        {item.fileData ? 'Tap to view or save report' : 'Report not uploaded yet'}
                      </Text>
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderFilterButtons = () => (
    <Animated.View style={[styles.filterContainer, { opacity: fadeAnim }]}>
      <Text style={styles.filterTitle}>📊 Filter Reports</Text>
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
            {/* ✅ FIXED: Gradient colors with proper typing */}
            <LinearGradient
              colors={selectedFilter === filter.key ? ['#1999e8', '#1488d0'] as const : ['#F8FAFC', '#FFFFFF'] as const}
              style={styles.filterButtonGradient}
            >
              <Icon 
                name={filter.icon} 
                size={14} 
                color={selectedFilter === filter.key ? '#FFFFFF' : '#1999e8'} 
              />
              <Text style={[
                styles.filterButtonText,
                selectedFilter === filter.key && styles.filterButtonTextActive
              ]}>
                {filter.label}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );

  if (initialLoading) {
    return (
      <View style={styles.fullScreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
        <LinearGradient
          colors={['#1999e8', '#1488d0'] as const}
          style={styles.loadingGradient}
        >
          <View style={styles.loadingContent}>
            <ActivityIndicator size={50} color="#FFFFFF" />
            <Text style={styles.loadingTitle}>Loading Reports...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.fullScreenContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
      
      {/* HEADER WITH DECORATIVE CIRCLES */}
      <LinearGradient colors={['#1999e8', '#1488d0', '#0e77c0'] as const} style={styles.header}>
        <View style={styles.decorativeCircle1} />
        <View style={styles.decorativeCircle2} />
        <View style={styles.decorativeCircle3} />
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
            colors={['#1999e8']}
            tintColor="#1999e8"
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
            {/* ✅ FIXED: Gradient colors with proper typing */}
            <LinearGradient
              colors={['#F8FAFC', '#FFFFFF'] as const}
              style={styles.emptyGradient}
            >
              <View style={styles.emptyIllustration}>
                <Icon name="file-text" size={80} color="#E2E8F0" />
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
                {/* ✅ FIXED: Gradient colors with proper typing */}
                <LinearGradient
                  colors={['#1999e8', '#1488d0'] as const}
                  style={styles.retryButtonGradient}
                >
                  <Icon name="refresh" size={16} color="#FFFFFF" />
                  <Text style={styles.retryButtonText}>Refresh</Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        }
      />
    </View>
  );
};

// ... (styles remain exactly the same as in your original code)
const styles = StyleSheet.create({
  fullScreenContainer: { 
    flex: 1, 
    backgroundColor: '#1999e8'
  },
  loadingGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 20,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  decorativeCircle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    top: -50,
    right: -50,
  },
  decorativeCircle2: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    top: 100,
    right: 30,
  },
  decorativeCircle3: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    bottom: 10,
    left: -30,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.95)',
    marginTop: 4,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  filterContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  filterTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  filterScrollContent: {
    paddingRight: 10,
  },
  filterButton: {
    borderRadius: 16,
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  filterButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(25, 153, 232, 0.1)',
  },
  filterButtonActive: {
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1999e8',
    marginLeft: 6,
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 40,
    flexGrow: 1,
    backgroundColor: '#f8fafc',
  },
  reportCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  cardGradient: {
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
  },
  studentSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.15)',
  },
  avatarGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  gradeLevel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  reportTypeSection: {
    marginBottom: 18,
    alignItems: 'flex-start',
  },
  reportTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  reportTypeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  detailBox: {
    flex: 1,
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  detailIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  detailTitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailContent: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  actionContainer: {
    marginTop: 2,
  },
  downloadButton: {
    borderRadius: 16,
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  downloadButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
  },
  downloadIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadTextContainer: {
    flex: 1,
  },
  downloadButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  downloadButtonSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.2,
    marginTop: 1,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  helpText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
    fontStyle: 'italic',
  },
  emptyContainer: {
    marginTop: 40,
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyGradient: {
    paddingVertical: 60,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyIllustration: {
    marginBottom: 30,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  retryButton: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  retryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Reports;