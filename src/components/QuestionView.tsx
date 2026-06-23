import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Globe, BookOpen, CheckCircle2, RotateCcw, Award, ChevronRight, Loader2, History, X, Volume2 } from 'lucide-react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import { auth } from '../lib/firebase';

interface QuestionData {
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  questionType?: 'mcq' | 'short_answer' | 'long_answer';
  cognitiveAspect?: string;
  cognitiveDesc?: string;
  difficulty?: string;
}

interface EvaluationResult {
  score: number;
  feedback: string;
  correctAnswer: string;
  explanation: string;
}

interface HistoryItem {
  id: string;
  question: string;
  studentAnswer: string;
  result: EvaluationResult;
  mode: string;
  timestamp: any;
}

interface QuestionViewProps {
  topicId: string;
  topicName: string;
  subjectName: string;
  unitName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  mode: 'mcq' | 'qa' | 'voice';
  onBack: () => void;
}

const VoiceWaveform = () => {
  return (
    <div className="flex items-center gap-1.5 h-12">
      {[...Array(16)].map((_, i) => (
        <motion.div
          key={i}
          className="w-1.5 bg-red-400 rounded-full shadow-[0_0_10px_rgba(248,113,113,0.3)]"
          animate={{
            height: [12, 48, 16, 40, 12],
          }}
          transition={{
            repeat: Infinity,
            duration: 0.7 + Math.random() * 0.4,
            delay: i * 0.04,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

export function QuestionView({ topicId, topicName, subjectName, unitName, difficulty, mode, onBack }: QuestionViewProps) {
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [varietyMode, setVarietyMode] = useState<'mixed' | 'mcq' | 'short_answer' | 'long_answer'>(
    mode === 'mcq' ? 'mcq' : 'mixed'
  );
  const [difficultyCalibration, setDifficultyCalibration] = useState<'fixed' | 'progressive'>('progressive');
  const [cognitiveAspectFocus, setCognitiveAspectFocus] = useState<'bloom_scan' | 'focused'>('bloom_scan');
  const [questionCount, setQuestionCount] = useState(5);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sessionScores, setSessionScores] = useState<{ 
    question: string; 
    score: number; 
    studentAnswer: string; 
    correctAnswer: string; 
    feedback: string; 
    explanation: string;
    mode: string;
  }[]>([]);
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  const [previousQuestions, setPreviousQuestions] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionData, setQuestionData] = useState<QuestionData | null>(null);
  const [studentAnswer, setStudentAnswer] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [helpText, setHelpText] = useState<{ [key: string]: string }>({});
  const [helpLoading, setHelpLoading] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // 1. Reset states
    setIsSessionStarted(false);
    setIsSessionFinished(false);
    setCurrentIdx(0);
    setSessionScores([]);
    setQuestionData(null);
    setResult(null);
    setStudentAnswer('');

    // 2. Load from localStorage immediately for prompt rendering
    let initialPrev: string[] = [];
    try {
      const stored = localStorage.getItem(`persistent_seen_questions_${topicId}`);
      if (stored) {
        initialPrev = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load local history:', e);
    }
    setPreviousQuestions(initialPrev);

    // 3. Load from Firestore asynchronously and merge
    const loadHistory = async () => {
      if (!auth.currentUser) return;
      try {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');

        // Fetch question history safely (without sorting field inside query to avoid mandatory composite index requirements)
        const historyRef = collection(db, 'question_history');
        const q = query(
          historyRef, 
          where('uid', '==', auth.currentUser.uid), 
          where('topicId', '==', topicId)
        );
        
        // Fetch asked questions tracking as well (questions generated but not necessarily answered/completed yet)
        const askedRef = collection(db, 'asked_questions');
        const askedQ = query(
          askedRef,
          where('uid', '==', auth.currentUser.uid),
          where('topicId', '==', topicId)
        );

        const [historySnap, askedSnap] = await Promise.all([
          getDocs(q),
          getDocs(askedQ)
        ]);

        const loadedHistory = historySnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as HistoryItem[];

        // Sort in memory by timestamp desc safely
        loadedHistory.sort((a, b) => {
          const tA = a.timestamp?.seconds || (a.timestamp instanceof Date ? a.timestamp.getTime() : 0);
          const tB = b.timestamp?.seconds || (b.timestamp instanceof Date ? b.timestamp.getTime() : 0);
          return tB - tA;
        });
        setHistory(loadedHistory);

        // Merge questions from both collections to prevent repetition across devices
        const historyQuestions = loadedHistory
          .map(h => h.question)
          .filter((qText): qText is string => typeof qText === 'string' && qText.length > 0);

        const askedQuestionsList = askedSnap.docs
          .map(doc => doc.data().question)
          .filter((qText): qText is string => typeof qText === 'string' && qText.length > 0);

        setPreviousQuestions(prev => {
          const combined = Array.from(new Set([...prev, ...historyQuestions, ...askedQuestionsList]));
          try {
            localStorage.setItem(`persistent_seen_questions_${topicId}`, JSON.stringify(combined));
          } catch (e) {
            console.error('Failed to save merged history:', e);
          }
          return combined;
        });
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };

    loadHistory();
  }, [topicId]);

  useEffect(() => {
    setVarietyMode(mode === 'mcq' ? 'mcq' : 'mixed');
    if (isSessionStarted && !isSessionFinished) {
      setResult(null);
      setStudentAnswer('');
      fetchQuestion();
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleSpeak = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this device/browser.');
      return;
    }

    if (isPlayingVoice) {
      window.speechSynthesis.cancel();
      setIsPlayingVoice(false);
    } else {
      const speakText = text
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/#+\s/g, '')
        .replace(/-\s/g, '');

      const utterance = new SpeechSynthesisUtterance(speakText);
      utterance.onend = () => {
        setIsPlayingVoice(false);
      };
      utterance.onerror = (e) => {
        console.error('Speech synthesis error:', e);
        setIsPlayingVoice(false);
      };
      const voices = window.speechSynthesis.getVoices();
      const engVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || 
                        voices.find(v => v.lang.startsWith('en'));
      if (engVoice) {
        utterance.voice = engVoice;
      }
      
      utteranceRef.current = utterance;
      setIsPlayingVoice(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const fetchQuestion = async (customExclude?: string[]) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setStudentAnswer('');
    setVoiceStatus('idle');
    setIsPlayingVoice(false);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    try {
      let currentType: string = mode === 'mcq' ? 'mcq' : 'short_answer';
      let currentDifficulty: string = difficulty;
      let currentCognitiveAspect: string = 'any';

      if (isSessionStarted) {
        // Evaluate dynamic type
        if (varietyMode === 'mixed') {
          // Sequentially rotate type: mcq -> short_answer -> long_answer -> mcq -> ...
          const typesInSequence = ['mcq', 'short_answer', 'long_answer'];
          currentType = typesInSequence[currentIdx % typesInSequence.length];
        } else {
          currentType = varietyMode;
        }

        // Evaluate dynamic difficulty calibration
        if (difficultyCalibration === 'progressive') {
          if (questionCount <= 1) {
            currentDifficulty = difficulty;
          } else {
            const stepRatio = currentIdx / (questionCount - 1);
            if (stepRatio <= 0.25) {
              currentDifficulty = 'easy';
            } else if (stepRatio <= 0.7) {
              currentDifficulty = 'medium';
            } else {
              currentDifficulty = 'hard';
            }
          }
        } else {
          currentDifficulty = difficulty; // fixed
        }

        // Evaluate dynamic cognitive aspect
        if (cognitiveAspectFocus === 'bloom_scan') {
          const bloomSequence = [
            'Remembering',
            'Understanding',
            'Applying',
            'Analyzing',
            'Evaluating',
            'Creating'
          ];
          currentCognitiveAspect = bloomSequence[currentIdx % bloomSequence.length];
        }
      } else {
        // For non-session single questions
        if (mode === 'mcq') currentType = 'mcq';
        else currentType = 'short_answer';
      }

      const baseList = customExclude !== undefined ? customExclude : previousQuestions;
      const excludeList = Array.isArray(baseList) ? baseList.slice(-100) : [];
      const res = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topic: topicName, 
          subject: subjectName,
          unit: unitName,
          difficulty: currentDifficulty,
          type: currentType,
          cognitiveAspect: currentCognitiveAspect,
          excludeQuestions: excludeList
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = 'Failed to fetch question';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
          if (errorData.message) {
            errorMessage += `: ${errorData.message}`;
          }
        } catch (e) {
          errorMessage = `Server Error (${res.status})`;
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      setQuestionData(data);
      if (data && data.question) {
        setPreviousQuestions(prev => {
          if (prev.includes(data.question)) return prev;
          const updated = [...prev, data.question];
          try {
            localStorage.setItem(`persistent_seen_questions_${topicId}`, JSON.stringify(updated));
          } catch (e) {
            console.error('Failed to save questions cache:', e);
          }
          return updated;
        });

        // Track previously asked questions securely per student and topic across different sessions in Firestore
        if (auth.currentUser) {
          try {
            const { collection, addDoc } = await import('firebase/firestore');
            const { db } = await import('../lib/firebase');
            await addDoc(collection(db, 'asked_questions'), {
              uid: auth.currentUser.uid,
              topicId,
              question: data.question,
              questionType: data.questionType || currentType,
              timestamp: new Date()
            });
          } catch (e) {
            console.error('Failed to write to asked_questions in Firestore:', e);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch question:', err);
      setError(err.message || 'Failed to fetch question');
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = (count: number) => {
    setQuestionCount(count);
    setIsSessionStarted(true);
    setCurrentIdx(0);
    setSessionScores([]);
    // Do NOT reset previousQuestions, so we exclude questions that they have already done previously
    setIsSessionFinished(false);
    fetchQuestion(previousQuestions);
  };

  const handleNextQuestion = () => {
    if (result && questionData) {
      const currentScore = {
        question: questionData.question,
        score: result.score,
        studentAnswer: studentAnswer,
        correctAnswer: result.correctAnswer,
        feedback: result.feedback,
        explanation: result.explanation,
        mode: mode
      };
      
      setSessionScores(prev => {
        const updated = [...prev, currentScore];
        
        if (currentIdx + 1 < questionCount) {
          setCurrentIdx(prevIdx => prevIdx + 1);
          setQuestionData(null);
          setResult(null);
          setStudentAnswer('');
          setTimeout(() => {
            fetchQuestion(previousQuestions);
          }, 0);
        } else {
          setIsSessionFinished(true);
        }
        return updated;
      });
    }
  };

  const handleSubmit = async (answerOverride?: string) => {
    const finalAnswer = answerOverride || studentAnswer;
    if (!finalAnswer) return;

    setEvaluating(true);
    setError(null);
    try {
      const res = await fetch('/api/evaluate-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionData?.question,
          studentAnswer: finalAnswer,
          correctAnswer: questionData?.correctAnswer,
          questionType: questionData?.questionType || (mode === 'mcq' ? 'mcq' : 'short_answer'),
          cognitiveAspect: questionData?.cognitiveAspect || 'any',
          difficulty: questionData?.difficulty || difficulty,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = 'Evaluation failed';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `Analysis Interrupted (${res.status})`;
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      setResult(data);
      
      // Persist to Question History
      if (auth.currentUser) {
        try {
          const { collection, addDoc } = await import('firebase/firestore');
          const { db } = await import('../lib/firebase');
          const historyItem = {
            uid: auth.currentUser.uid,
            topicId,
            question: questionData!.question,
            studentAnswer: finalAnswer,
            result: data,
            mode,
            timestamp: new Date()
          };
          const docRef = await addDoc(collection(db, 'question_history'), historyItem);
          setHistory(prev => [{ id: docRef.id, ...historyItem }, ...prev]);
        } catch (err) {
          console.error('Failed to save history item:', err);
          
          // Fallback to local history if DB write fails
          const fallbackItem: HistoryItem = {
            id: Math.random().toString(36).substr(2, 9),
            question: questionData!.question,
            studentAnswer: finalAnswer,
            result: data,
            mode,
            timestamp: new Date()
          };
          setHistory(prev => [fallbackItem, ...prev]);
        }
      } else {
        const fallbackItem: HistoryItem = {
          id: Math.random().toString(36).substr(2, 9),
          question: questionData!.question,
          studentAnswer: finalAnswer,
          result: data,
          mode,
          timestamp: new Date()
        };
        setHistory(prev => [fallbackItem, ...prev]);
      }

      // Save progress if score is good (>= 7)
      if (data.score >= 7 && auth.currentUser) {
        try {
          const { collection, query, where, getDocs, addDoc } = await import('firebase/firestore');
          const { db } = await import('../lib/firebase');
          const progressRef = collection(db, 'user_progress');
          const q = query(progressRef, 
            where('uid', '==', auth.currentUser.uid), 
            where('topicId', '==', topicId)
          );
          const snap = await getDocs(q);
          if (snap.empty) {
            await addDoc(progressRef, {
              uid: auth.currentUser.uid,
              topicId,
              status: 'completed',
              timestamp: new Date()
            });
          }
        } catch (err) {
          console.error('Failed to save progress:', err);
        }
      }
    } catch (err: any) {
      console.error('Evaluation failed:', err);
      setError(err.message || 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const handleHelp = async (action: 'translate' | 'explain', language?: string) => {
    if (!result) return;
    const key = language ? `translate-${language}` : 'explain';
    setHelpLoading(key);
    try {
      const textToProcess = action === 'translate' 
        ? `Feedback: ${result.feedback}. Explanation: ${result.explanation}` 
        : `Answer Detail: ${result.correctAnswer}. Rationale: ${result.explanation}`;

      const res = await fetch('/api/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToProcess,
          action,
          language
        }),
      });

      if (!res.ok) {
        throw new Error(`Help service error (${res.status})`);
      }

      const data = await res.json();
      setHelpText(prev => ({ ...prev, [key]: data.result }));
    } catch (err: any) {
      console.error('Help action failed:', err);
    } finally {
      setHelpLoading(null);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setVoiceStatus('processing');
    } else {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SpeechRecognition) {
        alert('Speech recognition is not supported in this browser.');
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
        setVoiceStatus('listening');
      };
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setStudentAnswer(transcript);
      };
      recognition.onend = () => {
        setIsRecording(false);
        setVoiceStatus(prev => prev === 'listening' ? 'idle' : prev);
      };
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        setVoiceStatus('idle');
      };

      recognition.start();
      recognitionRef.current = recognition;
    }
  };

  if (!isSessionStarted) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-0">
        <div className="bg-white/5 backdrop-blur-3xl rounded-[3rem] p-10 md:p-14 border border-white/10 mb-10 accent-glow relative overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-4 mb-12 border-b border-white/5 pb-8">
            <button 
              onClick={onBack}
              className="p-3 bg-white/5 hover:bg-cyan-400 hover:text-slate-900 rounded-full border border-white/10 transition-all hover:scale-110"
            >
              <RotateCcw size={20} className="rotate-180" />
            </button>
            <div className="h-8 w-[1px] bg-white/10"></div>
            <div className="flex flex-col">
              <span className="text-[10px] text-cyan-400 font-black uppercase tracking-[0.35em] leading-none mb-2">Drill Stream Calibration</span>
              <h2 className="text-3xl font-black text-white tracking-tighter leading-none">{topicName}</h2>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-2 font-mono">
                {subjectName} <span className="mx-2 text-white/10">|</span> {unitName}
              </p>
            </div>
          </div>

          <div className="space-y-10">
            <div className="space-y-4">
              <span className="text-[11px] font-black text-cyan-400 uppercase tracking-[0.4em] block">Syllabus Drill Capacity</span>
              <h3 className="text-2xl font-black text-white tracking-tight">Select your assessment density</h3>
              <p className="text-white/60 text-sm max-w-2xl leading-relaxed">
                Choose the size of the logical question queue. Multi-question sequences avoid repetition and evaluate deep conceptual sub-facets of the domain.
              </p>
            </div>

            {/* Selection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
              {[
                { count: 1, label: "Single Challenge", desc: "Immediate core logic query evaluation", badge: "Flash Try" },
                { count: 3, label: "Sprint Diagnostic", desc: "Baseline sector review with fast execution speed", badge: "Baseline" },
                { count: 5, label: "Standard Calibration", desc: "Optimal accuracy audit and feedback tracking", badge: "Recommended" },
                { count: 10, label: "Continuous Deep Scan", desc: "Exhaustive topic mastery logic verification", badge: "Immersive" }
              ].map((opt) => (
                <button
                  key={opt.count}
                  onClick={() => setQuestionCount(opt.count)}
                  className={`p-6 rounded-[2rem] border text-left transition-all hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden cursor-pointer ${
                    questionCount === opt.count 
                      ? 'bg-cyan-400 border-cyan-400 text-slate-950 shadow-xl shadow-cyan-400/10 font-bold' 
                      : 'bg-white/5 border-white/10 text-white hover:border-white/20'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-md ${
                      questionCount === opt.count 
                        ? 'bg-slate-950 text-cyan-400' 
                        : 'bg-white/10 text-cyan-300'
                    }`}>
                      {opt.badge}
                    </span>
                    <span className="text-3xl font-black tracking-tighter">{opt.count} Q</span>
                  </div>
                  <h4 className="text-lg font-black tracking-tight leading-tight mb-2 uppercase">{opt.label}</h4>
                  <p className={`text-xs leading-relaxed ${
                    questionCount === opt.count ? 'text-slate-900/70 font-semibold' : 'text-white/40'
                  }`}>
                    {opt.desc}
                  </p>
                  
                  {questionCount === opt.count && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/5 pointer-events-none" />
                  )}
                </button>
              ))}
            </div>

            {/* Cognitive Customizations */}
            <div className="p-8 bg-white/[0.02] border border-white/5 rounded-[2rem] space-y-8">
              <div className="flex items-center gap-3">
                <Globe size={18} className="text-cyan-400" />
                <h4 className="text-[11px] font-black tracking-[0.3em] uppercase text-white/50">Cognitive & Structural Tuning Parameters</h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Challenge Variety */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-white/40 tracking-wider block">Question Variety Mode</label>
                  <div className="flex flex-col gap-2">
                    {[
                      { value: 'mixed', label: 'Balanced Bloom Mix', desc: 'Alternate MCQs, Short & Long Qs' },
                      { value: 'mcq', label: 'Strict MCQ Logic', desc: 'Pattern recognition only' },
                      { value: 'short_answer', label: 'Factual Direct Checks', desc: 'Direct concept queries' },
                      { value: 'long_answer', label: 'Critical Synthesis', desc: 'Detailed, long essay configurations' }
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setVarietyMode(item.value as any)}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          varietyMode === item.value
                            ? 'bg-cyan-400/20 border-cyan-400 text-cyan-200 shadow-lg shadow-cyan-400/5'
                            : 'bg-white/5 border-white/5 text-white/60 hover:border-white/10'
                        }`}
                      >
                        <p className="text-xs font-black tracking-tight uppercase leading-none">{item.label}</p>
                        <p className="text-[9px] opacity-60 mt-1 leading-snug">{item.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Difficulty Ladder */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-white/40 tracking-wider block">Difficulty Calibration</label>
                  <div className="flex flex-col gap-2">
                    {[
                      { value: 'progressive', label: 'Progressive Ladder', desc: 'Easy ➔ Medium ➔ Hard increments' },
                      { value: 'fixed', label: 'Locked Complexity', desc: `Keep strictly at selected "${difficulty}"` }
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setDifficultyCalibration(item.value as any)}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          difficultyCalibration === item.value
                            ? 'bg-cyan-400/20 border-cyan-400 text-cyan-200 shadow-lg shadow-cyan-400/5'
                            : 'bg-white/5 border-white/5 text-white/60 hover:border-white/10'
                        }`}
                      >
                        <p className="text-xs font-black tracking-tight uppercase leading-none">{item.label}</p>
                        <p className="text-[9px] opacity-60 mt-1 leading-snug">{item.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Cognitive Aspect Scan */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-white/40 tracking-wider block">Cognitive Dimension Focus</label>
                  <div className="flex flex-col gap-2">
                    {[
                      { value: 'bloom_scan', label: 'Complete Bloom Sweep', desc: 'Recall ➔ Analysis ➔ Synthesis targets' },
                      { value: 'focused', label: 'Standard Calibrated Focus', desc: 'Evaluations fitted directly to topic schema' }
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setCognitiveAspectFocus(item.value as any)}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          cognitiveAspectFocus === item.value
                            ? 'bg-cyan-400/20 border-cyan-400 text-cyan-200 shadow-lg shadow-cyan-400/5'
                            : 'bg-white/5 border-white/5 text-white/60 hover:border-white/10'
                        }`}
                      >
                        <p className="text-xs font-black tracking-tight uppercase leading-none">{item.label}</p>
                        <p className="text-[9px] opacity-60 mt-1 leading-snug">{item.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Control CTA */}
            <div className="pt-6 border-t border-white/5">
              <button
                onClick={() => handleStartSession(questionCount)}
                className="w-full bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 text-slate-950 py-6 rounded-2xl font-black uppercase tracking-[0.25em] text-xs flex items-center justify-center gap-3 transition-all shadow-[0_20px_40px_-15px_rgba(34,211,238,0.3)] active:scale-95 cursor-pointer font-bold"
              >
                <Award size={18} />
                ENGAGE DRILL SEQUENCES
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isSessionFinished) {
    const totalScore = sessionScores.reduce((acc, curr) => acc + curr.score, 0);
    const averageScore = sessionScores.length ? Number((totalScore / sessionScores.length).toFixed(1)) : 0;
    
    let perfLabel = "RE-CALIBRATION RECOMMENDED";
    let perfDesc = "Logical density was not calibrated correctly. Try another drill or revisit the documentation nodes.";
    let perfColor = "text-red-400 bg-red-400/10 border-red-500/20";
    
    if (averageScore >= 8.5) {
      perfLabel = "EXCEPTIONAL MASTER";
      perfDesc = "Superb knowledge node representation! The concept is fully integrated into your cognitive system.";
      perfColor = "text-cyan-400 bg-cyan-400/10 border-cyan-400/20 shadow-[0_0_50px_rgba(34,211,238,0.15)]";
    } else if (averageScore >= 7.0) {
      perfLabel = "PROTOCOL CALIBRATED";
      perfDesc = "High accuracy levels achieved. Satisfies standard academic curriculum master thresholds.";
      perfColor = "text-indigo-400 bg-indigo-400/10 border-indigo-500/20";
    } else if (averageScore >= 5.0) {
      perfLabel = "MODERATE COMPREHENSION";
      perfDesc = "Passable logical layout. Re-testing is advised to firm up lingering uncertainties.";
      perfColor = "text-amber-400 bg-amber-400/10 border-amber-500/20";
    }

    return (
      <div className="max-w-5xl mx-auto p-4 md:p-0 space-y-10">
        <div className="bg-white/5 backdrop-blur-3xl rounded-[3rem] p-10 md:p-14 border border-white/10 accent-glow relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-400/5 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-40 -left-20 w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-10 mb-12">
            <div className="space-y-4">
              <span className="px-3.5 py-1 bg-cyan-400/10 text-cyan-400 text-[9px] font-black uppercase tracking-[0.3em] rounded-full border border-cyan-400/20">
                Drill Calibration Finalized
              </span>
              <h2 className="text-3xl font-black text-white tracking-tighter uppercase leading-tight mt-3">Diagnostic Summary Report</h2>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest leading-none font-mono">
                {subjectName} <span className="mx-2 text-white/10">|</span> {topicName}
              </p>
            </div>
            
            <button 
              onClick={onBack}
              className="px-6 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-2 self-start md:self-center cursor-pointer"
            >
              Exit Diagnostic
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className={`p-8 rounded-[2.5rem] border ${perfColor} flex flex-col items-center justify-center text-center relative overflow-hidden group`}>
              <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">Composite Index</span>
              <h4 className="text-7xl font-black tracking-tighter my-3 flex items-baseline gap-1">
                {averageScore}
                <span className="text-2xl opacity-40">/10</span>
              </h4>
              <p className="text-xs font-black tracking-widest uppercase my-2">{perfLabel}</p>
              <p className="text-[10px] leading-relaxed opacity-60 mt-2 max-w-xs">{perfDesc}</p>
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/5 p-8 rounded-[2rem] flex flex-col justify-between relative overflow-hidden group">
                <div>
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block mb-1">Total Challenges</span>
                  <h5 className="text-4xl font-black text-white tracking-tighter">{sessionScores.length} Units</h5>
                </div>
                <p className="text-[9px] text-cyan-400/60 font-black uppercase tracking-widest mt-4 font-mono">Questions evaluated</p>
              </div>

              <div className="bg-white/5 border border-white/5 p-8 rounded-[2rem] flex flex-col justify-between relative overflow-hidden group">
                <div>
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block mb-1">Cumulative Grade</span>
                  <h5 className="text-4xl font-black text-white tracking-tighter">{totalScore} <span className="text-base text-white/20">/ {sessionScores.length * 10}</span></h5>
                </div>
                <p className="text-[9px] text-indigo-400/60 font-black uppercase tracking-widest mt-4 font-mono">Weighted performance log</p>
              </div>

              <div className="col-span-2 bg-gradient-to-r from-cyan-400/5 to-transparent border border-cyan-400/10 p-8 rounded-[2rem] flex items-center justify-between">
                <div>
                   <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest mb-1">Status Report</p>
                   <h6 className="text-xl font-bold text-white tracking-tight">System fully synchronized</h6>
                </div>
                <div className="text-right">
                   <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Accuracy Factor</p>
                   <h6 className="text-2xl font-black text-cyan-400 font-mono">{Math.round((averageScore / 10) * 100)}%</h6>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <History size={18} className="text-cyan-400" />
              <h3 className="text-lg font-black uppercase tracking-wider text-white">Itemized Performance Ledger</h3>
            </div>

            <div className="space-y-4">
              {sessionScores.map((scoreItem, sIdx) => {
                return (
                  <LedgerRow key={sIdx} scoreItem={scoreItem} index={sIdx} />
                );
              })}
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4 mt-12 border-t border-white/5 pt-10">
            <button
              onClick={() => handleStartSession(questionCount)}
              className="w-full md:w-auto flex-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold py-5 px-8 rounded-2xl transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-lg shadow-cyan-400/5"
            >
              <RotateCcw size={16} /> Re-calibrate Module
            </button>
            <button
              onClick={onBack}
              className="w-full md:w-auto flex-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-bold py-5 px-8 rounded-2xl transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              Return to Module Grid
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-white/30">
        <div className="relative mb-6">
          <Loader2 size={48} className="animate-spin text-cyan-400" />
          <div className="absolute inset-0 bg-cyan-400/20 blur-xl animate-pulse" />
        </div>
        <p className="font-black uppercase tracking-[0.3em] text-xs">Generating Neural Challenge...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-0">
      <div className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] p-10 border border-white/10 mb-10 accent-glow">
        <div className="flex items-center gap-4 mb-10">
          <button 
            onClick={onBack}
            className="p-3 bg-white/5 hover:bg-cyan-400 hover:text-slate-900 rounded-full border border-white/10 transition-all hover:scale-110"
          >
            <RotateCcw size={20} />
          </button>
          <div className="h-8 w-[1px] bg-white/10"></div>
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-white tracking-tighter leading-none">{topicName}</h2>
            <p className="text-[9px] font-black text-cyan-400/60 uppercase tracking-widest mt-1">
              {subjectName} <span className="mx-2 text-white/10">|</span> {unitName}
            </p>
          </div>
          
          <div className="flex items-center gap-3 ml-auto">
            {isSessionStarted && (
              <span className="px-4 py-1.5 bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-[0.2em] rounded-full border border-indigo-500/30 animate-pulse font-mono">
                Challenge {currentIdx + 1} of {questionCount}
              </span>
            )}
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl border border-white/10 transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer"
              >
                <History size={16} />
                Matrix Logs ({history.length})
              </button>
            )}
            <span className="px-4 py-1.5 bg-cyan-400/10 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-full border border-cyan-400/20 font-mono">
              {mode === 'voice' ? 'Acoustic Feed' : mode.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="mb-12">
          {error && (
            <div className="mb-8 p-8 bg-red-500/10 border border-red-500/20 rounded-[2rem] text-red-100 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                </div>
                <div>
                  <p className="font-black uppercase tracking-[0.2em] text-[10px] mb-1 opacity-50">Operational Fault</p>
                  <p className="text-sm font-bold uppercase tracking-widest">{error}</p>
                </div>
              </div>
              <button 
                onClick={fetchQuestion}
                className="px-8 py-4 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-white hover:text-red-500 transition-all shadow-xl shadow-red-500/20 relative z-10 active:scale-95"
              >
                Re-initialize Matrix
              </button>
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-[50px]" />
            </div>
          )}
          <p className="text-3xl md:text-4xl font-black text-white leading-[1.1] tracking-tight">
            {questionData?.question}
          </p>
        </div>

        {/* Dynamic Cognitive Intelligence Dashboard */}
        {questionData && (
          <div className="mb-10 p-5 bg-white/[0.03] border border-white/5 rounded-2xl flex flex-wrap items-center gap-6 md:gap-10">
            {/* Cognitive Aspect badge */}
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Analytical Target</span>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md ${
                  questionData?.cognitiveAspect === 'Creating' ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30' :
                  questionData?.cognitiveAspect === 'Evaluating' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                  questionData?.cognitiveAspect === 'Analyzing' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                  questionData?.cognitiveAspect === 'Applying' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                  questionData?.cognitiveAspect === 'Understanding' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                }`}>
                  {questionData?.cognitiveAspect || 'Calibrated Focus'}
                </span>
              </div>
            </div>

            {/* Cognitive Aspect Description */}
            <div className="flex-1 min-w-[200px]">
              <span className="text-[8px] font-black uppercase text-white/30 tracking-[0.2em] mb-1.5 block">Subheading / Tested Metric</span>
              <p className="text-xs text-white/70 font-semibold leading-relaxed">
                {questionData?.cognitiveDesc || 'Fitted conceptual analysis checking core memory structures.'}
              </p>
            </div>

            {/* Question Format Badge */}
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Challenge Format</span>
              <span className="text-xs font-black uppercase text-cyan-400 tracking-wider">
                {(questionData?.questionType === 'mcq' || (mode === 'mcq' && !questionData?.questionType)) ? '🎛️ Multiple Choice' :
                 questionData?.questionType === 'short_answer' ? '📝 Short Concept Query' :
                 questionData?.questionType === 'long_answer' ? '⚖️ Complex Analytical Essay' :
                 '📝 Active Concept Check'}
              </span>
            </div>

            {/* Difficulty Calibration badge */}
            <div className="flex flex-col animate-pulse">
              <span className="text-[8px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Static Complexity</span>
              <span className={`text-xs font-black uppercase tracking-widest ${
                (questionData?.difficulty || difficulty) === 'hard' ? 'text-rose-400' :
                (questionData?.difficulty || difficulty) === 'medium' ? 'text-amber-400' :
                'text-emerald-400'
              }`}>
                {(questionData?.difficulty || difficulty)} meter
              </span>
            </div>
          </div>
        )}

        {!result ? (
          <div className="space-y-8">
            {(questionData?.questionType === 'mcq' || (mode === 'mcq' && !questionData?.questionType)) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {questionData?.options && questionData.options.length > 0 ? (
                  questionData.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setStudentAnswer(option);
                        handleSubmit(option);
                      }}
                      disabled={evaluating}
                      className="flex items-center text-left p-6 rounded-3xl border border-white/10 bg-white/5 hover:bg-cyan-400 hover:border-cyan-400 transition-all duration-500 group active:scale-[0.98] relative overflow-hidden cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/10 group-hover:bg-slate-900 flex items-center justify-center mr-5 font-black text-white transition-all duration-500">
                        {String.fromCharCode(65 + idx)}
                      </div>
                      <span className="font-bold text-lg text-white/80 group-hover:text-slate-900 transition-all duration-500">{option}</span>
                    </button>
                  ))
                ) : (
                  <div className="text-white/40 p-10 text-center col-span-2 border border-white/5 bg-white/[0.02] rounded-3xl">
                    <Loader2 className="animate-spin text-cyan-400 mx-auto mb-2" />
                    <p className="font-mono text-xs uppercase tracking-widest">Compiling options matrix...</p>
                  </div>
                )}
              </div>
            ) : mode === 'voice' ? (
              <div className="flex flex-col items-center justify-center p-16 bg-white/5 rounded-[3rem] border border-dashed border-white/10 relative overflow-hidden">
                <AnimatePresence>
                  {isRecording && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-red-500/5 backdrop-blur-sm z-0"
                    />
                  )}
                </AnimatePresence>

                <div className="relative z-10 flex flex-col items-center">
                  <div className="mb-10">
                    <AnimatePresence mode="wait">
                      {isRecording ? (
                        <motion.div
                          key="waveform"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                        >
                          <VoiceWaveform />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="placeholder bar"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="h-12 flex items-center justify-center"
                        >
                          <div className="w-32 h-1 bg-white/10 rounded-full" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="relative">
                    <button
                      onClick={toggleRecording}
                      className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 relative ${
                        isRecording 
                          ? 'bg-red-500 text-white shadow-[0_0_60px_rgba(239,68,68,0.5)] scale-110' 
                          : 'bg-cyan-400 text-slate-900 hover:scale-110 shadow-2xl shadow-cyan-400/30 cursor-pointer'
                      }`}
                    >
                      {isRecording ? <MicOff size={44} /> : <Mic size={44} />}
                      
                      {isRecording && (
                        <>
                          <motion.div 
                            className="absolute -inset-4 border-2 border-red-500 rounded-full"
                            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                          />
                          <motion.div 
                            className="absolute -inset-8 border border-red-500/30 rounded-full"
                            animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
                            transition={{ repeat: Infinity, duration: 2.5 }}
                          />
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="mt-10 flex flex-col items-center gap-2">
                    <motion.div
                      animate={isRecording ? { opacity: [0.4, 1, 0.4] } : {}}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="flex items-center gap-2"
                    >
                      {isRecording && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                      <p className="font-black uppercase tracking-[0.4em] text-[11px] text-white">
                        {voiceStatus === 'listening' ? 'SYS: LISTENING...' : 
                         voiceStatus === 'processing' ? 'SYS: PROCESSING...' : 
                         'INITIALIZE ACOUSTICS'}
                      </p>
                    </motion.div>
                    
                    <p className="text-[10px] font-medium text-white/30 uppercase tracking-widest">
                      {isRecording ? 'Capturing Neural Input' : 'Click microphone to begin'}
                    </p>
                  </div>
                </div>
                
                {studentAnswer && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-14 p-10 bg-white/5 rounded-[2.5rem] border border-white/10 w-full max-w-2xl backdrop-blur-xl relative z-10"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Transcript Buffer</span>
                    </div>
                    <p className="text-white text-xl font-medium leading-relaxed italic block">
                      "{studentAnswer}"
                    </p>
                    
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setVoiceStatus('processing');
                        handleSubmit();
                      }}
                      className="mt-8 w-full bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-900 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 transition-all shadow-[0_20px_40px_-15px_rgba(34,211,238,0.3)] cursor-pointer font-bold"
                      disabled={evaluating}
                    >
                      {evaluating ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Analyzing Logic...
                        </>
                      ) : (
                        <>
                          <Send size={18} />
                          Execute Evaluation Matrix
                        </>
                      )}
                    </motion.button>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <textarea
                  value={studentAnswer}
                  onChange={(e) => setStudentAnswer(e.target.value)}
                  placeholder={
                    questionData?.questionType === 'long_answer'
                      ? "Articulate your detailed logical synthesis and address all parts of the critique rubric..."
                      : "Articulate your conceptual analytical response..."
                  }
                  className="w-full h-48 p-8 rounded-[2.5rem] bg-white/5 border border-white/10 focus:border-cyan-400/50 focus:ring-0 transition-all resize-none text-white text-xl leading-relaxed font-bold placeholder:text-white/10"
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={evaluating || !studentAnswer}
                  className="w-full bg-cyan-400 hover:bg-white text-slate-900 py-5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-sm transition-all disabled:opacity-20 flex items-center justify-center gap-4 shadow-xl shadow-cyan-400/10 cursor-pointer font-bold animate-glow"
                >
                  {evaluating ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                  Commence AI Analysis
                </button>
              </div>
            )}
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-10"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ 
                  opacity: 1, 
                  x: 0,
                  boxShadow: result.score >= 8 
                    ? ["0 0 50px rgba(34,211,238,0.2)", "0 0 80px rgba(34,211,238,0.5)", "0 0 50px rgba(34,211,238,0.2)"] 
                    : "0 0 50px rgba(34,211,238,0.2)"
                }}
                transition={{ 
                  opacity: { delay: 0.2 },
                  x: { delay: 0.2 },
                  boxShadow: { repeat: Infinity, duration: 3 }
                }}
                className="bg-cyan-400 rounded-[2.5rem] p-10 text-slate-900"
              >
                <div className="flex items-center gap-5 mb-6">
                  <motion.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', delay: 0.4 }}
                  >
                    <Award size={48} className="text-slate-900/40" />
                  </motion.div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-slate-900/50 text-[10px] font-black uppercase tracking-[0.2em]">Cognitive Score</p>
                      {result.score >= 8 && (
                        <motion.span 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="px-2 py-0.5 bg-slate-900 text-[8px] font-black text-white uppercase tracking-tighter rounded"
                        >
                          Exceptional
                        </motion.span>
                      )}
                    </div>
                    <motion.h3 
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 200, delay: 0.5 }}
                      className="text-6xl font-black tracking-tighter flex items-end gap-1"
                    >
                      {result.score}
                      <span className="text-2xl text-slate-900/30 mb-2">/10</span>
                      {result.score >= 8 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: [0, 1, 1, 0], scale: [0, 1.5, 1.5, 2], y: [0, -20, -40, -60] }}
                          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                          className="text-4xl pointer-events-none"
                        >
                          ✨
                        </motion.div>
                      )}
                    </motion.h3>
                  </div>
                </div>
                <div className="h-[2px] bg-slate-900/10 w-full mb-6" />
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="text-slate-800 text-lg leading-relaxed font-bold italic"
                >
                  "{result.feedback}"
                </motion.p>
              </motion.div>
              
              <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-[2.5rem] p-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-cyan-400/10 flex items-center justify-center text-cyan-400">
                    <CheckCircle2 size={24} />
                  </div>
                  <h4 className="font-black text-sm uppercase tracking-widest text-white/40">Reference Matrix</h4>
                </div>
                <p className="text-white text-lg leading-relaxed font-medium">
                  {result.correctAnswer}
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div className="p-10 bg-white/5 rounded-[3rem] border border-white/10 backdrop-blur-2xl">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                      <BookOpen size={20} />
                    </div>
                    <h5 className="font-black uppercase tracking-[0.2em] text-xs text-white/40">Neural Expansion</h5>
                  </div>
                  <div className="flex items-center gap-6">
                    <button 
                      onClick={() => toggleSpeak(helpText['explain'] || result.explanation)}
                      className={`flex items-center gap-2 ${isPlayingVoice ? 'text-red-400' : 'text-cyan-400'} text-xs font-black uppercase tracking-widest hover:text-white transition-all group cursor-pointer font-bold`}
                    >
                      {isPlayingVoice ? (
                        <>
                          Stop Voice <MicOff size={16} />
                        </>
                      ) : (
                        <>
                          Listen Out Loud <Volume2 size={16} className="group-hover:scale-110 transition-transform" />
                        </>
                      )}
                      {isPlayingVoice && (
                        <div className="flex items-center gap-0.5 h-3 ml-1">
                          {[1, 2, 3].map(i => (
                            <motion.div
                              key={i}
                              className="w-0.5 bg-red-400 rounded-full"
                              animate={{ height: [4, 12, 4] }}
                              transition={{ repeat: Infinity, duration: 0.5 + i * 0.1, ease: 'linear' }}
                            />
                          ))}
                        </div>
                      )}
                    </button>

                    <button 
                      onClick={() => handleHelp('explain')}
                      className="flex items-center gap-2 text-cyan-400 text-xs font-black uppercase tracking-widest hover:text-white transition-all group cursor-pointer font-bold"
                    >
                      Explain Further <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
                <div className="prose prose-invert max-w-none">
                   {(helpLoading === 'explain') ? (
                     <div className="flex items-center gap-3 text-white/20">
                       <Loader2 className="animate-spin" size={18} />
                       <span className="text-[10px] font-black uppercase tracking-widest">Synthesizing Logic...</span>
                     </div>
                   ) : (
                     <p className="text-white/70 text-lg leading-relaxed font-medium">
                       {helpText['explain'] || result.explanation}
                     </p>
                   )}
                </div>
              </div>

              <div className="p-10 bg-slate-900/50 backdrop-blur-3xl rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-400/10 flex items-center justify-center text-cyan-400">
                      <Globe size={20} />
                    </div>
                    <h5 className="font-black uppercase tracking-[0.2em] text-xs text-white/30">Language Synthesizer</h5>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['Hindi', 'Telugu', 'Tamil', 'Kannada', 'Bengali', 'Spanish', 'French', 'German', 'Japanese', 'Chinese'].map((lang) => (
                      <button
                        key={lang}
                        onClick={() => handleHelp('translate', lang)}
                        disabled={helpLoading === `translate-${lang}`}
                        className="px-4 py-2 bg-white/5 hover:bg-cyan-400 hover:text-slate-900 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-20 active:scale-95"
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-6">
                  <AnimatePresence mode="wait">
                    {helpLoading?.startsWith('translate') ? (
                      <motion.div 
                        key="loading"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-3 text-white/20 p-4"
                      >
                        <Loader2 className="animate-spin" size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Reconfiguring Syntax...</span>
                      </motion.div>
                    ) : (
                      Object.keys(helpText).filter(k => k.startsWith('translate')).map(k => (
                        <motion.div 
                          key={k}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          className="p-6 bg-white/5 rounded-2xl border border-white/5 accent-glow"
                        >
                          <div className="flex items-center gap-2 mb-3">
                             <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                             <p className="text-[9px] uppercase font-black text-cyan-400 tracking-[0.3em]">{k.split('-')[1]}</p>
                          </div>
                          <p className="text-white font-medium text-lg leading-relaxed">{helpText[k]}</p>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
                
                {/* Background decorative grad */}
                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-cyan-400/5 rounded-full blur-[100px]" />
              </div>
            </div>

            <button
              onClick={handleNextQuestion}
              className="w-full flex items-center justify-center gap-4 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-900 font-extrabold py-6 px-10 rounded-[2rem] transition-all duration-500 shadow-2xl hover:scale-[1.02] active:scale-[0.98] uppercase tracking-[0.3em] text-xs cursor-pointer"
            >
              <ChevronRight size={20} />
              {currentIdx + 1 < questionCount 
                ? `Next Challenge (${currentIdx + 2} of ${questionCount})` 
                : 'Finalize Calibration Report'}
            </button>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showHistory && (
          <HistoryOverlay 
            history={history} 
            onClose={() => setShowHistory(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryOverlay({ history, onClose }: { history: HistoryItem[], onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    container: scrollRef
  });

  const backgroundY1 = useTransform(scrollYProgress, [0, 1], [0, -150]);
  const backgroundY2 = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const backgroundRotate = useTransform(scrollYProgress, [0, 1], [0, 15]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 pointer-events-none"
    >
      <div 
        className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl pointer-events-auto"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="relative w-full max-w-4xl bg-slate-900 border border-white/10 rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto"
      >
        <div className="p-8 border-b border-white/10 flex items-center justify-between bg-white/5 relative z-20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-400/10 flex items-center justify-center text-cyan-400">
              <History size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight uppercase">Cognitive Evolution Logs</h3>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Retrieved from neural memory</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all"
          >
            <X size={20} />
          </button>
        </div>
        
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar relative">
          {/* Parallax Background Elements */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
            <motion.div 
              style={{ y: backgroundY1, rotate: backgroundRotate }}
              className="absolute -top-20 -right-20 text-[20rem] font-black text-white/[0.02] leading-none whitespace-nowrap"
            >
              DATA
            </motion.div>
            <motion.div 
              style={{ y: backgroundY2 }}
              className="absolute top-1/2 -left-20 text-[15rem] font-black text-cyan-400/[0.01] leading-none whitespace-nowrap"
            >
              LOGS
            </motion.div>
          </div>

          <div className="relative z-10 space-y-6">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/20">
                <History size={48} className="mb-4 opacity-50" />
                <p className="font-black uppercase tracking-widest text-xs">No entries found in current sequence</p>
              </div>
            ) : (
              history.map((item, idx) => (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={item.id}
                  className="group p-8 bg-white/5 border border-white/5 hover:border-cyan-400/30 rounded-[2.5rem] transition-all relative overflow-hidden"
                >
                  <div className="flex flex-col md:flex-row gap-8 relative z-10">
                    <div className="flex-1 space-y-6">
                        <div className="flex flex-col items-start gap-1">
                          <span className="px-3 py-1 bg-white/10 rounded-lg text-[9px] font-black text-white/60 uppercase tracking-widest">
                            Node {history.length - idx}
                          </span>
                          <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">
                            {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString() : new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <span className="px-3 py-1 bg-cyan-400/10 rounded-lg text-[9px] font-black text-cyan-400 uppercase tracking-widest">
                          {item.mode}
                        </span>
                      
                      <div className="space-y-4">
                        <h4 className="text-lg font-black text-white leading-tight">
                          {item.question}
                        </h4>
                        <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                          <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-2">Subject Input</p>
                          <p className="text-white/80 italic font-medium">"{item.studentAnswer}"</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="w-full md:w-64 space-y-4">
                      <motion.div 
                        whileInView={{ scale: [0.9, 1.1, 1], rotate: [0, -2, 2, 0] }}
                        viewport={{ once: true }}
                        className={`p-6 rounded-[2rem] flex flex-col items-center justify-center ${item.result.score >= 8 ? 'bg-cyan-400' : item.result.score >= 5 ? 'bg-indigo-500' : 'bg-red-500/80'} text-slate-900 shadow-xl`}
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-900/50 mb-1">Score</span>
                        <span className="text-4xl font-black">{item.result.score}<span className="text-lg opacity-40">/10</span></span>
                      </motion.div>
                      
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1 text-center">Feedback Snapshot</p>
                        <p className="text-xs text-white/60 font-bold leading-relaxed text-center italic line-clamp-3">
                          "{item.result.feedback}"
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-white/5">
                      <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-3">AI Synthesis</p>
                      <p className="text-sm text-white/50 leading-relaxed font-medium">
                        {item.result.explanation}
                      </p>
                  </div>
                  
                  {/* Decor grad */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/5 blur-[50px] group-hover:bg-cyan-400/10 transition-colors" />
                </motion.div>
              ))
            )}
          </div>
        </div>
        
        <div className="p-6 bg-white/5 border-t border-white/10 text-center relative z-20">
            <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">End of Log Sequence</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface LedgerRowProps {
  key?: any;
  scoreItem: {
    question: string;
    score: number;
    studentAnswer: string;
    correctAnswer: string;
    feedback: string;
    explanation: string;
    mode: string;
  };
  index: number;
}

function LedgerRow({ scoreItem, index }: LedgerRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      className="p-6 bg-white/5 border border-white/5 hover:border-white/10 rounded-2xl transition-all text-left"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[250px] space-y-2">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 bg-white/10 rounded text-[8px] font-black text-white/40 uppercase tracking-widest font-mono">
              Query {index + 1}
            </span>
            <span className="px-2 py-0.5 bg-cyan-400/10 rounded text-[8px] font-black text-cyan-400 uppercase tracking-widest font-mono">
              {scoreItem.mode.toUpperCase()}
            </span>
          </div>
          <h4 className="text-md font-bold text-white leading-tight">
            {scoreItem.question}
          </h4>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-2xl font-black text-cyan-400 font-mono">{scoreItem.score}</span>
            <span className="text-[10px] text-white/20 font-black ml-1 font-mono">/10</span>
          </div>
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-cyan-400/80 hover:text-cyan-400 transition-all cursor-pointer font-bold"
          >
            {isExpanded ? "Collapse" : "Explain"}
          </button>
        </div>
      </div>

      {isExpanded && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-6 pt-6 border-t border-white/5 space-y-4 text-xs leading-relaxed"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-950/40 rounded-xl border border-white/5">
              <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] block mb-2 font-mono">Subject Input</span>
              <p className="italic text-white/70">"{scoreItem.studentAnswer}"</p>
            </div>
            <div className="p-4 bg-cyan-950/20 rounded-xl border border-cyan-400/5">
              <span className="text-[8px] font-black text-cyan-400/50 uppercase tracking-[0.2em] block mb-2 font-mono">Reference Answer</span>
              <p className="text-cyan-300 font-medium">"{scoreItem.correctAnswer}"</p>
            </div>
          </div>

          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] block mb-2 font-mono">AI Critique & Feedback</span>
            <p className="text-white/60 font-bold mb-2">"{scoreItem.feedback}"</p>
            <hr className="my-2 border-white/5" />
            <p className="text-white/80 font-medium text-white/70 leading-relaxed font-sans">{scoreItem.explanation}</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
