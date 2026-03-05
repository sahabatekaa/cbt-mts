import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, Users, BookOpen, PlusCircle, LogOut, ArrowRight, ArrowLeft, Play, LayoutDashboard, Printer, AlertTriangle } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

// --- KONFIGURASI DATABASE FIREBASE ---
// ⚠️ UNTUK GURU: Jika web sudah di Vercel, isi variabel di bawah ini dengan config dari akun Firebase Anda.
const myFirebaseConfig = {
    apiKey: "AIzaSyAfR-SMXxIVf50uCqlrIyer5nJkHxtsna8",
    authDomain: "cbt-mts.firebaseapp.com",
    projectId: "cbt-mts",
    storageBucket: "cbt-mts.firebasestorage.app",
    messagingSenderId: "485346087484",
    appId: "1:485346087484:web:a3cdb682cd4489f8e2e939",
    measurementId: "G-3Q9ZH01D52"
  };

// Deteksi otomatis apakah sedang di Canvas preview atau di Vercel
const isCanvas = typeof __firebase_config !== 'undefined';
let app, auth, db, appId;

if (isCanvas) {
  app = initializeApp(JSON.parse(__firebase_config));
  auth = getAuth(app);
  db = getFirestore(app);
  appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
} else if (myFirebaseConfig.apiKey) {
  app = initializeApp(myFirebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  appId = "cbt-mts-app-public"; 
}

const isDbReady = !!db;

// --- DATA AWAL SOAL ---
const INITIAL_QUESTIONS = [
  { id: 1, text: "Kata yang bermakna 'Yang' untuk laki-laki tunggal (Isim Mausul) adalah...", options: ["Alladzi (الَّذِي)", "Allati (الَّتِي)", "Anta (أَنْتَ)", "Huwa (هُوَ)"], answer: 0 },
  { id: 2, text: "Kata yang bermakna 'Yang' untuk perempuan tunggal (Isim Mausul) adalah...", options: ["Alladzi (الَّذِي)", "Allati (الَّتِي)", "Hiya (هِيَ)", "Nahnu (نَحْنُ)"], answer: 1 },
  { id: 3, text: "'Bacalah!' dalam bahasa Arab (Fi'il Amar) adalah...", options: ["Iqra' (اِقْرَأْ)", "Uktub (اُكْتُبْ)", "Ijlis (اِجْلِسْ)", "Idzhab (اِذْهَبْ)"], answer: 0 },
  { id: 4, text: "'Tulislah!' dalam bahasa Arab (Fi'il Amar) adalah...", options: ["Iqra' (اِقْرَأْ)", "Uktub (اُكْتُبْ)", "Kul (كُلْ)", "Isma' (اِسْمَعْ)"], answer: 1 },
  { id: 5, text: "Manakah di bawah ini yang termasuk kata perintah (Fi'il Amar)?", options: ["Duduklah!", "Dia duduk", "Sedang duduk", "Tempat duduk"], answer: 0 },
  { id: 6, text: "Isim Mausul biasanya digunakan untuk...", options: ["Menyambungkan dua kalimat", "Menanyakan sesuatu", "Menunjuk benda", "Melarang seseorang"], answer: 0 },
  { id: 7, text: "'Masuklah!' bahasa Arabnya adalah...", options: ["Ukhruj (اُخْرُجْ)", "Udkhul (اُدْخُلْ)", "Iftah (اِفْتَحْ)", "Ighliq (اِغْلِقْ)"], answer: 1 },
  { id: 8, text: "'Keluarlah!' bahasa Arabnya adalah...", options: ["Udkhul (اُدْخُلْ)", "Ukhruj (اُخْرُجْ)", "Qum (قُمْ)", "Nam (نَمْ)"], answer: 1 },
  { id: 9, text: "Kata 'Alladziina (الَّذِينَ)' adalah Isim Mausul yang digunakan untuk...", options: ["Laki-laki tunggal", "Perempuan tunggal", "Laki-laki banyak/jamak", "Perempuan banyak"], answer: 2 },
  { id: 10, text: "'Dengarkanlah!' bahasa Arabnya adalah...", options: ["Unzhur (اُنْظُرْ)", "Isma' (اِسْمَعْ)", "Iqra' (اِقْرَأْ)", "Ijlis (اِجْلِسْ)"], answer: 1 },
  { id: 11, text: "Kata perintah (Fi'il Amar) biasanya digunakan saat kita ingin...", options: ["Menyuruh seseorang melakukan sesuatu", "Bercerita masa lalu", "Menyebutkan nama benda", "Bertanya kabar"], answer: 0 },
  { id: 12, text: "'Bukalah!' bahasa Arabnya adalah...", options: ["Iftah (اِفْتَحْ)", "Ighliq (اِغْلِقْ)", "Idzhab (اِذْهَبْ)", "Irji' (اِرْجِعْ)"], answer: 0 },
  { id: 13, text: "'Tutuplah!' bahasa Arabnya adalah...", options: ["Iftah (اِفْتَحْ)", "Ighliq (اِغْلِقْ)", "Uktub (اُكْتُبْ)", "Imsah (اِمْسَحْ)"], answer: 1 },
  { id: 14, text: "Jika guru menyuruh murid laki-laki untuk berdiri, ia akan berkata...", options: ["Ijlis (اِجْلِسْ)", "Qum (قُمْ)", "Nam (نَمْ)", "Kul (كُلْ)"], answer: 1 },
  { id: 15, text: "Kata 'Allaati (اللَّاتِي)' adalah isim mausul untuk...", options: ["Perempuan banyak/jamak", "Laki-laki banyak", "Satu laki-laki", "Satu perempuan"], answer: 0 },
  { id: 16, text: "'Alladzaani (اللَّذَانِ)' adalah isim mausul untuk...", options: ["Satu laki-laki", "Dua laki-laki", "Satu perempuan", "Dua perempuan"], answer: 1 },
  { id: 17, text: "Ciri utama dari Fi'il Amar (kata perintah) adalah harakat akhirnya biasanya...", options: ["Fathah (a)", "Kasrah (i)", "Dhammah (u)", "Sukun (mati)"], answer: 3 },
  { id: 18, text: "'Ambillah!' bahasa Arabnya adalah...", options: ["Khudz (خُذْ)", "Da' (دَعْ)", "Hat (هَاتِ)", "Ta'al (تَعَالَ)"], answer: 0 },
  { id: 19, text: "'Makanlah!' bahasa Arabnya adalah...", options: ["Isyrab (اِشْرَبْ)", "Kul (كُلْ)", "Nam (نَمْ)", "Qum (قُمْ)"], answer: 1 },
  { id: 20, text: "Kalimat: 'Ini adalah siswa (laki-laki) ___ rajin.' Kata hubung yang tepat adalah...", options: ["Alladzi (الَّذِي)", "Allati (الَّتِي)", "Alladzina (الَّذِينَ)", "Allaati (اللَّاتِي)"], answer: 0 }
];

export default function App() {
  // --- FITUR ANTI REFRESH (Membaca data dari memori browser saat dimuat) ---
  const [view, setView] = useState(() => localStorage.getItem('cbt_view') || 'home'); 
  const [currentStudent, setCurrentStudent] = useState(() => JSON.parse(localStorage.getItem('cbt_student')) || { id: null, name: '' });
  const [answers, setAnswers] = useState(() => JSON.parse(localStorage.getItem('cbt_answers')) || {});
  const [timeLeft, setTimeLeft] = useState(() => parseInt(localStorage.getItem('cbt_timeLeft')) || 3600);
  const [currentIndex, setCurrentIndex] = useState(() => parseInt(localStorage.getItem('cbt_currentIndex')) || 0);
  
  const [questions, setQuestions] = useState(INITIAL_QUESTIONS);
  const [results, setResults] = useState([]);
  const [activeStudents, setActiveStudents] = useState([]);
  const [user, setUser] = useState(null);

  // --- FITUR ANTI REFRESH (Menyimpan setiap ada perubahan ke memori browser) ---
  useEffect(() => {
    localStorage.setItem('cbt_view', view);
    localStorage.setItem('cbt_student', JSON.stringify(currentStudent));
    localStorage.setItem('cbt_answers', JSON.stringify(answers));
    localStorage.setItem('cbt_timeLeft', timeLeft.toString());
    localStorage.setItem('cbt_currentIndex', currentIndex.toString());
  }, [view, currentStudent, answers, timeLeft, currentIndex]);

  // Fungsi untuk membersihkan memori (Saat logout atau selesai ujian)
  const clearSession = () => {
    localStorage.removeItem('cbt_view');
    localStorage.removeItem('cbt_student');
    localStorage.removeItem('cbt_answers');
    localStorage.removeItem('cbt_timeLeft');
    localStorage.removeItem('cbt_currentIndex');
    
    setCurrentStudent({ id: null, name: '' });
    setAnswers({});
    setTimeLeft(3600);
    setCurrentIndex(0);
    setView('home');
  };

  // 1. Inisialisasi Auth Firebase
  useEffect(() => {
    if (!isDbReady) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch(e) { console.error("Auth Error", e); }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Tarik Data Realtime (Khusus Guru & Siswa terhubung)
  useEffect(() => {
    if (!isDbReady || !user) return;

    const activeRef = collection(db, 'artifacts', appId, 'public', 'data', 'active_students');
    const unsubActive = onSnapshot(activeRef, (snapshot) => {
      const students = snapshot.docs.map(doc => doc.data());
      setActiveStudents(students);
    }, (error) => console.error(error));

    const resultsRef = collection(db, 'artifacts', appId, 'public', 'data', 'quiz_results');
    const unsubResults = onSnapshot(resultsRef, (snapshot) => {
      const res = snapshot.docs.map(doc => doc.data());
      setResults(res);
    }, (error) => console.error(error));

    return () => {
      unsubActive();
      unsubResults();
    };
  }, [user]);

  // --- KOMPONEN: LAYAR UTAMA ---
  const HomeView = () => {
    const [secretClicks, setSecretClicks] = useState(0);
    const handleSecretClick = () => {
      const newCount = secretClicks + 1;
      setSecretClicks(newCount);
      if (newCount >= 5) {
        setView('teacher-login');
        setSecretClicks(0); 
      }
    };

    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center relative">
          <div 
            onClick={handleSecretClick}
            className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 cursor-pointer transition-transform active:scale-95"
            title="Klik 5x untuk akses Admin"
          >
            <BookOpen className="text-green-600 w-10 h-10 select-none" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Portal Ujian CBT</h1>
          <p className="text-gray-600 mb-8">Madrasah Tsanawiyah - Kelas 9</p>
          <div className="space-y-4">
            <button 
              onClick={() => setView('student-login')}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              <Users className="w-5 h-5" /> Masuk Sebagai Siswa
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --- KOMPONEN: LOGIN SISWA ---
  const StudentLoginView = () => {
    const [name, setName] = useState('');

    const handleLogin = async (e) => {
      e.preventDefault();
      if(name) {
        const studentId = Date.now().toString(); 
        const studentData = { id: studentId, name, status: 'Menunggu', startTime: new Date().toLocaleTimeString() };
        setCurrentStudent({ id: studentId, name });

        if (isDbReady && user) {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'active_students', studentId), studentData);
        } else {
          setActiveStudents([...activeStudents, studentData]);
        }
        setView('student-dashboard');
      }
    };

    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
          <button onClick={() => setView('home')} className="text-gray-500 mb-4 flex items-center gap-1 hover:text-gray-800">
            <ArrowLeft className="w-4 h-4"/> Kembali
          </button>
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Login Siswa</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">Nama Lengkap</label>
              <input 
                type="text" 
                required 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-green-500" 
                placeholder="Masukkan nama lengkap Anda..." 
              />
            </div>
            <button type="submit" className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg mt-4">
              Masuk
            </button>
          </form>
        </div>
      </div>
    );
  };

  // --- KOMPONEN: DASHBOARD SISWA ---
  const StudentDashboardView = () => {
    
    const startQuiz = async () => {
      const studentData = { id: currentStudent.id, name: currentStudent.name, status: 'Mengerjakan', startTime: new Date().toLocaleTimeString() };
      if (isDbReady && user) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'active_students', currentStudent.id), studentData);
      } else {
        const updatedStudents = activeStudents.map(s => s.id === currentStudent.id ? studentData : s);
        setActiveStudents(updatedStudents);
      }
      setView('quiz');
    };

    return (
      <div className="min-h-screen bg-gray-100 p-4 md:p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-md p-6">
          <div className="flex justify-between items-center mb-8 border-b pb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Halo, {currentStudent.name}</h2>
              <p className="text-gray-500">Selamat datang, pastikan koneksi internet stabil.</p>
            </div>
            <button onClick={clearSession} className="flex items-center gap-2 text-red-500 hover:text-red-700 px-4 py-2 rounded-lg border border-red-500 hover:bg-red-50">
              <LogOut className="w-4 h-4" /> Keluar
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
            <BookOpen className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">Ujian Bahasa Arab & PAI</h3>
            <p className="text-gray-600 mb-2">Materi: Isim Mausul & Fi'il Amar</p>
            <p className="text-gray-600 mb-6">Jumlah Soal: {questions.length} | Sisa Waktu: {Math.floor(timeLeft / 60)} Menit</p>
            
            <button 
              onClick={startQuiz} 
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg flex items-center gap-2 mx-auto"
            >
              <Play className="w-5 h-5" /> {timeLeft < 3600 ? "Lanjutkan Ujian" : "Mulai Ujian Sekarang"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --- KOMPONEN: UJIAN (QUIZ) ---
  const QuizView = () => {
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
      if (timeLeft <= 0) {
        submitQuiz();
        return;
      }
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    }, [timeLeft]);

    const formatTime = (seconds) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleSelectOption = (questionId, optionIndex) => {
      setAnswers({ ...answers, [questionId]: optionIndex });
    };

    const submitQuiz = async () => {
      let correct = 0;
      questions.forEach(q => {
        if (answers[q.id] === q.answer) correct++;
      });
      const finalScore = Math.round((correct / questions.length) * 100);
      
      const resultData = {
        id: currentStudent.id,
        name: currentStudent.name,
        score: finalScore,
        correctAnswers: correct,
        totalQuestions: questions.length,
        date: new Date().toLocaleString()
      };

      if (isDbReady && user) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'active_students', currentStudent.id));
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quiz_results', currentStudent.id), resultData);
      } else {
        setResults(prev => [...prev, resultData]);
        setActiveStudents(prev => prev.filter(s => s.id !== currentStudent.id));
      }
      
      setView('result');
    };

    const currentQ = questions[currentIndex];

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white shadow-sm p-4 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            <div>
              <h1 className="font-bold text-gray-800">{currentStudent.name}</h1>
              <p className="text-sm text-gray-500">Soal {currentIndex + 1} dari {questions.length}</p>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold ${timeLeft < 300 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}`}>
              <Clock className="w-5 h-5" />
              {formatTime(timeLeft)}
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-5xl mx-auto w-full p-4 flex flex-col md:flex-row gap-6 mt-4">
          <div className="flex-1 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-medium text-gray-800 mb-6 leading-relaxed">
              {currentIndex + 1}. {currentQ.text}
            </h2>
            <div className="space-y-3">
              {currentQ.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(currentQ.id, idx)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    answers[currentQ.id] === idx 
                      ? 'border-green-500 bg-green-50 text-green-800' 
                      : 'border-gray-200 hover:border-green-300 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="inline-block w-8 h-8 text-center leading-8 rounded-full bg-white border mr-3 font-bold">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {opt}
                </button>
              ))}
            </div>

            <div className="flex justify-between mt-8 pt-6 border-t">
              <button 
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(prev => prev - 1)}
                className="px-6 py-2 rounded-lg font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4"/> Sebelumnya
              </button>
              
              {currentIndex === questions.length - 1 ? (
                <button 
                  onClick={() => setShowConfirm(true)}
                  className="px-6 py-2 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4"/> Selesai
                </button>
              ) : (
                <button 
                  onClick={() => setCurrentIndex(prev => prev + 1)}
                  className="px-6 py-2 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
                >
                  Selanjutnya <ArrowRight className="w-4 h-4"/>
                </button>
              )}
            </div>
          </div>

          <div className="w-full md:w-64 bg-white rounded-xl shadow-sm p-4 h-fit">
            <h3 className="font-bold text-gray-700 mb-4 text-center">Navigasi Soal</h3>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-medium text-sm border
                    ${currentIndex === idx ? 'ring-2 ring-blue-500 border-transparent' : ''}
                    ${answers[q.id] !== undefined ? 'bg-green-500 text-white border-transparent' : 'bg-gray-50 text-gray-600 hover:bg-gray-200'}
                  `}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
            <div className="mt-6">
              <button 
                onClick={() => setShowConfirm(true)}
                className="w-full py-2 bg-red-100 text-red-600 font-bold rounded-lg hover:bg-red-200"
              >
                Akhiri Ujian
              </button>
            </div>
          </div>
        </main>

        {showConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center">
              <h3 className="text-xl font-bold mb-2">Selesai Mengerjakan?</h3>
              <p className="text-gray-600 mb-6">Pastikan semua soal telah terjawab. Waktu Anda masih {formatTime(timeLeft)}.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 bg-gray-100 rounded-lg font-medium text-gray-700 hover:bg-gray-200">Batal</button>
                <button onClick={submitQuiz} className="flex-1 py-2 bg-green-600 rounded-lg font-medium text-white hover:bg-green-700">Ya, Selesai</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- KOMPONEN: HASIL UJIAN SISWA ---
  const ResultView = () => {
    // Ambil hasil dari memori sementara atau database
    const myResult = results.find(r => r.id === currentStudent.id) || results[results.length - 1];

    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="text-green-500 w-12 h-12" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Ujian Selesai!</h2>
          <p className="text-gray-600 mb-6">Terima kasih telah mengerjakan, {myResult?.name || currentStudent.name}.</p>
          
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <p className="text-sm text-gray-500 uppercase tracking-wide font-bold mb-1">Nilai Anda</p>
            <p className="text-6xl font-black text-green-600">{myResult?.score || "..."}</p>
            <p className="text-gray-500 mt-2">Benar {myResult?.correctAnswers || "..."} dari {myResult?.totalQuestions || "..."} Soal</p>
          </div>

          <button 
            onClick={clearSession}
            className="w-full py-3 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-lg transition"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  };

  // --- KOMPONEN: LOGIN GURU ---
  const TeacherLoginView = () => {
    const [pwd, setPwd] = useState('');
    const [error, setError] = useState(false);

    const handleLogin = (e) => {
      e.preventDefault();
      if(pwd === 'guru123') {
        setView('teacher-dashboard');
        setPwd(''); 
      } else {
        setError(true);
      }
    };

    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
          <button onClick={clearSession} className="text-gray-500 mb-4 flex items-center gap-1 hover:text-gray-800">
            <ArrowLeft className="w-4 h-4"/> Kembali
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><LayoutDashboard className="w-6 h-6"/></div>
            <h2 className="text-2xl font-bold text-gray-800">Login Admin (Guru)</h2>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">Password Akses</label>
              <input 
                type="password" 
                required 
                value={pwd} 
                onChange={(e) => {setPwd(e.target.value); setError(false);}} 
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500" 
                placeholder="Masukkan password..." 
              />
              {error && <p className="text-red-500 text-sm mt-1">Password salah! (Gunakan: guru123)</p>}
            </div>
            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg mt-4">
              Masuk Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  };

  // --- KOMPONEN: DASHBOARD GURU ---
  const TeacherDashboardView = () => {
    const [tab, setTab] = useState('hasil'); 

    return (
      <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row print:bg-white">
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-white shadow-lg md:min-h-screen flex flex-col print:hidden">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-blue-600 flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6"/> CBT Admin
            </h2>
          </div>
          <nav className="flex-1 p-4 space-y-2 flex md:flex-col overflow-x-auto md:overflow-visible">
            <button onClick={() => setTab('hasil')} className={`flex items-center gap-2 w-full text-left px-4 py-3 rounded-lg font-medium whitespace-nowrap ${tab === 'hasil' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
              <CheckCircle className="w-5 h-5"/> Hasil Nilai Siswa
            </button>
            <button onClick={() => setTab('pantau')} className={`flex items-center gap-2 w-full text-left px-4 py-3 rounded-lg font-medium whitespace-nowrap ${tab === 'pantau' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Users className="w-5 h-5"/> Pantau Ujian
            </button>
          </nav>
          <div className="p-4 border-t">
            <button onClick={clearSession} className="flex items-center gap-2 w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium">
              <LogOut className="w-5 h-5"/> Keluar
            </button>
          </div>
        </div>

        {/* Konten Utama */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto print:p-0 print:overflow-visible">
          
          {/* PERINGATAN OFFLINE */}
          {!isDbReady && (
            <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mb-6 rounded-lg print:hidden flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 shrink-0"/>
              <div>
                <p className="font-bold">Mode Offline Vercel</p>
                <p className="text-sm">Anda belum menyambungkan Firebase Database. Data dari HP siswa tidak akan muncul di sini. Silakan ikuti <span className="font-bold">Panduan Konfigurasi Firebase</span> yang diberikan oleh AI untuk menyambungkannya.</p>
              </div>
            </div>
          )}

          {tab === 'hasil' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 print:shadow-none print:border-none print:p-0">
              <div className="hidden print:block mb-8 text-center text-black">
                <h2 className="text-2xl font-bold uppercase">Laporan Hasil Ujian CBT</h2>
                <h3 className="text-xl font-semibold">Madrasah Tsanawiyah - Kelas 9</h3>
                <div className="border-b-4 border-black mt-4 mb-6"></div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 print:hidden gap-4">
                <h3 className="text-xl font-bold text-gray-800">Rekap Nilai Siswa</h3>
                <button 
                  onClick={() => window.print()}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition"
                >
                  <Printer className="w-5 h-5" /> Cetak / Simpan PDF
                </button>
              </div>

              {results.length === 0 ? (
                <div className="text-center py-10 text-gray-500 print:hidden">Belum ada nilai yang masuk.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border border-gray-200 print:border-black">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 print:border-black print:bg-gray-100">
                        <th className="p-3 border-r print:border-black">No</th>
                        <th className="p-3 border-r print:border-black">Waktu Selesai</th>
                        <th className="p-3 border-r print:border-black">Nama Siswa</th>
                        <th className="p-3 border-r print:border-black text-center">Benar</th>
                        <th className="p-3 print:border-black text-center">Nilai Akhir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, idx) => (
                        <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50 print:border-black">
                          <td className="p-3 border-r print:border-black">{idx + 1}</td>
                          <td className="p-3 text-sm text-gray-500 border-r print:border-black print:text-black">{r.date}</td>
                          <td className="p-3 font-medium border-r print:border-black print:text-black">{r.name}</td>
                          <td className="p-3 border-r text-center print:border-black">{r.correctAnswers} / {r.totalQuestions}</td>
                          <td className="p-3 text-center print:border-black">
                            <span className={`px-3 py-1 rounded-full text-sm font-bold ${r.score >= 75 ? 'bg-green-100 text-green-700 print:bg-transparent print:text-black print:border' : 'bg-red-100 text-red-700 print:bg-transparent print:text-black print:border'}`}>
                              {r.score}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="hidden print:flex justify-end mt-16 text-black pr-8">
                    <div className="text-center">
                      <p className="mb-16">Mengetahui,<br/>Guru Mata Pelajaran</p>
                      <p className="font-bold underline">___________________________</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'pantau' && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-xl font-bold mb-6 text-gray-800 flex items-center justify-between">
                <span>Status Siswa Aktif</span>
                <span className="bg-blue-100 text-blue-800 text-sm py-1 px-3 rounded-full">{activeStudents.length} Online</span>
              </h3>
              {activeStudents.length === 0 ? (
                <div className="text-center py-10 text-gray-500">Tidak ada siswa yang sedang online saat ini.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeStudents.map((s, idx) => (
                    <div key={idx} className="border rounded-lg p-4 flex items-start gap-4 shadow-sm bg-white">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-bold">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">{s.name}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                          </span>
                          <span className="text-xs font-medium text-green-600">{s.status} (Mulai: {s.startTime})</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  switch(view) {
    case 'home': return <HomeView />;
    case 'student-login': return <StudentLoginView />;
    case 'student-dashboard': return <StudentDashboardView />;
    case 'quiz': return <QuizView />;
    case 'result': return <ResultView />;
    case 'teacher-login': return <TeacherLoginView />;
    case 'teacher-dashboard': return <TeacherDashboardView />;
    default: return <HomeView />;
  }
}
