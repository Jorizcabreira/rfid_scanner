import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { off, onValue, ref } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

// Firebase imports - use only one instance
import { getApps } from 'firebase/app';
import { auth, database } from '../../firebaseConfig';

console.log('Firebase apps initialized:', getApps().length);

// Use the database instance from firebaseConfig
const db = database;

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

interface AttendanceRecord {
  status: 'Present' | 'Absent' | 'Late';
  timeIn?: string;
  timeOut?: string;
  date?: string;
}

interface MonthlyAttendance {
  [date: string]: AttendanceRecord;
}

interface CalendarDay {
  day: number;
  date: string;
  attendance?: AttendanceRecord;
  isToday: boolean;
  isCurrentMonth: boolean;
  isWeekend?: boolean;
  isHoliday?: boolean;
}

// List of holidays (YYYY-MM-DD format)
const HOLIDAY_MAP: Record<string, string> = {
  '2025-01-01': "New Year's Day",
  '2025-04-09': 'Araw ng Kagitingan',
  '2025-05-01': 'Labor Day',
  '2025-06-12': 'Independence Day',
  '2025-08-21': 'Ninoy Aquino Day',
  '2025-11-30': 'Bonifacio Day',
  '2025-12-25': 'Christmas Day',
  '2025-12-30': 'Rizal Day',
};
const HOLIDAYS = Object.keys(HOLIDAY_MAP);

type IoniconsName = keyof typeof Ionicons.glyphMap;

