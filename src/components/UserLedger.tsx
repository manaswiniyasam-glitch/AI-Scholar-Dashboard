import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { User, BookOpen, CheckCircle, Clock, ChevronRight, X, LayoutGrid, Award, Search, Users, Loader2 } from 'lucide-react';

interface StudentProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  lastLogin: any;
  completedTopicsCount?: number;
  totalScore?: number;
  attemptsCount?: number;
}

interface ActivityLog {
  id: string;
  topicId: string;
  question: string;
  result: {
    score: number;
    feedback: string;
  };
  timestamp: any;
  mode: string;
}

export function UserLedger({ onClose }: { onClose: () => void }) {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const studentsList: StudentProfile[] = [];

      for (const userDoc of usersSnap.docs) {
         const userData = userDoc.data() as StudentProfile;
         
         // Get their stats
         const progressSnap = await getDocs(query(collection(db, 'user_progress'), where('uid', '==', userData.uid)));
         const historySnap = await getDocs(query(collection(db, 'question_history'), where('uid', '==', userData.uid)));
         
         let totalScore = 0;
         historySnap.docs.forEach(d => {
           totalScore += d.data().result?.score || 0;
         });

         studentsList.push({
           ...userData,
           completedTopicsCount: progressSnap.docs.length,
           totalScore: totalScore,
           attemptsCount: historySnap.docs.length
         });
      }

      setStudents(studentsList.sort((a, b) => b.completedTopicsCount! - a.completedTopicsCount!));
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentDetails = async (student: StudentProfile) => {
    setSelectedStudent(student);
    setLogsLoading(true);
    try {
      const q = query(
        collection(db, 'question_history'),
        where('uid', '==', student.uid),
        orderBy('timestamp', 'desc')
      );
      const snap = await getDocs(q);
      const logs = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ActivityLog[];
      setActivityLogs(logs);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-10"
    >
      <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-2xl" onClick={onClose} />
      
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="relative w-full max-w-6xl h-full bg-slate-900 border border-white/10 rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col pointer-events-auto"
      >
        {/* Header */}
        <div className="p-10 border-b border-white/10 flex items-center justify-between bg-white/5 relative z-10">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-[1.5rem] bg-cyan-400 flex items-center justify-center text-slate-900 shadow-xl shadow-cyan-400/20">
              <Users size={32} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Scholar Ledger</h2>
              <p className="text-[11px] font-black text-cyan-400 uppercase tracking-[0.4em] mt-2">Comprehensive Academic Tracking</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="relative hidden md:block">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
               <input 
                 type="text"
                 placeholder="Search Scholars..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-3 text-sm text-white focus:border-cyan-400/50 outline-none w-64 transition-all"
               />
             </div>
             <button 
               onClick={onClose}
               className="p-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all border border-white/10"
             >
               <X size={24} />
             </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Student List */}
          <div className={`w-full ${selectedStudent ? 'hidden lg:block lg:w-1/3' : ''} border-r border-white/10 overflow-y-auto p-8 space-y-4 custom-scrollbar`}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                <Clock className="animate-spin mb-4" size={32} />
                <p className="text-[10px] uppercase font-black tracking-widest">Retrieving Registry</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-20 text-white/20">
                <Users size={48} className="mx-auto mb-4 opacity-50" />
                <p className="font-black uppercase tracking-widest text-xs">No scholars registered</p>
              </div>
            ) : (
              filteredStudents.map((student) => (
                <button
                  key={student.uid}
                  onClick={() => fetchStudentDetails(student)}
                  className={`w-full flex items-center gap-5 p-6 rounded-[2rem] border transition-all text-left group ${
                    selectedStudent?.uid === student.uid 
                      ? 'bg-cyan-400 border-cyan-400 text-slate-900 shadow-xl' 
                      : 'bg-white/5 border-white/5 hover:border-white/20 text-white'
                  }`}
                >
                  <img 
                    src={student.photoURL || `https://ui-avatars.com/api/?name=${student.displayName}&background=random`} 
                    alt={student.displayName}
                    className="w-14 h-14 rounded-2xl object-cover shadow-lg border-2 border-white/10"
                  />
                  <div className="flex-1 overflow-hidden">
                    <h4 className="font-black text-lg truncate leading-tight">{student.displayName}</h4>
                    <p className={`text-[10px] font-bold uppercase truncate opacity-50 ${selectedStudent?.uid === student.uid ? 'text-slate-900' : 'text-white'}`}>
                      {student.email}
                    </p>
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle size={12} className={selectedStudent?.uid === student.uid ? 'text-slate-900/40' : 'text-cyan-400/60'} />
                        <span className="text-[10px] font-black">{student.completedTopicsCount} Topics</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={20} className={`opacity-0 group-hover:opacity-100 transition-all ${selectedStudent?.uid === student.uid ? 'text-slate-900' : 'text-white/20'}`} />
                </button>
              ))
            )}
          </div>

          {/* Details Panel */}
          <div className={`flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-950/50 ${!selectedStudent ? 'hidden lg:flex items-center justify-center' : ''}`}>
             {!selectedStudent ? (
               <div className="text-center opacity-10">
                 <LayoutGrid size={120} strokeWidth={0.5} className="mx-auto mb-6" />
                 <h3 className="text-4xl font-black uppercase tracking-tighter">Selection Required</h3>
                 <p className="mt-4 font-black uppercase tracking-[0.4em] text-sm">Select a scholar to view analytical metrics</p>
               </div>
             ) : (
               <div className="max-w-4xl mx-auto w-full space-y-10">
                  <button 
                    onClick={() => setSelectedStudent(null)}
                    className="lg:hidden mb-6 flex items-center gap-2 text-cyan-400 font-black uppercase tracking-widest text-xs"
                  >
                    <ChevronRight size={16} className="rotate-180" /> Back to List
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="md:col-span-1 p-8 bg-white/5 rounded-[2.5rem] border border-white/10 text-center"
                    >
                      <img 
                        src={selectedStudent.photoURL || `https://ui-avatars.com/api/?name=${selectedStudent.displayName}&background=random`} 
                        alt={selectedStudent.displayName}
                        className="w-24 h-24 rounded-3xl mx-auto mb-6 shadow-2xl border-4 border-white/10"
                      />
                      <h3 className="text-2xl font-black text-white tracking-tighter leading-tight mb-2 underline decoration-cyan-400/30">{selectedStudent.displayName}</h3>
                      <p className="text-xs font-bold text-white/40 mb-6">{selectedStudent.email}</p>
                      
                      <div className="pt-6 border-t border-white/10 text-left space-y-4">
                        <div>
                          <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">Status</p>
                          <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                             <span className="text-xs font-black text-white text-cyan-400 uppercase">Authenticated</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">Last Transmission</p>
                          <span className="text-xs font-bold text-white/60">
                            {selectedStudent.lastLogin?.toDate()?.toLocaleString() || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </motion.div>

                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="md:col-span-2 grid grid-cols-2 gap-4"
                    >
                      <div className="bg-cyan-400 p-8 rounded-[2.5rem] text-slate-900 relative overflow-hidden group shadow-xl shadow-cyan-400/10">
                        <CheckCircle size={40} className="absolute -top-4 -right-4 opacity-10 group-hover:scale-110 transition-transform" />
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Modules Defeated</p>
                        <h4 className="text-6xl font-black tracking-tighter leading-none">{selectedStudent.completedTopicsCount}</h4>
                        <div className="mt-4 h-1 w-12 bg-slate-900/20" />
                        <p className="mt-4 text-[10px] font-bold uppercase opacity-60">Verified knowledge nodes</p>
                      </div>

                      <div className="bg-indigo-500 p-8 rounded-[2.5rem] text-white relative overflow-hidden group shadow-xl shadow-indigo-500/10">
                        <Award size={40} className="absolute -top-4 -right-4 opacity-10 group-hover:scale-110 transition-transform" />
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Cumulative Merit</p>
                        <h4 className="text-6xl font-black tracking-tighter leading-none">{selectedStudent.totalScore}</h4>
                        <div className="mt-4 h-1 w-12 bg-white/20" />
                        <p className="mt-4 text-[10px] font-bold uppercase opacity-60">Total logic verification points</p>
                      </div>

                      <div className="col-span-2 bg-white/5 p-8 rounded-[2.5rem] border border-white/10 flex items-center justify-between">
                         <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-white/20">
                               <BookOpen size={32} />
                            </div>
                            <div>
                               <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Evaluation Attempts</p>
                               <h4 className="text-2xl font-black text-white">{selectedStudent.attemptsCount} Units</h4>
                            </div>
                         </div>
                         <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Efficiency Ratio</p>
                            <h4 className="text-2xl font-black text-cyan-400">
                              {selectedStudent.attemptsCount ? Math.round((selectedStudent.completedTopicsCount! / selectedStudent.attemptsCount!) * 100) : 0}%
                            </h4>
                         </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Activity Log Section */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <Clock size={20} className="text-white/20" />
                         <h4 className="text-xl font-black text-white tracking-tight uppercase">Recent Cognitive Activity</h4>
                      </div>
                      <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em]">Temporal Flow</span>
                    </div>

                    <div className="space-y-4">
                      {logsLoading ? (
                        <div className="flex items-center justify-center py-10 text-white/20">
                           <Loader2 className="animate-spin mr-3" size={20} />
                           <span className="text-[10px] font-black uppercase tracking-widest">Accessing Event Logs...</span>
                        </div>
                      ) : activityLogs.length === 0 ? (
                        <div className="p-10 bg-white/5 rounded-3xl border border-dashed border-white/10 text-center text-white/20">
                           <p className="text-[10px] uppercase font-black tracking-widest">No activity recorded for this scholar</p>
                        </div>
                      ) : (
                        activityLogs.map((log) => (
                          <motion.div 
                            key={log.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="p-6 bg-white/5 rounded-3xl border border-white/5 hover:border-white/10 transition-all flex items-center justify-between group"
                          >
                            <div className="flex-1">
                               <div className="flex items-center gap-3 mb-2">
                                  <span className="px-2 py-0.5 bg-white/10 rounded-md text-[8px] font-black text-white/40 uppercase tracking-widest">{log.mode}</span>
                                  <span className="text-[9px] font-bold text-white/20">
                                    {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                                  </span>
                               </div>
                               <h5 className="text-md font-bold text-white leading-tight group-hover:text-cyan-400 transition-colors">{log.question}</h5>
                            </div>
                            <div className="ml-8 text-right shrink-0">
                               <div className={`text-2xl font-black ${log.result.score >= 8 ? 'text-cyan-400' : log.result.score >= 5 ? 'text-indigo-400' : 'text-red-400'}`}>
                                 {log.result.score}
                                 <span className="text-[10px] opacity-30 ml-1">/10</span>
                               </div>
                               <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mt-1">Accuracy Meta</p>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
               </div>
             )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-white/10 bg-white/5 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/20">
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-cyan-400" />
                  <span>Total Scholars: {students.length}</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-indigo-400" />
                  <span>Ledger Status: Synchronized</span>
               </div>
            </div>
            <p>Auth Ref: Matrix Ledger v4.2</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
