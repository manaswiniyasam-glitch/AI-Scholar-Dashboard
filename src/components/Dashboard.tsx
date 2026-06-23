import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db, logout, auth } from '../lib/firebase';
import { 
  GraduationCap, Book, Layers, Lightbulb, 
  CheckCircle, MessageSquare, Mic, LogOut,
  ChevronRight, ArrowLeft, Loader2, User as UserIcon, RotateCcw,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QuestionView } from './QuestionView';
import { UserLedger } from './UserLedger';
import { TutorChat } from './TutorChat';

interface Item {
  id: string;
  name: string;
}

export function Dashboard() {
  const [step, setStep] = useState<'year' | 'subject' | 'unit' | 'topic' | 'difficulty' | 'mode' | 'question'>('year');
  const [selections, setSelections] = useState({
    year: '',
    yearName: '',
    subject: '',
    subjectName: '',
    unit: '',
    unitName: '',
    topic: '',
    topicName: '',
    difficulty: '' as 'easy' | 'medium' | 'hard',
    mode: '' as 'mcq' | 'qa' | 'voice'
  });

  const [items, setItems] = useState<Item[]>([]);
  const [progressMap, setProgressMap] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [showLedger, setShowLedger] = useState(false);

  const calculateProgress = async (itemsToProcess: Item[], type: string) => {
    if (!auth.currentUser) return;
    const newProgressMap: { [key: string]: number } = {};
    
    try {
      // Get all user progress
      const progressSnap = await getDocs(query(collection(db, 'user_progress'), where('uid', '==', auth.currentUser.uid)));
      const completedTopicIds = new Set(progressSnap.docs.map(d => d.data().topicId));

      for (const item of itemsToProcess) {
        if (type === 'subject') {
          // Get units for this subject
          const unitsSnap = await getDocs(query(collection(db, 'units'), where('subjectId', '==', item.id)));
          const unitIds = unitsSnap.docs.map(d => d.id);
          
          if (unitIds.length === 0) {
            newProgressMap[item.id] = 0;
            continue;
          }

          // Get topics for these units
          const topicsSnap = await getDocs(query(collection(db, 'topics'), where('unitId', 'in', unitIds)));
          
          // Group topics by unit to check per-unit completion
          const topicsByUnit: { [key: string]: string[] } = {};
          topicsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (!topicsByUnit[data.unitId]) topicsByUnit[data.unitId] = [];
            topicsByUnit[data.unitId].push(doc.id);
          });

          let completedUnitsCount = 0;
          unitIds.forEach(uId => {
            const unitTopics = topicsByUnit[uId] || [];
            if (unitTopics.length > 0 && unitTopics.every(tId => completedTopicIds.has(tId))) {
              completedUnitsCount++;
            }
          });

          newProgressMap[item.id] = Math.round((completedUnitsCount / unitIds.length) * 100);
        } else if (type === 'unit') {
          // Get topics for this unit
          const topicsSnap = await getDocs(query(collection(db, 'topics'), where('unitId', '==', item.id)));
          const totalTopicsCount = topicsSnap.docs.length;
          const completedTopicsCount = topicsSnap.docs.filter(d => completedTopicIds.has(d.id)).length;
          newProgressMap[item.id] = totalTopicsCount > 0 ? Math.round((completedTopicsCount / totalTopicsCount) * 100) : 0;
        }
      }
      setProgressMap(newProgressMap);
    } catch (err) {
      console.error('Progress calculation failed:', err);
    }
  };

  useEffect(() => {
    // Initial check and seed if needed
    const setup = async () => {
      setLoading(true);
      try {
        const yearsSnap = await getDocs(collection(db, 'years'));
        
        // Helper to find or create document
        const getOrCreateDoc = async (colName: string, queryConstraints: any[], dataToCreate: any) => {
          const snap = await getDocs(query(collection(db, colName), ...queryConstraints));
          if (!snap.empty) {
            return snap.docs[0].id;
          }
          const docRef = await addDoc(collection(db, colName), dataToCreate);
          return docRef.id;
        };

        // Ensure all four academic years are created in database
        const y1Id = await getOrCreateDoc('years', [where('name', '==', '1st Year')], { name: '1st Year' });
        const y2Id = await getOrCreateDoc('years', [where('name', '==', '2nd Year')], { name: '2nd Year' });
        const y3Id = await getOrCreateDoc('years', [where('name', '==', '3rd Year')], { name: '3rd Year' });
        const y4Id = await getOrCreateDoc('years', [where('name', '==', '4th Year')], { name: '4th Year' });

        // High-fidelity structured curriculum database schema mapping
        const curriculum = [
          // ==============================
          // 1ST YEAR SUBJECTS
          // ==============================
          {
            name: 'Mathematics I',
            yearId: y1Id,
            units: [
              { order: 1, name: 'Unit 1: Calculus Foundations', topics: ['Limits, Continuity & Derivative', 'Taylor and Maclaurin Series'] },
              { order: 2, name: 'Unit 2: Linear Algebra', topics: ['Matrices, Determinants & Row Operations', 'Eigenvalues & Eigenvectors'] },
              { order: 3, name: 'Unit 3: Vector Spaces', topics: ['Dot/Cross Product & Gradients', 'Divergence, Curl & Green Theorems'] }
            ]
          },
          {
            name: 'Physics Essentials',
            yearId: y1Id,
            units: [
              { order: 1, name: 'Unit 1: Classical Mechanics', topics: ['Newtons Laws & Kinematics', 'Conservation of Energy & Momentum'] },
              { order: 2, name: 'Unit 2: Electromagnetism', topics: ['Coulombs Law & Gauss Law', 'Faradays Law & Maxwell Equations'] },
              { order: 3, name: 'Unit 3: Wave Optics & Quantum', topics: ['Interference & Diffraction of Light', 'Photoelectric Effect & Wave-Particle Duality'] }
            ]
          },
          {
            name: 'C Programming',
            yearId: y1Id,
            units: [
              { order: 1, name: 'Unit 1: Syntax & Control Flow', topics: ['Data Types, Operators & Expressions', 'Conditional branching & Loops', 'Functional scopes & Recursion'] },
              { order: 2, name: 'Unit 2: Memory & Structures', topics: ['Pointers, Offsets & Address Arithmetic', 'Structures, Unions & Typedefs', 'Direct Stack vs Heap Memory Allocation'] },
              { order: 3, name: 'Unit 3: Low-Level Interfaces', topics: ['File IO streams & Bitwise Operators', 'Pre-processor Directives & Macro Definitions'] }
            ]
          },

          // ==============================
          // 2ND YEAR SUBJECTS
          // ==============================
          {
            name: 'Data Structures',
            yearId: y2Id,
            units: [
              { order: 1, name: 'Unit 1: Foundations of Linear Structures', topics: ['Memory Mapping & Pointers', 'Dynamic Arrays & Vector Implementation', 'Singly & Doubly Linked Lists', 'Stack and Queue Operations'] },
              { order: 2, name: 'Unit 2: Non-Linear Trees & Graphs', topics: ['Binary Search Tree (BST) Mechanics', 'AVL and Red-Black Trees Balancing', 'Max/Min Heaps & Huffman Coding', 'Graph BFS/DFS & Pathfinding'] },
              { order: 3, name: 'Unit 3: Advanced Indexing & Hashing', topics: ['Hash Table Collision & Open Addressing', 'Tries & Prefix Search Structures', 'B-Trees and B+ Trees Indexing', 'Segment Trees & Interval Queries'] }
            ]
          },
          {
            name: 'Algorithms',
            yearId: y2Id,
            units: [
              { order: 1, name: 'Unit 1: Algorithmic Complexity & Foundation', topics: ['Big-O, Big-Theta, Big-Omega Analysis', 'Solving Recurrence Relations', 'Brute-Force & Iterative Paradigms'] },
              { order: 2, name: 'Unit 2: Core Algorithm Paradigms', topics: ['Divide and Conquer (Merge & Quick Sort)', 'Greedy Algorithms (Dijkstra, Kruskal, Prim)', 'Dynamic Programming (Knapsack & Matrix Chain Multiplication)'] },
              { order: 3, name: 'Unit 3: Advanced Complexity & Intractability', topics: ['Backtracking & Branch and Bound Algorithms', 'NP-Completeness and Polynomial Reductions', 'Approximation and Randomized Algorithms'] }
            ]
          },
          {
            name: 'Digital Logic',
            yearId: y2Id,
            units: [
              { order: 1, name: 'Unit 1: Logic Gates & Combinational Design', topics: ['Boolean Algebra Theories & De Morgan', 'Karnaugh Maps (K-Maps) Logic Minimization', 'Adders, Subtractors, and ALUs', 'Decoders, Multiplexers, and Selectors'] },
              { order: 2, name: 'Unit 2: Sequential Circuits & Memory', topics: ['Latch vs Flip-flop (SR, JK, D, T)', 'Shift Registers & Digital Buffers', 'Asynchronous & Synchronous Counters'] },
              { order: 3, name: 'Unit 3: System Design & Architectures', topics: ['Mealy and Moore State Machines Synthesis', 'State Reduction and Race Conditions', 'Programmable Logic Devices (PLA & FPGA)'] }
            ]
          },

          // ==============================
          // 3RD YEAR SUBJECTS
          // ==============================
          {
            name: 'Operating Systems',
            yearId: y3Id,
            units: [
              { order: 1, name: 'Unit 1: Concurrency, Processes & Kernel', topics: ['Dual-mode CPU Execution & Monolithic Kernels', 'Process Control Blocks (PCB) & Context Switching', 'Multithreading Models & Forking', 'CPU Scheduling (Round Robin, SRTF)'] },
              { order: 2, name: 'Unit 2: Synchronization & Memory Management', topics: ['Semaphores, Mutexes, and Race Conditions', 'Classic Synchronization (Deadlock & Bankers)', 'Physical Memory Paging & Segmentation'] },
              { order: 3, name: 'Unit 3: Advanced Virt-Memory & Storage', topics: ['Virtual Memory & LRU/FIFO Page Replacement', 'Disk Head Scheduling (SCAN, C-LOOK)', 'File Allocation Tables & Inodes Structures'] }
            ]
          },
          {
            name: 'Artificial Intelligence',
            yearId: y3Id,
            units: [
              { order: 1, name: 'Unit 1: Cognitive Agents & Path Optimization', topics: ['PEAS Agent Architectures', 'Uninformed Searches (BFS, DFS, Iterative Deepening)', 'Heuristic Search (A* & Greedy Best-First)', 'Adversarial Games (Alpha-Beta Pruning)'] },
              { order: 2, name: 'Unit 2: Machine Intelligence & Logic', topics: ['Constraint Satisfaction Problems (CSP)', 'Propositional & First-Order Knowledge Bases', 'Bayesian Networks & Probabilistic Inference', 'Markov Decision Processes (MDP)'] },
              { order: 3, name: 'Unit 3: Adaptive Systems & Learning', topics: ['Q-Learning & Policy Iteration', 'Artificial Neural Networks & Backpropagation', 'Genetic Optimization & Natural Selection Methods'] }
            ]
          },
          {
            name: 'Database Management',
            yearId: y3Id,
            units: [
              { order: 1, name: 'Unit 1: Relational Schemas & SQL Matrix', topics: ['3-Schema Architecture & Data Independence', 'Relational Algebra Expressions & Joins', 'Advanced SQL Subqueries & CTEs', 'Entity-Relationship (ER) Mapping'] },
              { order: 2, name: 'Unit 2: Normalization & Index Mechanics', topics: ['Functional Dependencies Rules', 'Normal Forms (1NF, 2NF, 3NF, BCNF)', 'Tree Indexing (B-Tree & B+ Tree)', 'Static & Extendible Hashing Index'] },
              { order: 3, name: 'Unit 3: Transaction Processing & Storage', topics: ['ACID Transactions & Schedules Isolation', 'Two-Phase Locking (2PL) Concurrency Control', 'Write-Ahead Logging & System Crash Recovery', 'Distributed Databases & CAP Theorem'] }
            ]
          },

          // ==============================
          // 4TH YEAR SUBJECTS
          // ==============================
          {
            name: 'Cloud Computing',
            yearId: y4Id,
            units: [
              { order: 1, name: 'Unit 1: Virtualization & Microservices', topics: ['Hypervisors vs Containerization Basics', 'Docker Container Engines', 'Kubernetes Cluster Pods Orchestration'] },
              { order: 2, name: 'Unit 2: Distributed Serverless', topics: ['FaaS & Trigger Event Listeners', 'Auto-scaling Policies & Web Sockets'] },
              { order: 3, name: 'Unit 3: Hybrid Cloud Architecture', topics: ['Multi-tenant Security isolation', 'CDN Edge Caching Networks'] }
            ]
          },
          {
            name: 'Cyber Security',
            yearId: y4Id,
            units: [
              { order: 1, name: 'Unit 1: Cryptographic Foundations', topics: ['Symmetric vs Asymmetric Encryptions (AES/RSA)', 'Public Key Cryptography & PKI', 'Secure Hash Functions (SHA-256) & HMAC'] },
              { order: 2, name: 'Unit 2: Attack Vectors & Enumeration', topics: ['C & Assembly Buffer Overflows', 'SQL Injection & XSS Vulnerability', 'Malicious Port Scanning & Nmap'] },
              { order: 3, name: 'Unit 3: Network & Zero Trust Enterprise', topics: ['Firewall Access Control Lists (ACL)', 'IDS & IPS Deep Packet Inspections', 'Zero Trust Architecture Networks'] }
            ]
          },
          {
            name: 'Machine Learning',
            yearId: y4Id,
            units: [
              { order: 1, name: 'Unit 1: Supervised Regressions', topics: ['Linear & Logistic Regression Gradient Descent', 'Regularization (L1 Lasso, L2 Ridge)', 'Decision Trees & Information Gain'] },
              { order: 2, name: 'Unit 2: Support Vectors & Ensemble', topics: ['SVM Hyperplanes & Kernel Functions', 'Random Forests & Bagging Ensembles', 'Gradient Boosted Trees (XGBoost)'] },
              { order: 3, name: 'Unit 3: Deep Neural Architectures', topics: ['Perceptrons & Activation Functions', 'Convolutional Networks (CNN) for Images', 'Recurrent Networks (RNN) & Transformers'] }
            ]
          }
        ];

        // Seed each subject and its specific units & topics
        for (const subItem of curriculum) {
          const sId = await getOrCreateDoc('subjects', [
            where('name', '==', subItem.name), 
            where('yearId', '==', subItem.yearId)
          ], { 
            name: subItem.name, 
            yearId: subItem.yearId 
          });

          // Seed each unit and its distinct topics
          for (const unitItem of subItem.units) {
            const uId = await getOrCreateDoc('units', [
              where('name', '==', unitItem.name), 
              where('subjectId', '==', sId)
            ], { 
              name: unitItem.name, 
              subjectId: sId, 
              order: unitItem.order 
            });

            // Seed only the specific topics for this specific unit
            for (const topicName of unitItem.topics) {
              await getOrCreateDoc('topics', [
                where('name', '==', topicName), 
                where('unitId', '==', uId)
              ], { 
                name: topicName, 
                unitId: uId 
              });
            }
          }
        }
        
        await fetchItems('year', '');
      } catch (err) {
        console.error('Setup error:', err);
      } finally {
        setInitializing(false);
        setLoading(false);
      }
    };
    setup();
  }, []);

  const fetchItems = async (type: string, parentId: string) => {
    setLoading(true);
    try {
      let q;
      if (type === 'year') {
        // Only show 2nd and 3rd year as per request
        q = query(collection(db, 'years'), where('name', 'in', ['2nd Year', '3rd Year']));
      } else if (type === 'subject') {
        q = query(collection(db, 'subjects'), where('yearId', '==', parentId));
      } else if (type === 'unit') {
        q = query(collection(db, 'units'), where('subjectId', '==', parentId));
      } else if (type === 'topic') {
        q = query(collection(db, 'topics'), where('unitId', '==', parentId));
      }

      if (q) {
        const snap = await getDocs(q);
        const fetched = snap.docs.map(doc => {
          const data = doc.data() as any;
          return { id: doc.id, name: data.name };
        });
        
        // Deduplicate by name if fetching years to handle potential database duplicates
        const uniqueFetched = type === 'year' 
          ? fetched.filter((item, index, self) => 
              index === self.findIndex((t) => t.name === item.name)
            )
          : fetched;

        setItems(uniqueFetched);
        
        if (type === 'subject' || type === 'unit') {
          calculateProgress(uniqueFetched, type);
        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (item: Item) => {
    setLoading(true); // Immediate feedback
    if (step === 'year') {
      setSelections(prev => ({ ...prev, year: item.id, yearName: item.name }));
      setStep('subject');
      fetchItems('subject', item.id);
    } else if (step === 'subject') {
      setSelections(prev => ({ ...prev, subject: item.id, subjectName: item.name }));
      setStep('unit');
      fetchItems('unit', item.id);
    } else if (step === 'unit') {
      setSelections(prev => ({ ...prev, unit: item.id, unitName: item.name }));
      setStep('topic');
      fetchItems('topic', item.id);
    } else if (step === 'topic') {
      setSelections(prev => ({ ...prev, topic: item.id, topicName: item.name }));
      setStep('difficulty');
      setLoading(false);
    }
  };

  const handleDifficultySelect = (difficulty: 'easy' | 'medium' | 'hard') => {
    setSelections(prev => ({ ...prev, difficulty }));
    setStep('mode');
  };

  const handleModeSelect = (mode: 'mcq' | 'qa' | 'voice') => {
    setSelections(prev => ({ ...prev, mode }));
    setStep('question');
  };

  const goBack = () => {
    const steps: any = ['year', 'subject', 'unit', 'topic', 'difficulty', 'mode', 'question'];
    const currentIdx = steps.indexOf(step);
    if (currentIdx > 0) {
      const prevStep = steps[currentIdx - 1];
      setStep(prevStep);
      
      // Refetch for prev step
      if (prevStep === 'year') fetchItems('year', '');
      if (prevStep === 'subject') fetchItems('subject', selections.year);
      if (prevStep === 'unit') fetchItems('unit', selections.subject);
      if (prevStep === 'topic') fetchItems('topic', selections.unit);
    }
  };

  const jumpToStep = (targetStep: typeof step) => {
    const stepsOrder: (typeof step)[] = ['year', 'subject', 'unit', 'topic', 'difficulty', 'mode', 'question'];
    const targetIdx = stepsOrder.indexOf(targetStep);
    const currentIdx = stepsOrder.indexOf(step);
    
    if (targetIdx >= currentIdx) return;

    setStep(targetStep);
    
    // Clear selections beyond target
    setSelections(prev => {
      const next = { ...prev };
      if (targetIdx <= 0) { 
        next.year = ''; next.yearName = '';
        next.subject = ''; next.subjectName = '';
        next.unit = ''; next.unitName = '';
        next.topic = ''; next.topicName = '';
        next.difficulty = '' as any;
        next.mode = '' as any;
        fetchItems('year', '');
      } else if (targetIdx === 1) {
        next.subject = ''; next.subjectName = '';
        next.unit = ''; next.unitName = '';
        next.topic = ''; next.topicName = '';
        next.difficulty = '' as any;
        next.mode = '' as any;
        fetchItems('subject', selections.year);
      } else if (targetIdx === 2) {
        next.unit = ''; next.unitName = '';
        next.topic = ''; next.topicName = '';
        next.difficulty = '' as any;
        next.mode = '' as any;
        fetchItems('unit', selections.subject);
      } else if (targetIdx === 3) {
        next.topic = ''; next.topicName = '';
        next.difficulty = '' as any;
        next.mode = '' as any;
        fetchItems('topic', selections.unit);
      } else if (targetIdx === 4) {
        next.difficulty = '' as any;
        next.mode = '' as any;
      } else if (targetIdx === 5) {
        next.mode = '' as any;
      }
      return next;
    });
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-transparent">
        <Loader2 size={64} className="text-cyan-400 animate-spin mb-6" />
        <p className="text-white/40 font-black uppercase tracking-[0.4em] text-sm">Synchronizing Intelligence</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* Header */}
      <header className="bg-white/5 backdrop-blur-3xl border-b border-white/10 sticky top-0 z-50 accent-glow">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-400 flex items-center justify-center text-slate-900 shadow-xl shadow-cyan-400/20">
              <GraduationCap size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tighter leading-none">AI Scholar</h1>
              <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[0.3em] mt-1">Personalized Nexus</p>
            </div>
          </div>
          
          <div className="flex items-center gap-8">
            <div className="hidden lg:flex items-center gap-10 mr-10">
              <div className="text-right">
                <p className="text-[9px] text-white/30 font-black uppercase tracking-widest leading-none mb-1">Knowledge Nodes</p>
                <p className="text-sm font-black text-white">42 Active</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-white/30 font-black uppercase tracking-widest leading-none mb-1">System Health</p>
                <div className="flex items-center gap-2 justify-end">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <p className="text-sm font-black text-cyan-400">Optimum</p>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <button 
                onClick={() => setShowLedger(true)}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20 hover:border-cyan-400/50 hover:bg-cyan-400/10 transition-all mr-2 group"
                title="Scholar Ledger"
              >
                <Users size={20} className="text-white/60 group-hover:text-cyan-400" />
              </button>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                <UserIcon size={20} className="text-cyan-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black text-white leading-none">{auth.currentUser?.displayName?.split(' ')[0] || 'Scholar'}</span>
                <span className="text-[9px] text-white/40 font-bold uppercase tracking-wider mt-1">Authorized</span>
              </div>
            </div>
            <button 
              onClick={() => logout()}
              className="flex items-center gap-2 text-white/40 hover:text-red-400 font-black text-xs uppercase tracking-widest transition-all hover:scale-105"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Terminate Session</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-12">
        <AnimatePresence mode="wait">
          {showLedger && (
            <UserLedger onClose={() => setShowLedger(false)} />
          )}
          {step === 'question' ? (
            <motion.div
              key="question"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
            >
              <QuestionView 
                topicId={selections.topic}
                topicName={selections.topicName}
                subjectName={selections.subjectName}
                unitName={selections.unitName}
                difficulty={selections.difficulty}
                mode={selections.mode}
                onBack={goBack}
              />
            </motion.div>
          ) : (
            <motion.div
              key="navigation"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-5xl mx-auto w-full"
            >
              {/* Navigation Header */}
              <div className="mb-14">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-2 mb-10 overflow-x-auto no-scrollbar pb-4">
                  {[
                    { step: 'year' as const, label: 'Nexus', value: selections.yearName || 'Targeting...' },
                    { step: 'subject' as const, label: 'Level', value: selections.subjectName },
                    { step: 'unit' as const, label: 'Module', value: selections.unitName },
                    { step: 'topic' as const, label: 'Sector', value: selections.topicName },
                    { step: 'difficulty' as const, label: 'Complexity', value: selections.difficulty?.toUpperCase() },
                    { step: 'mode' as const, label: 'Mode', value: selections.mode?.toUpperCase() }
                  ].map((crumb, idx) => {
                    const stepsOrder: (typeof step)[] = ['year', 'subject', 'unit', 'topic', 'difficulty', 'mode', 'question'];
                    const currentStepIdx = stepsOrder.indexOf(step);
                    const crumbStepIdx = stepsOrder.indexOf(crumb.step);
                    const isCurrent = step === crumb.step;
                    const isClickable = crumbStepIdx < currentStepIdx;
                    const isFuture = crumbStepIdx > currentStepIdx;

                    if (isFuture && !crumb.value && crumbStepIdx > currentStepIdx + 1) return null;

                    return (
                      <React.Fragment key={crumb.step}>
                        {idx > 0 && crumbStepIdx <= currentStepIdx && (
                          <ChevronRight size={14} className="text-white/10 shrink-0" />
                        )}
                        <button
                          onClick={() => {
                            if (isClickable) jumpToStep(crumb.step);
                          }}
                          disabled={isCurrent || (!isClickable && !isCurrent)}
                          className={`flex flex-col items-start px-5 py-3 rounded-2xl transition-all duration-300 border group shrink-0 ${
                            isCurrent 
                              ? 'bg-cyan-400 border-cyan-400 text-slate-900 shadow-xl shadow-cyan-400/20 scale-105 z-10' 
                              : isClickable
                                ? 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/30 cursor-pointer active:scale-95'
                                : 'bg-transparent border-white/5 text-white/10 cursor-not-allowed opacity-50'
                          }`}
                        >
                          <span className={`text-[8px] font-black uppercase tracking-[0.2em] mb-1 ${isCurrent ? 'text-slate-900/60' : 'text-white/30 group-hover:text-white/50'}`}>
                            {crumb.label}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                            {isCurrent ? 'Active' : (crumb.value || 'Pending')}
                          </span>
                        </button>
                      </React.Fragment>
                    );
                  })}
                  
                  {step !== 'year' && (
                    <button
                      onClick={() => jumpToStep('year')}
                      className="ml-auto flex flex-col items-center justify-center px-4 py-3 bg-red-400/10 border border-red-400/20 rounded-2xl text-red-400 hover:bg-red-400 hover:text-white transition-all text-[8px] font-black uppercase tracking-widest active:scale-95"
                    >
                      <RotateCcw size={12} className="mb-1" />
                      Reset Flow
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-6 mb-6">
                  {step !== 'year' && (
                    <button 
                      onClick={goBack}
                      className="p-3 bg-white/5 hover:bg-cyan-400 hover:text-slate-900 rounded-full border border-white/10 transition-all text-white/40 hover:scale-110 active:scale-95"
                    >
                      <ArrowLeft size={24} />
                    </button>
                  )}
                  <h2 className="text-5xl md:text-7xl font-black text-white tracking-[ -0.05em] leading-none">
                    {step === 'year' && "Level Selection"}
                    {step === 'subject' && "Module Matrix"}
                    {step === 'unit' && "Structural Units"}
                    {step === 'topic' && "Knowledge Nodes"}
                    {step === 'difficulty' && "Complexity Analysis"}
                    {step === 'mode' && "Protocol Interface"}
                  </h2>
                </div>
                <div className="h-1 w-24 bg-cyan-400 rounded-full mb-6 accent-glow" />
                <p className="text-white/40 text-xl font-medium leading-relaxed max-w-3xl">
                  {step === 'year' && "Initialize your academic trajectory by selecting your current organizational tier."}
                  {step === 'subject' && `Active Level: ${selections.year}. Decrypting available domain modules.`}
                  {step === 'unit' && `Subject Archive: ${selections.subjectName}. Accessing hierarchical unit protocols.`}
                  {step === 'topic' && `Unit Archive: ${selections.unitName}. Mapping specific knowledge nodes.`}
                  {step === 'difficulty' && "Calibrate the logical density of the evaluation parameters."}
                  {step === 'mode' && "Select a cognitive evaluation interface for the AI-powered verification."}
                </p>
              </div>

              {/* Grid Items */}
              {loading ? (
                <div className="flex flex-col items-center justify-center p-20 py-48">
                  <div className="relative">
                    <Loader2 size={64} className="text-cyan-400 animate-spin" />
                    <div className="absolute inset-0 bg-cyan-400/20 blur-2xl animate-pulse" />
                  </div>
                  <p className="font-black uppercase tracking-[0.5em] text-[10px] text-white/30 mt-8">Decrypting Wisdom</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6 pb-20">
                  {step === 'difficulty' ? (
                    <>
                      <ModeButton 
                        title="Novice" 
                        desc="Fundamental conceptual check"
                        icon={<Lightbulb size={28} />}
                        color="bg-emerald-500"
                        onClick={() => handleDifficultySelect('easy')}
                      />
                      <ModeButton 
                        title="Scholar" 
                        desc="Balanced logical evaluation"
                        icon={<Book size={28} />}
                        color="bg-amber-500"
                        onClick={() => handleDifficultySelect('medium')}
                      />
                      <ModeButton 
                        title="Expert" 
                        desc="Advanced edge-case synthesis"
                        icon={<GraduationCap size={28} />}
                        color="bg-rose-500"
                        onClick={() => handleDifficultySelect('hard')}
                      />
                    </>
                  ) : step === 'mode' ? (
                    <>
                      <ModeButton 
                        title="Quick MCQ" 
                        desc="Neural pattern recognition challenge"
                        icon={<CheckCircle size={28} />}
                        color="bg-cyan-500"
                        onClick={() => handleModeSelect('mcq')}
                      />
                      <ModeButton 
                        title="Cognitive Q&A" 
                        desc="Deep expressive logical articulation"
                        icon={<MessageSquare size={28} />}
                        color="bg-indigo-500"
                        onClick={() => handleModeSelect('qa')}
                      />
                      <ModeButton 
                        title="Acoustic Voice" 
                        desc="Verbal resonance and speech integration"
                        icon={<Mic size={28} />}
                        color="bg-fuchsia-500"
                        onClick={() => handleModeSelect('voice')}
                      />
                    </>
                  ) : (
                    items.map((item, idx) => (
                      <NavItem 
                        key={item.id}
                        title={item.name}
                        icon={
                          step === 'year' ? <GraduationCap size={28} /> :
                          step === 'subject' ? <Book size={28} /> :
                          step === 'unit' ? <Layers size={28} /> :
                          <Lightbulb size={28} />
                        }
                        delay={idx * 0.05}
                        progress={(step === 'subject' || step === 'unit') ? progressMap[item.id] : undefined}
                        onClick={() => handleSelect(item)}
                      />
                    ))
                  )}
                  
                  {!items.length && step !== 'mode' && (
                    <div className="col-span-full p-24 text-center bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl">
                       <p className="text-white/40 font-black uppercase tracking-widest">No Sector Data Available</p>
                       <button onClick={goBack} className="mt-6 text-cyan-400 font-black border-b-2 border-cyan-400 pb-1 hover:text-white hover:border-white transition-all uppercase tracking-widest text-xs">Re-calibrate Navigation</button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <TutorChat selections={selections} />
    </div>
  );
}

interface NavItemProps {
  key?: React.Key;
  title: string;
  icon: React.ReactNode;
  progress?: number;
  onClick: () => void;
  delay: number;
}

function NavItem({ title, icon, progress, onClick, delay }: NavItemProps) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      onClick={onClick}
      className="group flex flex-col p-8 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 hover:border-cyan-400/50 hover:bg-cyan-400 transition-all duration-500 text-left relative overflow-hidden accent-glow active:scale-[0.98]"
    >
      <div className="flex items-center gap-6 w-full mb-6">
        <div className="w-16 h-16 rounded-2xl bg-white/10 group-hover:bg-slate-900 flex items-center justify-center text-cyan-400 group-hover:text-cyan-400 transition-all duration-500 shadow-xl">
          {icon}
        </div>
        <div className="flex-1 relative z-10">
          <h3 className="font-black text-white group-hover:text-slate-900 text-2xl tracking-tighter transition-all duration-500">{title}</h3>
          <p className="text-white/30 group-hover:text-slate-900/60 text-[10px] font-black uppercase tracking-[0.3em] mt-2 transition-all duration-500">Initialize Module</p>
        </div>
        <ChevronRight size={24} className="text-white/10 group-hover:text-slate-900 transition-all duration-500 group-hover:translate-x-2" />
      </div>

      {progress !== undefined && (
        <div className="w-full space-y-4 mt-auto">
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 group-hover:text-slate-900/40 mb-1">Knowledge Mastery</span>
              <span className="text-[11px] font-black text-white group-hover:text-slate-900 uppercase">
                {progress === 100 ? 'Module Complete' : progress > 0 ? 'Protocol in Progress' : 'Initial Calibration'}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-2xl font-black text-cyan-400 group-hover:text-slate-900 leading-none">
                {progress}<span className="text-[10px] opacity-50 ml-0.5">%</span>
              </span>
            </div>
          </div>
          <div className="h-3 w-full bg-white/5 group-hover:bg-slate-900/10 rounded-lg overflow-hidden border border-white/5 border-dashed group-hover:border-slate-900/10">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: 'spring', stiffness: 50, damping: 15 }}
              className="h-full bg-cyan-400 group-hover:bg-slate-900 relative" 
            >
              <div className="absolute inset-0 bg-white/20" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', backgroundSize: '200% 100%', animation: 'shimmer 2s infinite linear' }} />
            </motion.div>
          </div>
        </div>
      )}
      
      {/* Hover background effect */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-cyan-400 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500" />
    </motion.button>
  );
}

function ModeButton({ title, desc, icon, color, onClick }: { title: string, desc: string, icon: React.ReactNode, color: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden flex flex-col items-start p-10 bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 hover:border-white/40 transition-all duration-500 shadow-2xl text-left accent-glow active:scale-[0.98]"
    >
      <div className={`w-16 h-16 rounded-[1.25rem] ${color} flex items-center justify-center text-white mb-8 shadow-2xl shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-500`}>
        {icon}
      </div>
      <h3 className="text-3xl font-black text-white mb-3 tracking-tighter group-hover:text-cyan-400 transition-colors duration-500">{title}</h3>
      <p className="text-white/40 font-medium leading-relaxed max-w-[200px] group-hover:text-white transition-colors duration-500">{desc}</p>
      
      <div className="absolute right-0 bottom-0 p-8 opacity-5 group-hover:opacity-10 group-hover:rotate-12 transition-all duration-500 translate-x-4 translate-y-4">
        <div className="w-40 h-40 rounded-full border-8 border-white" />
      </div>
    </button>
  );
}
