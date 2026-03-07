import React, { useState, useEffect, useRef } from 'react';
import { 
  Moon, Sun, LayoutGrid, Clock, LogOut, ShieldAlert, 
  Send, ChevronLeft, ChevronRight, User, Eye, 
  FileJson, Trash2, Printer, CheckCircle2, AlertCircle,
  Upload, Users, BookOpen, X, KeySquare, PlayCircle,
  UserCheck, UserX
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, getDocs, deleteDoc } from 'firebase/firestore';

// ==========================================
// 1. FIREBASE INITIALIZATION
// ==========================================
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'cbt-smp-v2';

// ==========================================
// 2. MOCK DATA: AKUN GURU & MATA PELAJARAN
// ==========================================
// Dalam versi nyata, ini disimpan di database terenkripsi.
const TEACHERS_DB = [
  { username: 'guru_pai', password: '123', name: 'Ust. Ahmad Fulan', subject: 'Pendidikan Agama Islam' },
  { username: 'guru_mtk', password: '123', name: 'Ibu Siti Aminah', subject: 'Matematika' },
  { username: 'guru_ipa', password: '123', name: 'Bapak Budi Santoso', subject: 'Ilmu Pengetahuan Alam' }
];

// ==========================================
// 3. REUSABLE UI COMPONENTS
// ==========================================
const Card = ({ children, className = '', isDarkMode }) => (
  <div className={`backdrop-blur-xl border shadow-2xl rounded-3xl transition-all duration-300
    ${isDarkMode 
      ? 'bg-slate-800/40 border-slate-700/50 shadow-black/50 text-slate-100' 
      : 'bg-white/60 border-white/80 shadow-emerald-900/10 text-slate-800'} 
    ${className}`}>
    {children}
  </div>
);

