// app/(tabs)/attendance-history.tsx
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
import { SafeAreaView } from 'react-native-safe-area-context';

// Firebase imports - use only one instance
import { auth, database } from '../../firebaseConfig';
import { getApps } from 'firebase/app';

console.log('Firebase apps initialized:', getApps().length);

// Use the database instance from firebaseConfig
const db = database;

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
}

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
                // Use the RFID from student data, not from guardian
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
    
    // Use the correct identifier (RFID or student ID)
    const attendanceRef = ref(db, `attendanceLogs/${studentIdentifier}`);
    const attendanceListener = onValue(attendanceRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const allAttendanceData: MonthlyAttendance = {};
        
        // Load ALL attendance records, not just current month
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
      case 'Present': return '#10b981';
      case 'Late': return '#f59e0b';
      case 'Absent': return '#ef4444';
      default: return '#d1d5db';
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
    const dateStr = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const attendance = attendanceData[dateStr];
    const isToday = today.getDate() === day && 
                    today.getMonth() === currentMonth.getMonth() && 
                    today.getFullYear() === currentYear;
    
    calendarDays.push({
      day,
      date: dateStr,
      attendance,
      isToday,
      isCurrentMonth: true
    });
  }

  // Add days from next month to fill the last row (if needed)
  const totalCells = 42; // 6 rows x 7 days
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
    if (!dayInfo || !dayInfo.attendance) {
      return {
        status: 'No Record' as const,
        color: '#d1d5db',
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
        <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
        <LinearGradient colors={['#1999e8', '#1488d0']} style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading attendance data...</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.fullScreenContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
      
      {/* UPDATED HEADER - SAGAD SA TAAS WALANG PUTI */}
      <LinearGradient colors={['#1999e8', '#1488d0']} style={styles.header}>
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
            colors={['#1999e8']}
            tintColor={'#1999e8'}
          />
        }
      >
        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <LinearGradient colors={['#10b981', '#34d399']} style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.statNumber}>{stats.present}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </LinearGradient>
          
          <LinearGradient colors={['#f59e0b', '#fbbf24']} style={styles.statCard}>
            <Ionicons name="time" size={24} color="#fff" />
            <Text style={styles.statNumber}>{stats.late}</Text>
            <Text style={styles.statLabel}>Late</Text>
          </LinearGradient>
          
          <LinearGradient colors={['#ef4444', '#f87171']} style={styles.statCard}>
            <Ionicons name="close-circle" size={24} color="#fff" />
            <Text style={styles.statNumber}>{stats.absent}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </LinearGradient>
        </View>

        {/* Last Updated */}
        <View style={styles.lastUpdated}>
          <Ionicons name="time-outline" size={14} color="#6b7280" />
          <Text style={styles.lastUpdatedText}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </Text>
        </View>

        {/* Calendar Card */}
        <View style={styles.calendarCard}>
          {/* Month and Year Navigation */}
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.navButton}>
              <Ionicons name="chevron-back" size={24} color="#1999e8" />
            </TouchableOpacity>
            
            <View style={styles.monthYearContainer}>
              <Text style={styles.monthYearText}>
                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
            </View>
            
            <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.navButton}>
              <Ionicons name="chevron-forward" size={24} color="#1999e8" />
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
                  selectedDayInfo && dayInfo && selectedDayInfo.date === dayInfo.date && styles.selectedCell
                ]}
                onPress={() => dayInfo && handleDayPress(dayInfo)}
                disabled={!dayInfo}
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
                    {dayInfo.attendance && (
                      <View style={[
                        styles.statusDot,
                        { backgroundColor: getStatusColor(dayInfo.attendance.status) }
                      ]}>
                        <Ionicons 
                          name={getStatusIcon(dayInfo.attendance.status)} 
                          size={12} 
                          color="#fff" 
                        />
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Empty Space */}
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
            </View>

            {/* Attendance Status */}
            <View style={styles.modalBody}>
              <LinearGradient 
                colors={selectedDayDetails ? [selectedDayDetails.color, `${selectedDayDetails.color}99`] : ['#d1d5db', '#9ca3af']} 
                style={styles.modalStatusIndicator}
              >
                <Ionicons 
                  name={selectedDayDetails?.icon || 'help-circle'} 
                  size={48} 
                  color="#fff" 
                />
                <View style={styles.modalStatusTextContainer}>
                  <Text style={styles.modalStatusText}>
                    {selectedDayDetails?.status || 'No Record'}
                  </Text>
                  <Text style={styles.modalStatusDescription}>
                    {selectedDayDetails?.description}
                  </Text>
                </View>
              </LinearGradient>

              {/* Time Details */}
              {selectedDayInfo?.attendance && (
                <View style={styles.modalTimeDetails}>
                  <Text style={styles.timeDetailsTitle}>Attendance Details</Text>
                  
                  {selectedDayInfo.attendance.timeIn && (
                    <View style={styles.modalTimeRow}>
                      <View style={styles.timeIconContainer}>
                        <Ionicons name="enter" size={20} color="#10b981" />
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
                      <View style={styles.timeIconContainer}>
                        <Ionicons name="exit" size={20} color="#ef4444" />
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
                      <View style={styles.timeIconContainer}>
                        <Ionicons name="time" size={20} color="#f59e0b" />
                      </View>
                      <View style={styles.timeTextContainer}>
                        <Text style={styles.timeLabel}>Current Status</Text>
                        <Text style={[styles.timeValue, { color: '#f59e0b' }]}>
                          Still in school
                        </Text>
                      </View>
                    </View>
                  )}

                  {!selectedDayInfo.attendance.timeIn && !selectedDayInfo.attendance.timeOut && (
                    <View style={styles.noTimeData}>
                      <Ionicons name="information-circle" size={24} color="#6b7280" />
                      <Text style={styles.noTimeDataText}>
                        No time records available for this date
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {!selectedDayInfo?.attendance && (
                <View style={styles.noDataContainer}>
                  <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
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
    backgroundColor: '#1999e8' // SAME COLOR AS HEADER
  },
  loadingContainer: { 
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { 
    marginTop: 12, 
    fontSize: 16, 
    color: '#fff',
    fontWeight: '600'
  },
  scrollView: { 
    flex: 1,
    backgroundColor: '#f8fafc' 
  },
  // UPDATED HEADER - SAGAD SA TAAS WALANG PUTI
  header: {
    paddingTop: 50, // For iOS status bar
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginVertical: 4,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  lastUpdated: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  lastUpdatedText: {
    fontSize: 12,
    color: '#6b7280',
  },
  calendarCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  monthYearContainer: {
    flex: 1,
    alignItems: 'center',
  },
  monthYearText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    width: (Dimensions.get('window').width - 72) / 7,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: (Dimensions.get('window').width - 72) / 7,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginVertical: 2,
    position: 'relative',
  },
  emptyCell: {
    backgroundColor: 'transparent',
  },
  otherMonthCell: {
    backgroundColor: '#f8fafc',
  },
  todayCell: {
    backgroundColor: '#e0f2fe',
    borderWidth: 2,
    borderColor: '#1999e8',
  },
  selectedCell: {
    backgroundColor: '#1999e8',
  },
  dayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  otherMonthText: {
    color: '#9ca3af',
    fontWeight: '400',
  },
  todayText: {
    color: '#1999e8',
    fontWeight: 'bold',
  },
  selectedText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  statusDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
  bottomSpace: {
    height: 20,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '100%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
  },
  modalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  modalBody: {
    padding: 20,
  },
  modalStatusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
  },
  modalStatusTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  modalStatusText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalStatusDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  modalTimeDetails: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
  },
  timeDetailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  modalTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 12,
  },
  timeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  timeTextContainer: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  timeValue: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '600',
    marginTop: 2,
  },
  noTimeData: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  noTimeDataText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  noDataContainer: {
    alignItems: 'center',
    padding: 40,
  },
  noDataText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 12,
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  modalCloseBtn: {
    backgroundColor: '#1999e8',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AttendanceHistory;