const AttendanceHistory = () => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [attendanceData, setAttendanceData] = useState<MonthlyAttendance>({});
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedDayInfo, setSelectedDayInfo] = useState<CalendarDay | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      setLoading(false);
      Alert.alert("Error", "No user logged in or user email not found.");
      return;
    }

    // Find the specific student linked to this parent/guardian
    const studentsRef = ref(db, 'students');
    const studentListener = onValue(studentsRef, (snapshot) => {
      if (snapshot.exists()) {
        const studentsData = snapshot.val();
        let foundStudent = null;

        // Loop through all students to find the one linked to current user
        for (const studentId in studentsData) {
          const student = studentsData[studentId];
          
          // Check if this student has guardians and if current user is one of them
          if (student.guardians) {
            const guardiansArray = Array.isArray(student.guardians)
              ? student.guardians
              : Object.values(student.guardians);
            
            const isLinked = guardiansArray.some(
              (guardian: any) => guardian.email?.toLowerCase() === user.email?.toLowerCase()
            );

            if (isLinked) {
              foundStudent = { 
                id: studentId, 
                ...student,
                rfid: student.rfid || studentId 
              };
              break;
            }
          }
        }

        if (foundStudent) {
          setSelectedStudent(foundStudent);
          loadAttendanceData(foundStudent.rfid || foundStudent.id);
        } else {
          setSelectedStudent(null);
          setAttendanceData({});
          setLoading(false);
          Alert.alert("Info", "No student linked to your account.");
        }
      } else {
        setSelectedStudent(null);
        setAttendanceData({});
        setLoading(false);
      }
    });

    return () => {
      off(studentsRef, 'value', studentListener);
    };
  }, []);

  const loadAttendanceData = (studentIdentifier: string) => {
    setLoading(true);
    
    const attendanceRef = ref(db, `attendanceLogs/${studentIdentifier}`);
    const attendanceListener = onValue(attendanceRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const allAttendanceData: MonthlyAttendance = {};
        
        Object.keys(data).forEach(date => {
          const record = data[date];
          if (record) {
            allAttendanceData[date] = {
              status: record.status,
              timeIn: record.timeIn,
              timeOut: record.timeOut,
              date: record.date
            };
          }
        });
        
        setAttendanceData(allAttendanceData);
        setLastUpdated(new Date());
        
        // Auto-select today's date after loading data
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const todayAttendance = allAttendanceData[todayStr];
        
        if (todayAttendance) {
          setSelectedDate(today);
          setSelectedDayInfo({
            day: today.getDate(),
            date: todayStr,
            attendance: todayAttendance,
            isToday: true,
            isCurrentMonth: true
          });
        }
      } else {
        setAttendanceData({});
        setLastUpdated(new Date());
      }
      setLoading(false);
    });

    return () => {
      off(attendanceRef, 'value', attendanceListener);
    };
  };

  const refreshAttendanceData = () => {
    if (selectedStudent) {
      loadAttendanceData(selectedStudent.rfid || selectedStudent.id);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    refreshAttendanceData();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    const startingDay = firstDay.getDay();
    
    return { daysInMonth, startingDay, lastDay };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present': return COLORS.success;
      case 'Late': return COLORS.warning;
      case 'Absent': return COLORS.error;
      default: return COLORS.gray300;
    }
  };

  const getStatusIcon = (status: string): IoniconsName => {
    switch (status) {
      case 'Present': return 'checkmark-circle';
      case 'Late': return 'time';
      case 'Absent': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth);
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
    setSelectedDate(null);
    setSelectedDayInfo(null);
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '--:--';
    try {
      if (timeString.includes(':')) {
        const [hours, minutes] = timeString.split(':');
        const hourNum = parseInt(hours);
        const period = hourNum >= 12 ? 'PM' : 'AM';
        const displayHour = hourNum % 12 || 12;
        return `${displayHour}:${minutes.padStart(2, '0')} ${period}`;
      }
      return timeString;
    } catch (error) {
      return timeString;
    }
  };

  const getAttendanceStats = () => {
    const present = Object.values(attendanceData).filter(a => a.status === 'Present').length;
    const late = Object.values(attendanceData).filter(a => a.status === 'Late').length;
    const absent = Object.values(attendanceData).filter(a => a.status === 'Absent').length;
    
    const totalDays = Object.keys(attendanceData).length;
    
    return { present, late, absent, totalDays };
  };

  const handleDayPress = (dayInfo: CalendarDay) => {
    setSelectedDate(new Date(dayInfo.date));
    setSelectedDayInfo(dayInfo);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
  };

  const { daysInMonth, startingDay } = getDaysInMonth(currentMonth);
  const stats = getAttendanceStats();

  const calendarDays: (CalendarDay | null)[] = [];
  const today = new Date();
  const currentYear = currentMonth.getFullYear();
  const currentMonthNum = currentMonth.getMonth() + 1;
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startingDay; i++) {
    calendarDays.push(null);
  }
  
  // Add cells for each day of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(currentYear, currentMonthNum - 1, day);
    const dayOfWeek = dateObj.getDay();
    const dateStr = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const attendance = attendanceData[dateStr];
    const isToday = today.getDate() === day && 
                    today.getMonth() === currentMonth.getMonth() && 
                    today.getFullYear() === currentYear;
    const isHoliday = HOLIDAYS.includes(dateStr);
    calendarDays.push({
      day,
      date: dateStr,
      attendance: (!isHoliday && dayOfWeek !== 0 && dayOfWeek !== 6) ? attendance : undefined,
      isToday,
      isCurrentMonth: true,
      isWeekend: (dayOfWeek === 0 || dayOfWeek === 6),
      isHoliday
    });
  }

  // Add days from next month to fill the last row
  const totalCells = 42;
  const remainingCells = totalCells - calendarDays.length;
  for (let day = 1; day <= remainingCells; day++) {
    const nextMonth = new Date(currentYear, currentMonthNum, day);
    const dateStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`;
    const attendance = attendanceData[dateStr];
    
    calendarDays.push({
      day,
      date: dateStr,
      attendance,
      isToday: false,
      isCurrentMonth: false
    });
  }

  const getDayDetails = (dayInfo: CalendarDay | null) => {
    if (!dayInfo) {
      return {
        status: 'No Record' as const,
        color: COLORS.gray300,
        icon: 'help-circle' as IoniconsName,
        description: 'No attendance record found for this date'
      };
    }
    if (dayInfo.isHoliday) {
      return {
        status: HOLIDAY_MAP[dayInfo.date] || 'Holiday',
        color: COLORS.gray500,
        icon: 'flag' as IoniconsName,
        description: 'No class today (holiday)'
      };
    }
    if (!dayInfo.attendance) {
      return {
        status: 'No Record' as const,
        color: COLORS.gray300,
        icon: 'help-circle' as IoniconsName,
        description: 'No attendance record found for this date'
      };
    }
    return {
      status: dayInfo.attendance.status,
      color: getStatusColor(dayInfo.attendance.status),
      icon: getStatusIcon(dayInfo.attendance.status),
      description: `${dayInfo.attendance.status}`
    };
  };

  const selectedDayDetails = selectedDayInfo ? getDayDetails(selectedDayInfo) : null;

  // Add automatic refresh
  useEffect(() => {
    const interval = setInterval(() => {
      refreshAttendanceData();
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedStudent]);

  if (loading) {
    return (
      <View style={styles.fullScreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <LinearGradient colors={COLORS.primaryGradient} style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.white} />
          <Text style={styles.loadingText}>Loading attendance data...</Text>
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
            <Text style={styles.headerTitle}>Attendance History</Text>
            <Text style={styles.headerSubtitle}>
              Track your child's daily attendance
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            </View>
            <Text style={styles.statNumber}>{stats.present}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
              <Ionicons name="time" size={20} color={COLORS.warning} />
            </View>
            <Text style={styles.statNumber}>{stats.late}</Text>
            <Text style={styles.statLabel}>Late</Text>
          </View>
          
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Ionicons name="close-circle" size={20} color={COLORS.error} />
            </View>
            <Text style={styles.statNumber}>{stats.absent}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </View>
        </View>

        {/* Last Updated */}
        <View style={styles.lastUpdated}>
          <Ionicons name="time-outline" size={14} color={COLORS.gray500} />
          <Text style={styles.lastUpdatedText}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </Text>
        </View>

        {/* Calendar Card */}
        <View style={styles.calendarCard}>
          {/* Month and Year Navigation */}
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.navButton}>
              <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
            </TouchableOpacity>
            
            <View style={styles.monthYearContainer}>
              <Text style={styles.monthYearText}>
                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
            </View>
            
            <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.navButton}>
              <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* Week Days */}
          <View style={styles.weekDays}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <Text key={day} style={styles.weekDayText}>{day}</Text>
            ))}
          </View>
          
          {/* Calendar Grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((dayInfo, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  !dayInfo && styles.emptyCell,
                  dayInfo && !dayInfo.isCurrentMonth && styles.otherMonthCell,
                  dayInfo?.isToday && styles.todayCell,
                  selectedDayInfo && dayInfo && selectedDayInfo.date === dayInfo.date && styles.selectedCell,
                  (dayInfo?.isWeekend || dayInfo?.isHoliday) && { opacity: 0.5 }
                ]}
                onPress={() => dayInfo && (dayInfo.isHoliday || !dayInfo.isWeekend) && handleDayPress(dayInfo)}
                disabled={!dayInfo || (!dayInfo.isHoliday && dayInfo.isWeekend)}
              >
                {dayInfo && (
                  <>
                    <Text style={[
                      styles.dayText,
                      (!dayInfo.isCurrentMonth) && styles.otherMonthText,
                      dayInfo.isToday && styles.todayText,
                      selectedDayInfo && selectedDayInfo.date === dayInfo.date && styles.selectedText
                    ]}>
                      {dayInfo.day}
                    </Text>
                    {/* Status indicators */}
                    {dayInfo.attendance && !dayInfo.isWeekend && !dayInfo.isHoliday && (
                      <View style={[
                        styles.statusIndicator,
                        { backgroundColor: getStatusColor(dayInfo.attendance.status) }
                      ]}>
                        <Ionicons 
                          name={getStatusIcon(dayInfo.attendance.status)} 
                          size={10} 
                          color={COLORS.white} 
                        />
                      </View>
                    )}
                    {dayInfo.isHoliday && (
                      <View style={[styles.statusIndicator, { backgroundColor: COLORS.gray500 }]}> 
                        <Ionicons name="flag" size={10} color={COLORS.white} />
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>Legend</Text>
          <View style={styles.legendItems}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
              <Text style={styles.legendText}>Present</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.warning }]} />
              <Text style={styles.legendText}>Late</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.error }]} />
              <Text style={styles.legendText}>Absent</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.gray500 }]} />
              <Text style={styles.legendText}>Holiday</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* Modal for Day Details */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDate?.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color={COLORS.gray500} />
              </TouchableOpacity>
            </View>

            {/* Attendance Status */}
            <View style={styles.modalBody}>
              <View style={[
                styles.modalStatusCard,
                { borderLeftColor: selectedDayDetails?.color || COLORS.gray300 }
              ]}>
                <View style={styles.modalStatusHeader}>
                  <Ionicons 
                    name={selectedDayDetails?.icon || 'help-circle'} 
                    size={32} 
                    color={selectedDayDetails?.color || COLORS.gray300} 
                  />
                  <View style={styles.modalStatusTextContainer}>
                    <Text style={styles.modalStatusText}>
                      {selectedDayDetails?.status || 'No Record'}
                    </Text>
                    <Text style={styles.modalStatusDescription}>
                      {selectedDayDetails?.description}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Time Details */}
              {selectedDayInfo?.attendance && (
                <View style={styles.modalTimeDetails}>
                  <Text style={styles.timeDetailsTitle}>Attendance Details</Text>
                  
                  {selectedDayInfo.attendance.timeIn && (
                    <View style={styles.modalTimeRow}>
                      <View style={[styles.timeIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                        <Ionicons name="enter" size={18} color={COLORS.success} />
                      </View>
                      <View style={styles.timeTextContainer}>
                        <Text style={styles.timeLabel}>Time In</Text>
                        <Text style={styles.timeValue}>
                          {formatTime(selectedDayInfo.attendance.timeIn)}
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  {selectedDayInfo.attendance.timeOut && (
                    <View style={styles.modalTimeRow}>
                      <View style={[styles.timeIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                        <Ionicons name="exit" size={18} color={COLORS.error} />
                      </View>
                      <View style={styles.timeTextContainer}>
                        <Text style={styles.timeLabel}>Time Out</Text>
                        <Text style={styles.timeValue}>
                          {formatTime(selectedDayInfo.attendance.timeOut)}
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  {!selectedDayInfo.attendance.timeOut && selectedDayInfo.attendance.status === 'Present' && (
                    <View style={styles.modalTimeRow}>
                      <View style={[styles.timeIconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                        <Ionicons name="time" size={18} color={COLORS.warning} />
                      </View>
                      <View style={styles.timeTextContainer}>
                        <Text style={styles.timeLabel}>Current Status</Text>
                        <Text style={[styles.timeValue, { color: COLORS.warning }]}>
                          Still in school
                        </Text>
                      </View>
                    </View>
                  )}

                  {!selectedDayInfo.attendance.timeIn && !selectedDayInfo.attendance.timeOut && (
                    <View style={styles.noTimeData}>
                      <Ionicons name="information-circle" size={20} color={COLORS.gray500} />
                      <Text style={styles.noTimeDataText}>
                        No time records available for this date
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {!selectedDayInfo?.attendance && (
                <View style={styles.noDataContainer}>
                  <Ionicons name="calendar-outline" size={48} color={COLORS.gray300} />
                  <Text style={styles.noDataText}>No attendance record</Text>
                  <Text style={styles.noDataSubtext}>
                    There is no attendance data available for this date.
                  </Text>
                </View>
              )}
            </View>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={closeModal} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  loadingText: { 
    marginTop: SPACING.md,
    ...TYPOGRAPHY.base,
    color: COLORS.white,
    fontWeight: '600',
  },
  scrollView: { 
    flex: 1,
    backgroundColor: COLORS.background 
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
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: SPACING.lg,
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  statIconContainer: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.xs,
  },
  statNumber: {
    ...TYPOGRAPHY.lg,
    fontWeight: '700',
    color: COLORS.gray900,
    marginVertical: 2,
  },
  statLabel: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray600,
    fontWeight: '600',
  },
  lastUpdated: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  lastUpdatedText: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray500,
  },
  calendarCard: {
    backgroundColor: COLORS.white,
    margin: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  monthYearContainer: {
    flex: 1,
    alignItems: 'center',
  },
  monthYearText: {
    ...TYPOGRAPHY.lg,
    fontWeight: '700',
    color: COLORS.gray800,
    textAlign: 'center',
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.md,
  },
  weekDayText: {
    ...TYPOGRAPHY.xs,
    fontWeight: '600',
    color: COLORS.gray600,
    width: (Dimensions.get('window').width - 72) / 7,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: (Dimensions.get('window').width - 72) / 7,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    marginVertical: 1,
    position: 'relative',
  },
  emptyCell: {
    backgroundColor: 'transparent',
  },
  otherMonthCell: {
    backgroundColor: COLORS.gray50,
  },
  todayCell: {
    backgroundColor: 'rgba(25, 153, 232, 0.1)',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  selectedCell: {
    backgroundColor: COLORS.primary,
  },
  dayText: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  otherMonthText: {
    color: COLORS.gray400,
    fontWeight: '400',
  },
  todayText: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  selectedText: {
    color: COLORS.white,
    fontWeight: '700',
  },
  statusIndicator: {
    width: 18,
    height: 18,
    borderRadius: BORDER_RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 2,
    right: 2,
  },
  legendCard: {
    backgroundColor: COLORS.white,
    margin: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  legendTitle: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: BORDER_RADIUS.full,
  },
  legendText: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray600,
    fontWeight: '500',
  },
  bottomSpace: {
    height: SPACING.xl,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    width: '100%',
    maxHeight: '80%',
    ...SHADOWS.lg,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  modalTitle: {
    ...TYPOGRAPHY.lg,
    fontWeight: '700',
    color: COLORS.gray800,
    flex: 1,
  },
  modalCloseButton: {
    padding: SPACING.xs,
  },
  modalBody: {
    padding: SPACING.lg,
  },
  modalStatusCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderLeftWidth: 4,
  },
  modalStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  modalStatusTextContainer: {
    flex: 1,
  },
  modalStatusText: {
    ...TYPOGRAPHY.xl,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  modalStatusDescription: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray600,
    marginTop: 2,
  },
  modalTimeDetails: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
  },
  timeDetailsTitle: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  modalTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
    gap: SPACING.md,
  },
  timeIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeTextContainer: {
    flex: 1,
  },
  timeLabel: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray600,
    fontWeight: '500',
  },
  timeValue: {
    ...TYPOGRAPHY.base,
    color: COLORS.gray800,
    fontWeight: '600',
    marginTop: 2,
  },
  noTimeData: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  noTimeDataText: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray500,
    textAlign: 'center',
  },
  noDataContainer: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  noDataText: {
    ...TYPOGRAPHY.lg,
    fontWeight: '600',
    color: COLORS.gray500,
    marginTop: SPACING.md,
  },
  noDataSubtext: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray400,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  modalFooter: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  modalCloseBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    ...TYPOGRAPHY.base,
    color: COLORS.white,
    fontWeight: '600',
  },
});

export default AttendanceHistory;