// ==========================================
// 4. MAIN APPLICATION COMPONENT
// ==========================================
const App = () => {
  // --- GLOBAL STATES ---
  const [authUser, setAuthUser] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [view, setView] = useState('student_login'); // Default langsung ke login siswa
  const [modal, setModal] = useState({ isOpen: false, type: '', message: '', inputValue: '' });

  // --- STUDENT STATES ---
  const [user, setUser] = useState({ name: '', class: '', token: '' });
  const [examState, setExamState] = useState({
    answers: {}, timeLeft: 0, currentIdx: 0, isFinished: false, violations: 0, score: 0
  });
  const [isStudentReady, setIsStudentReady] = useState(false);
  const [activeSession, setActiveSession] = useState(null); 
  const [studentQuestions, setStudentQuestions] = useState([]); 

  // --- TEACHER STATES ---
  const [activeTeacher, setActiveTeacher] = useState(null);
  const [teacherLoginInput, setTeacherLoginInput] = useState({ username: '', password: '' });
  const [teacherQuestions, setTeacherQuestions] = useState([]); 
  const [adminSelectedClass, setAdminSelectedClass] = useState('7A');
  const [studentsData, setStudentsData] = useState([]); 

  const timerRef = useRef(null);

  // --- EFFECT: FIREBASE AUTH & DARK MODE ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) { console.error("Auth Error:", error); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setAuthUser(u));

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
    }
    return () => unsubscribe();
  }, []);

  // --- EFFECT: RESTORE SESSION FROM LOCAL STORAGE ---
  useEffect(() => {
    const saved = localStorage.getItem('cbt_v2_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (['student_waiting', 'student_exam', 'student_result'].includes(parsed.view)) {
          setUser(parsed.user);
          setExamState(parsed.examState);
          setIsStudentReady(parsed.isStudentReady);
          setStudentQuestions(parsed.studentQuestions || []);
          setView(parsed.view);
        } else if (parsed.view === 'teacher_dashboard') {
          setActiveTeacher(parsed.activeTeacher);
          setView(parsed.view);
        }
      } catch (e) { console.error(e); }
    }
  }, []);

  // Save state whenever it changes
  useEffect(() => {
    if (view !== 'student_login' && view !== 'teacher_login') {
      localStorage.setItem('cbt_v2_session', JSON.stringify({ 
        view, user, examState, isStudentReady, studentQuestions, activeTeacher 
      }));
    }
  }, [view, user, examState, isStudentReady, studentQuestions, activeTeacher]);

  // --- EFFECT: STUDENT LISTENING TO CLASS SESSION (WAITING ROOM LOGIC) ---
  useEffect(() => {
    if (!authUser || !user.class || (view !== 'student_waiting' && view !== 'student_exam')) return;
    
    const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', user.class);
    const unsub = onSnapshot(sessionRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setActiveSession(data);
        
        if (data.status === 'running' && view === 'student_waiting' && isStudentReady) {
          setStudentQuestions(data.questions || []);
          setExamState(prev => ({ ...prev, timeLeft: (data.duration || 60) * 60 }));
          setView('student_exam');
        }
        
        if (data.status === 'waiting' && view === 'student_exam') {
          handleForceReset();
        }
      }
    });
    return () => unsub();
  }, [authUser, user.class, view, isStudentReady]);

  // --- EFFECT: TEACHER LISTENING TO STUDENTS & FETCHING BANK SOAL ---
  useEffect(() => {
    if (view === 'teacher_dashboard' && authUser && activeTeacher) {
      const studentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'students');
      const unsubStudents = onSnapshot(studentsRef, (snapshot) => {
        const data = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => (b.score || 0) - (a.score || 0));
        setStudentsData(data);
      });

      const qRef = doc(db, 'artifacts', appId, 'public', 'data', 'questions_bank', activeTeacher.username);
      const unsubQuestions = onSnapshot(qRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().data) {
          setTeacherQuestions(docSnap.data().data);
        } else {
          setTeacherQuestions([]);
        }
      });

      return () => { unsubStudents(); unsubQuestions(); };
    }
  }, [view, authUser, activeTeacher]);

  // --- EFFECT: SYNC STUDENT PROGRESS TO FIREBASE ---
  const syncStudentToFirebase = (currentState, isTabActive = true, readyStatus = isStudentReady) => {
    if (!authUser || !user.name) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'students', authUser.uid);
    setDoc(docRef, {
      name: user.name, 
      class: user.class,
      isReady: readyStatus,
      progress: Object.keys(currentState.answers).length,
      violations: currentState.violations,
      isFinished: currentState.isFinished,
      score: currentState.score,
      lastActive: Date.now(), 
      isTabActive: isTabActive
    }, { merge: true });
  };

  useEffect(() => {
    if (view === 'student_exam' || view === 'student_waiting') {
      syncStudentToFirebase(examState, !document.hidden, isStudentReady);
    }
  }, [examState.answers, view, isStudentReady]);

  // --- EFFECT: EXAM TIMER ---
  useEffect(() => {
    if (view === 'student_exam' && examState.timeLeft > 0 && !examState.isFinished) {
      timerRef.current = setInterval(() => {
        setExamState(prev => {
          if (prev.timeLeft <= 1) {
            handleAutoFinish(prev);
            return { ...prev, timeLeft: 0 };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [view, examState.isFinished]);

  // --- EFFECT: ANTI-CHEATING (TAB SWITCH DETECTION) ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (view === 'student_exam' && !examState.isFinished && !modal.isOpen) {
        if (document.hidden) {
          setExamState(prev => {
            const newViolations = prev.violations + 1;
            syncStudentToFirebase({ ...prev, violations: newViolations }, false);
            return { ...prev, violations: newViolations };
          });
        } else {
          syncStudentToFirebase(examState, true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [view, examState, authUser, modal.isOpen]);


  // ==========================================
  // HANDLERS
  // ==========================================

  // --- SECRET LOGIN LOGIC (5 Clicks on Logo) ---
  const handleSecretLogin = () => {
    if (view === 'teacher_dashboard' || view === 'teacher_login') return;
    
    const newCount = (window.secretClick || 0) + 1;
    window.secretClick = newCount;
    
    if (newCount >= 5) {
      window.secretClick = 0; // Reset
      setView('teacher_login'); // Tampilkan form login guru
    }
  };

  // --- STUDENT HANDLERS ---
  const handleStudentLogin = (e) => {
    e.preventDefault();
    if (!user.name || !user.class) return;
    setView('student_waiting');
    syncStudentToFirebase(examState, true, false); 
  };

  const handleStudentReady = () => {
    setIsStudentReady(true);
    syncStudentToFirebase(examState, true, true);
  };

  const calculateScore = (answers, questionsArr) => {
    if (!questionsArr || questionsArr.length === 0) return 0;
    let correctCount = 0;
    questionsArr.forEach((q, i) => { if (answers[i] === q.correct) correctCount++; });
    return Math.round((correctCount / questionsArr.length) * 100);
  };

  const executeFinish = () => {
    const finalScore = calculateScore(examState.answers, studentQuestions);
    const newState = { ...examState, isFinished: true, score: finalScore };
    setExamState(newState);
    syncStudentToFirebase(newState, true);
    clearInterval(timerRef.current);
    setView('student_result');
  };

  const handleAutoFinish = (currentState) => {
    const finalScore = calculateScore(currentState.answers, studentQuestions);
    const newState = { ...currentState, isFinished: true, score: finalScore, timeLeft: 0 };
    setExamState(newState);
    syncStudentToFirebase(newState, true);
    clearInterval(timerRef.current);
    setView('student_result');
  };

  const handleForceReset = () => {
    localStorage.removeItem('cbt_v2_session');
    window.location.reload();
  };

  // --- TEACHER HANDLERS ---
  const handleTeacherLogin = (e) => {
    e.preventDefault();
    const foundTeacher = TEACHERS_DB.find(t => t.username === teacherLoginInput.username && t.password === teacherLoginInput.password);
    if (foundTeacher) {
      setActiveTeacher(foundTeacher);
      setView('teacher_dashboard');
    } else {
      setModal({ isOpen: true, type: 'alert', message: 'Username atau Password Guru salah!', inputValue: '' });
    }
  };

  const handleTeacherUploadQuestions = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        if (Array.isArray(json)) {
          const qRef = doc(db, 'artifacts', appId, 'public', 'data', 'questions_bank', activeTeacher.username);
          await setDoc(qRef, { data: json, updatedAt: Date.now(), subject: activeTeacher.subject });
          setModal({ isOpen: true, type: 'alert', message: `Berhasil! Soal telah diunggah ke Bank Soal ${activeTeacher.subject}.`, inputValue: '' });
        } else {
          setModal({ isOpen: true, type: 'alert', message: 'Format JSON tidak valid. Harus berupa Array.', inputValue: '' });
        }
      } catch (err) {
        setModal({ isOpen: true, type: 'alert', message: 'Gagal membaca file JSON. Pastikan formatnya benar.', inputValue: '' });
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const handleStartExamByTeacher = async () => {
    if (teacherQuestions.length === 0) {
      setModal({ isOpen: true, type: 'alert', message: 'Anda belum memiliki soal. Silakan upload soal terlebih dahulu di tab Bank Soal.', inputValue: '' });
      return;
    }

    const studentsInClass = studentsData.filter(s => s.class === adminSelectedClass);
    const readyStudents = studentsInClass.filter(s => s.isReady && !s.isFinished);
    
    if (readyStudents.length === 0) {
      setModal({ isOpen: true, type: 'alert', message: `Belum ada siswa yang menekan tombol SIAP di Kelas ${adminSelectedClass}. Tunggu hingga ada yang siap.`, inputValue: '' });
      return;
    }

    setModal({
      isOpen: true, type: 'confirmStart',
      message: `Mulai ujian ${activeTeacher.subject} untuk Kelas ${adminSelectedClass} sekarang? Seluruh layar siswa yang 'Siap' akan langsung beralih ke halaman soal.`,
      inputValue: ''
    });
  };

  const executeStartExam = async () => {
    try {
      const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', adminSelectedClass);
      await setDoc(sessionRef, {
        status: 'running',
        teacherName: activeTeacher.name,
        subject: activeTeacher.subject,
        questions: teacherQuestions,
        duration: 60, // 60 menit default
        startedAt: Date.now()
      });
      setModal({ isOpen: true, type: 'alert', message: `Ujian Kelas ${adminSelectedClass} Berhasil Dimulai!`, inputValue: '' });
    } catch (e) {
      console.error(e);
      setModal({ isOpen: true, type: 'alert', message: 'Gagal memulai ujian. Coba lagi.', inputValue: '' });
    }
  };

  const handleStopOrResetClass = async () => {
    setModal({
      isOpen: true, type: 'confirmStop',
      message: `Ketik "STOP" untuk membatalkan/menghentikan ujian berjalan di Kelas ${adminSelectedClass}. Layar siswa akan diretas kembali ke awal.`,
      inputValue: ''
    });
  };

  const executeStopExam = async () => {
    try {
      const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', adminSelectedClass);
      await setDoc(sessionRef, { status: 'waiting' }, { merge: true });
      setModal({ isOpen: true, type: 'alert', message: `Sesi Ujian Kelas ${adminSelectedClass} dihentikan.`, inputValue: '' });
    } catch (e) { console.error(e); }
  };

  // --- MODAL SUBMIT HANDLER ---
  const closeModal = () => setModal({ isOpen: false, type: '', message: '', inputValue: '' });

  const handleModalSubmit = async () => {
    const { type, inputValue } = modal;
    if (type === 'confirmFinish') {
      closeModal(); executeFinish();
    } else if (type === 'confirmStart') {
      closeModal(); executeStartExam();
    } else if (type === 'confirmStop') {
      if (inputValue === 'STOP') {
        closeModal(); executeStopExam();
      } else {
        setModal({ isOpen: true, type: 'alert', message: 'Kata kunci salah. Batal dihentikan.', inputValue: '' });
      }
    } else if (type === 'alert') {
      closeModal();
    }
  };

  // --- HELPERS ---
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60); const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStudentRank = () => {
    if (!authUser || !examState.isFinished) return "-";
    const studentsInMyClass = studentsData.filter(s => s.class === user.class);
    const sorted = [...studentsInMyClass].sort((a, b) => b.score - a.score);
    const index = sorted.findIndex(s => s.id === authUser.uid);
    return index !== -1 ? index + 1 : "-";
  };


  // ==========================================
  // RENDER VIEWS
  // ==========================================
  return (
    <div className={`min-h-screen transition-colors duration-500 font-sans relative overflow-hidden ${isDarkMode ? 'bg-slate-900' : 'bg-emerald-50'}`}>
      
      {/* Background Decorators */}
      <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-emerald-500/20 blur-[100px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[30vw] h-[30vw] rounded-full bg-amber-500/20 blur-[100px] pointer-events-none z-0"></div>

      {/* CUSTOM MODAL UI */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <Card isDarkMode={isDarkMode} className="w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className={`font-black text-lg ${modal.type === 'alert' && modal.message.includes('salah') ? 'text-red-500' : 'text-emerald-500'}`}>
                {modal.type === 'alert' ? 'Pemberitahuan' : 'Konfirmasi'}
              </h3>
              <button onClick={closeModal} className={`p-1 rounded-full hover:bg-slate-500/20 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}><X size={20} /></button>
            </div>
            <p className={`mb-6 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{modal.message}</p>
            {modal.type === 'confirmStop' && (
              <input autoFocus placeholder="Ketik STOP" className={`w-full p-4 rounded-xl border-2 mb-6 outline-none transition-all ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus:border-emerald-500 text-white' : 'bg-white/50 border-white focus:border-emerald-500 text-slate-800'}`} value={modal.inputValue} onChange={e => setModal({...modal, inputValue: e.target.value})} onKeyDown={e => { if (e.key === 'Enter') handleModalSubmit(); }} />
            )}
            <div className="flex justify-end gap-3">
              {modal.type !== 'alert' && (
                <button onClick={closeModal} className={`px-5 py-2.5 rounded-xl font-bold transition-all ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-600'}`}>Batal</button>
              )}
              <button onClick={handleModalSubmit} className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg shadow-emerald-500/30">
                {modal.type === 'alert' ? 'Mengerti' : 'Ya, Lanjutkan'}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* NAVBAR */}
      <nav className={`relative z-50 p-4 flex justify-between items-center backdrop-blur-md border-b print:hidden ${isDarkMode ? 'border-slate-800 bg-slate-900/50' : 'border-emerald-200/50 bg-white/30'}`}>
        {/* LOGO - HIDDEN TRIGGER FOR TEACHER LOGIN (5 CLICKS) */}
        <div className="flex items-center gap-3 select-none cursor-pointer group" onClick={handleSecretLogin}>
          <div className={`p-2.5 rounded-xl shadow-lg group-active:scale-95 transition-transform ${isDarkMode ? 'bg-emerald-600 shadow-emerald-900/50' : 'bg-emerald-600 shadow-emerald-500/30'}`}>
            <BookOpen size={22} className="text-white" />
          </div>
          <div>
            <h1 className={`font-black text-xl tracking-tight leading-none ${isDarkMode ? 'text-white' : 'text-emerald-950'}`}>CBT <span className="text-emerald-500">PRO</span></h1>
            <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold">Smart Exam System</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {view === 'student_exam' && (
            <div className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-full font-bold font-mono text-lg border ${examState.timeLeft < 300 ? 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse' : isDarkMode ? 'bg-slate-800 border-slate-700 text-emerald-400' : 'bg-white border-emerald-100 text-emerald-600'}`}>
              <Clock size={20} />{formatTime(examState.timeLeft)}
            </div>
          )}
          <button type="button" onClick={() => setIsDarkMode(!isDarkMode)} className={`p-2.5 rounded-full transition-all hover:scale-110 active:scale-95 ${isDarkMode ? 'bg-slate-800 text-amber-400 hover:bg-slate-700' : 'bg-white text-slate-600 hover:bg-emerald-100 shadow-sm'}`}>
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </nav>

      {/* MAIN CONTENT AREA */}
      <div className="relative z-10">
        
        {/* ========================================================= */}
        {/* VIEW 1: STUDENT LOGIN (DEFAULT) */}
        {/* ========================================================= */}
        {view === 'student_login' && (
          <main className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] p-6">
            <Card isDarkMode={isDarkMode} className="w-full max-w-md p-8 sm:p-10 animate-in zoom-in-95 duration-300">
              <div className="text-center mb-8">
                <div className="inline-flex justify-center items-center w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 mb-4"><User size={32} /></div>
                <h2 className={`text-2xl font-black mb-2 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Login Peserta</h2>
              </div>
              <form onSubmit={handleStudentLogin} className="space-y-5">
                <div>
                  <label className={`block text-xs font-bold mb-2 uppercase tracking-wider opacity-70 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Nama Lengkap</label>
                  <input required type="text" value={user.name} onChange={(e) => setUser({...user, name: e.target.value})} className={`w-full p-4 rounded-2xl outline-none transition-all border-2 ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus:border-emerald-500 text-white' : 'bg-white/50 border-white focus:border-emerald-500 text-slate-800'}`} placeholder="Contoh: Ahmad Fulan" />
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-2 uppercase tracking-wider opacity-70 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Kelas / Rombel</label>
                  <select required value={user.class} onChange={(e) => setUser({...user, class: e.target.value})} className={`w-full p-4 rounded-2xl outline-none transition-all border-2 appearance-none ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus:border-emerald-500 text-white' : 'bg-white/50 border-white focus:border-emerald-500 text-slate-800'}`}>
                    <option value="" disabled>Pilih Kelas</option>
                    <option value="7A">Kelas 7A</option><option value="7B">Kelas 7B</option>
                    <option value="8A">Kelas 8A</option><option value="8B">Kelas 8B</option>
                  </select>
                </div>
                <button type="submit" className="w-full mt-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-lg p-4 rounded-2xl shadow-xl transition-all active:scale-95 flex justify-center items-center gap-2">
                  Masuk Ruang Tunggu <ChevronRight />
                </button>
              </form>
            </Card>
          </main>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: TEACHER LOGIN (HIDDEN, TRIGGERED BY 5 CLICKS) */}
        {/* ========================================================= */}
        {view === 'teacher_login' && (
          <main className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] p-6">
            <button onClick={() => setView('student_login')} className={`self-start md:self-auto md:absolute md:top-24 md:left-8 mb-4 flex items-center gap-2 text-sm font-bold opacity-60 hover:opacity-100 transition-opacity ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
              <ChevronLeft size={16}/> Kembali ke Login Peserta
            </button>
            <Card isDarkMode={isDarkMode} className="w-full max-w-md p-8 sm:p-10 animate-in zoom-in-95 duration-300">
              <div className="text-center mb-8">
                <div className="inline-flex justify-center items-center w-16 h-16 rounded-full bg-blue-500/10 text-blue-500 mb-4"><KeySquare size={32} /></div>
                <h2 className={`text-2xl font-black mb-2 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Login Pengawas</h2>
                <p className="text-xs opacity-60 mt-2">(Hint: guru_pai/123, guru_mtk/123)</p>
              </div>
              <form onSubmit={handleTeacherLogin} className="space-y-5">
                <div>
                  <label className={`block text-xs font-bold mb-2 uppercase tracking-wider opacity-70 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Username</label>
                  <input required type="text" value={teacherLoginInput.username} onChange={(e) => setTeacherLoginInput({...teacherLoginInput, username: e.target.value})} className={`w-full p-4 rounded-2xl outline-none transition-all border-2 ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus:border-blue-500 text-white' : 'bg-white/50 border-white focus:border-blue-500 text-slate-800'}`} placeholder="Masukkan Username" />
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-2 uppercase tracking-wider opacity-70 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Password</label>
                  <input required type="password" value={teacherLoginInput.password} onChange={(e) => setTeacherLoginInput({...teacherLoginInput, password: e.target.value})} className={`w-full p-4 rounded-2xl outline-none transition-all border-2 ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus:border-blue-500 text-white' : 'bg-white/50 border-white focus:border-blue-500 text-slate-800'}`} placeholder="••••••••" />
                </div>
                <button type="submit" className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg p-4 rounded-2xl shadow-xl transition-all active:scale-95 flex justify-center items-center gap-2">
                  Akses Dashboard <ChevronRight />
                </button>
              </form>
            </Card>
          </main>
        )}

        {/* ========================================================= */}
        {/* VIEW 3: WAITING ROOM (STUDENT) */}
        {/* ========================================================= */}
        {view === 'student_waiting' && (
          <main className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] p-6 text-center animate-in fade-in duration-500">
            <Card isDarkMode={isDarkMode} className="w-full max-w-lg p-10 flex flex-col items-center">
              
              {!isStudentReady ? (
                <>
                  <div className="w-24 h-24 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6"><AlertCircle size={48} /></div>
                  <h2 className={`text-2xl font-black mb-2 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Persiapan Ujian</h2>
                  <p className={`mb-8 opacity-70 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    Halo <strong>{user.name}</strong> (Kelas {user.class}). Sebelum ujian dimulai, pastikan koneksi internet Anda stabil. Tekan tombol di bawah jika Anda sudah siap.
                  </p>
                  <button onClick={handleStudentReady} className="w-full py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xl shadow-lg shadow-emerald-500/30 transition-transform active:scale-95">
                    SAYA SIAP!
                  </button>
                </>
              ) : (
                <>
                  <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
                    <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
                    <div className="absolute inset-2 bg-emerald-500/30 rounded-full animate-pulse"></div>
                    <div className="relative z-10 w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg"><Clock size={40} /></div>
                  </div>
                  <h2 className={`text-2xl font-black mb-2 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Menunggu Pengawas...</h2>
                  <p className={`opacity-70 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    Status Anda sudah <strong className="text-emerald-500">SIAP</strong>. <br/>
                    Ujian akan otomatis dimulai di layar ini ketika guru pengawas menekan tombol mulai untuk Kelas {user.class}.
                  </p>
                </>
              )}

            </Card>
          </main>
        )}

        {/* ========================================================= */}
        {/* VIEW 4: EXAM (STUDENT) */}
        {/* ========================================================= */}
        {view === 'student_exam' && (
          <main className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-500">
            <div className="lg:col-span-3 space-y-6 flex flex-col">
              <Card isDarkMode={isDarkMode} className="p-6 sm:p-8 lg:p-10 flex-grow flex flex-col">
                <div className="flex justify-between items-center mb-8 pb-6 border-b border-emerald-500/10">
                  <div className="flex items-center gap-3">
                    <span className="bg-emerald-500 text-white px-4 py-1.5 rounded-full text-sm font-bold">Soal No. {examState.currentIdx + 1}</span>
                    <span className={`text-sm font-medium opacity-60 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>dari {studentQuestions.length} Soal</span>
                  </div>
                  <div className={`md:hidden flex items-center gap-2 px-3 py-1.5 rounded-full font-bold font-mono text-sm border ${examState.timeLeft < 300 ? 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse' : isDarkMode ? 'bg-slate-800 border-slate-700 text-emerald-400' : 'bg-white border-emerald-100 text-emerald-600'}`}>
                    <Clock size={16} />{formatTime(examState.timeLeft)}
                  </div>
                </div>
                <h3 className={`text-xl sm:text-2xl font-medium leading-relaxed mb-10 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{studentQuestions[examState.currentIdx]?.q}</h3>
                <div className="grid gap-4 mt-auto">
                  {studentQuestions[examState.currentIdx]?.a.map((ans, i) => {
                    const isSelected = examState.answers[examState.currentIdx] === i;
                    return (
                      <button key={i} type="button" onClick={() => setExamState({...examState, answers: {...examState.answers, [examState.currentIdx]: i}})} className={`group flex items-center gap-4 p-4 sm:p-5 rounded-2xl border-2 transition-all text-left ${isSelected ? 'border-emerald-500 bg-emerald-500/10' : isDarkMode ? 'border-slate-700 bg-slate-800/50 hover:border-emerald-500/50' : 'border-white bg-white/50 hover:border-emerald-300'}`}>
                        <span className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl font-bold text-lg ${isSelected ? 'bg-emerald-500 text-white' : isDarkMode ? 'bg-slate-700 text-slate-300 group-hover:bg-slate-600' : 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200'}`}>{String.fromCharCode(65 + i)}</span>
                        <span className={`text-base sm:text-lg ${isSelected ? 'font-medium' : ''} ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{ans}</span>
                      </button>
                    );
                  })}
                </div>
              </Card>
              <div className="flex justify-between items-center gap-4">
                <button type="button" disabled={examState.currentIdx === 0} onClick={() => setExamState({...examState, currentIdx: examState.currentIdx - 1})} className={`flex-1 sm:flex-none flex justify-center items-center gap-2 px-6 py-4 rounded-2xl font-bold transition-all ${examState.currentIdx === 0 ? 'opacity-40 cursor-not-allowed bg-slate-500/20' : isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>
                  <ChevronLeft size={20} /> <span className="hidden sm:inline">Sebelumnya</span>
                </button>
                {examState.currentIdx === studentQuestions.length - 1 ? (
                  <button type="button" onClick={() => setModal({ isOpen: true, type: 'confirmFinish', message: 'Kumpulkan jawaban sekarang? Jawaban tidak bisa diubah lagi.', inputValue: '' })} className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-8 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black transition-all">
                    Selesai & Kumpul <Send size={20} />
                  </button>
                ) : (
                  <button type="button" onClick={() => setExamState({...examState, currentIdx: examState.currentIdx + 1})} className={`flex-1 sm:flex-none flex justify-center items-center gap-2 px-6 py-4 rounded-2xl font-bold transition-all ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>
                    <span className="hidden sm:inline">Berikutnya</span> <ChevronRight size={20} />
                  </button>
                )}
              </div>
            </div>

            <div className="lg:col-span-1">
              <Card isDarkMode={isDarkMode} className="p-6 sticky top-24">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-emerald-500/10"><LayoutGrid size={20} className="text-emerald-500"/><h4 className="font-bold text-lg">Navigasi Soal</h4></div>
                <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-4 gap-2 mb-8">
                  {studentQuestions.map((_, i) => {
                    const isAnswered = examState.answers[i] !== undefined; const isActive = examState.currentIdx === i;
                    return (
                      <button key={i} type="button" onClick={() => setExamState({...examState, currentIdx: i})} className={`aspect-square rounded-xl flex items-center justify-center font-bold text-sm transition-all relative ${isActive ? 'ring-4 ring-emerald-500/50 scale-110 z-10' : ''} ${isAnswered ? 'bg-emerald-500 text-white' : isDarkMode ? 'bg-slate-800 text-slate-400 border border-slate-700' : 'bg-white text-slate-500 border border-emerald-100'}`}>
                        {i + 1}{isAnswered && !isActive && (<div className={`absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 ${isDarkMode ? 'border-slate-800' : 'border-white'}`}></div>)}
                      </button>
                    )
                  })}
                </div>
              </Card>
            </div>
          </main>
        )}

        {/* ========================================================= */}
        {/* VIEW 5: RESULT (STUDENT) */}
        {/* ========================================================= */}
        {view === 'student_result' && (
          <main className="flex items-center justify-center min-h-[calc(100vh-80px)] p-6 animate-in zoom-in-95 duration-700">
            <Card isDarkMode={isDarkMode} className="w-full max-w-lg p-10 text-center relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 via-gold-400 to-emerald-400"></div>
               <div className="w-24 h-24 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 size={50} strokeWidth={2.5} /></div>
               <h2 className={`text-3xl font-black mb-2 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Ujian Selesai!</h2>
               <p className={`mb-8 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Alhamdulillah, ujian <strong>{activeSession?.subject || 'CBT'}</strong> telah berhasil diselesaikan oleh <strong className={isDarkMode ? 'text-white' : 'text-slate-800'}>{user.name}</strong>.</p>
               
               <div className="grid grid-cols-2 gap-4 mb-10">
                 <div className={`p-6 rounded-3xl border ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white/50 border-emerald-100'}`}>
                   <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Nilai Akhir</p>
                   <p className="text-5xl font-black text-emerald-500">{examState.score}</p>
                 </div>
                 <div className={`p-6 rounded-3xl border ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white/50 border-emerald-100'}`}>
                   <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Peringkat Kelas</p>
                   <p className="text-5xl font-black text-amber-500">#{getStudentRank()}</p>
                 </div>
               </div>
               <button type="button" onClick={handleForceReset} className="w-full bg-slate-800 hover:bg-slate-700 text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2"><LogOut size={18}/> Keluar / Kembali ke Awal</button>
            </Card>
          </main>
        )}

        {/* ========================================================= */}
        {/* VIEW 6: TEACHER DASHBOARD */}
        {/* ========================================================= */}
        {view === 'teacher_dashboard' && activeTeacher && (
          <main className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in slide-in-from-bottom-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 print:hidden border-b pb-6 mb-8 border-emerald-500/20">
               <div>
                 <h2 className={`text-3xl font-black flex items-center gap-3 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                   <ShieldAlert className="text-blue-500" size={32} />
                   Console <span className="text-blue-500">Guru</span>
                 </h2>
                 <p className={`text-sm mt-2 font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                   Selamat Datang, <strong>{activeTeacher.name}</strong> <br/>
                   <span className="opacity-70">Pengampu Mata Pelajaran: {activeTeacher.subject}</span>
                 </p>
               </div>
               
               <div className="flex gap-2">
                 <label className="cursor-pointer flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg">
                   <Upload size={16}/> Upload Bank Soal (.json)
                   <input type="file" accept=".json" className="hidden" onChange={handleTeacherUploadQuestions} />
                 </label>
                 <button type="button" onClick={handleForceReset} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all"><LogOut size={16}/> Logout</button>
               </div>
            </div>

            <Card isDarkMode={isDarkMode} className="p-6 mb-8 border-l-4 border-l-blue-500 print:hidden">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="w-full md:w-1/3">
                  <label className="block text-xs font-bold mb-2 uppercase tracking-wider opacity-70">Pilih Kelas Ujian</label>
                  <select value={adminSelectedClass} onChange={(e) => setAdminSelectedClass(e.target.value)} className={`w-full p-4 rounded-xl outline-none border-2 font-bold text-lg ${isDarkMode ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-white/50 border-slate-200 text-slate-800'}`}>
                    <option value="7A">Kelas 7A</option><option value="7B">Kelas 7B</option>
                    <option value="8A">Kelas 8A</option><option value="8B">Kelas 8B</option>
                  </select>
                </div>
                
                <div className="flex-1 text-center">
                  <p className="text-xs font-bold mb-1 uppercase tracking-wider opacity-70">Status Soal Anda</p>
                  {teacherQuestions.length > 0 ? (
                    <span className="inline-block px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-600 font-bold border border-emerald-500/30">
                      Tersedia {teacherQuestions.length} Soal
                    </span>
                  ) : (
                    <span className="inline-block px-4 py-2 rounded-lg bg-red-500/20 text-red-600 font-bold border border-red-500/30">
                      Bank Soal Kosong
                    </span>
                  )}
                </div>

                <div className="w-full md:w-1/3 flex justify-end">
                  <button type="button" onClick={handleStartExamByTeacher} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-4 rounded-xl text-lg font-black transition-all shadow-lg shadow-emerald-600/30 animate-pulse hover:animate-none">
                    <PlayCircle size={24}/> MULAI UJIAN KELAS INI
                  </button>
                </div>
              </div>
            </Card>

            <div className="flex justify-between items-end mb-4 print:hidden">
              <h3 className={`font-bold text-xl ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Live Monitoring: Kelas {adminSelectedClass}</h3>
              <button onClick={handleStopOrResetClass} className="text-xs text-red-500 hover:underline font-bold">Batalkan / Hentikan Ujian Kelas Ini</button>
            </div>

            <Card isDarkMode={isDarkMode} className="overflow-x-auto print:shadow-none print:border-none print:bg-transparent">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className={`text-xs uppercase tracking-wider ${isDarkMode ? 'bg-slate-800/80 text-slate-400' : 'bg-blue-100/50 text-blue-800'} print:bg-gray-200 print:text-black`}>
                  <tr><th className="p-5 font-bold border-b">No</th><th className="p-5 font-bold border-b">Nama Siswa</th><th className="p-5 font-bold border-b">Status Kesiapan</th><th className="p-5 font-bold border-b">Progress Ujian</th><th className="p-5 font-bold text-center border-b">Pelanggaran</th><th className="p-5 font-bold text-right border-b">Nilai Live</th></tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-slate-700/50' : 'divide-slate-100'}`}>
                  {studentsData.filter(s => s.class === adminSelectedClass).length === 0 ? (
                    <tr><td colSpan="6" className="p-8 text-center opacity-50 italic">Belum ada siswa dari Kelas {adminSelectedClass} yang masuk ke sistem.</td></tr>
                  ) : (
                    studentsData.filter(s => s.class === adminSelectedClass).map((student, idx) => {
                      const timeSinceLastActive = Date.now() - (student.lastActive || 0);
                      const isOffline = timeSinceLastActive > 15000 && !student.isFinished; 
                      const isDanger = student.violations > 0 || (!student.isTabActive && !student.isFinished);
                      const progressPercent = Math.round((student.progress / (teacherQuestions.length || 1)) * 100);

                      return (
                        <tr key={student.id} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-white/50'}`}>
                          <td className="p-5 font-bold opacity-50">{idx + 1}</td>
                          <td className="p-5">
                            <p className="font-bold text-base">{student.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {student.isFinished ? (<span className="text-[10px] uppercase font-bold text-emerald-500">Selesai</span>) : isOffline ? (<><span className="w-2 h-2 rounded-full bg-slate-500"></span><span className="text-[10px] uppercase font-bold text-slate-500">Offline</span></>) : isDanger ? (<><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span><span className="text-[10px] uppercase font-bold text-red-500">Meninggalkan Tab</span></>) : (<><span className="w-2 h-2 rounded-full bg-emerald-500"></span><span className="text-[10px] uppercase font-bold text-emerald-500">Online</span></>)}
                            </div>
                          </td>
                          <td className="p-5">
                            {student.isFinished ? (
                               <span className="flex items-center gap-2 text-xs font-bold text-emerald-500"><CheckCircle2 size={16}/> Selesai</span>
                            ) : student.isReady ? (
                               <span className="flex items-center gap-2 text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-lg w-fit"><UserCheck size={16}/> SIAP UJIAN</span>
                            ) : (
                               <span className="flex items-center gap-2 text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-lg w-fit"><UserX size={16}/> BELUM SIAP</span>
                            )}
                          </td>
                          <td className="p-5">
                            {!student.isFinished && student.isReady && (
                              <div className="flex items-center gap-3">
                                <div className={`w-full max-w-[150px] h-2.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                                  <div className="h-full rounded-full bg-blue-500 transition-all duration-1000" style={{width: `${progressPercent}%`}}></div>
                                </div>
                                <span className="text-xs font-bold w-8">{progressPercent}%</span>
                              </div>
                            )}
                          </td>
                          <td className="p-5 text-center">{student.violations > 0 ? (<span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 text-red-600 font-black border border-red-500/30">{student.violations}</span>) : (<span className="opacity-30">-</span>)}</td>
                          <td className="p-5 text-right">{student.isFinished ? (<span className="text-2xl font-black text-emerald-500">{student.score}</span>) : (<span className="text-sm opacity-50 italic">-</span>)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </Card>
          </main>
        )}

      </div>
    </div>
  );
};
export default App;


