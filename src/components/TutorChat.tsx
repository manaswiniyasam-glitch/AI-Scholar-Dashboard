import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, Send, X, Trash2, Sparkles, Brain, 
  RotateCcw, RefreshCw, HelpCircle, BookOpen, Clock, 
  CornerDownRight, Copy, Check, ChevronUp 
} from 'lucide-react';

interface SelectionState {
  year: string;
  yearName: string;
  subject: string;
  subjectName: string;
  unit: string;
  unitName: string;
  topic: string;
  topicName: string;
  difficulty: 'easy' | 'medium' | 'hard' | '';
  mode: 'mcq' | 'qa' | 'voice' | '';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface TutorChatProps {
  selections: SelectionState;
}

export function TutorChat({ selections }: TutorChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to check new messages
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Load initial welcome message based on the current selection context
  useEffect(() => {
    if (messages.length === 0) {
      triggerWelcomeMessage();
    }
  }, [selections.topicName, selections.subjectName]);

  const triggerWelcomeMessage = () => {
    let welcomeText = "Welcome, Scholar. I am your AI Academic Tutor. How can I facilitate your learning path today?";
    
    if (selections.topicName) {
      welcomeText = `Greetings, Scholar. I see you are currently examining the topic "${selections.topicName}". This falls under Unit: "${selections.unitName}" inside "${selections.subjectName}".\n\nI can explain the core intuition, provide relevant examples/code, or query you with a test concept. What would you like to explore?`;
    } else if (selections.subjectName) {
      welcomeText = `Greetings, Scholar. I see you are exploring the module "${selections.subjectName}". Ask me anything about this domain, its structural unit foundations, or practical engineering applications!`;
    } else if (selections.yearName) {
      welcomeText = `Hello. You are authenticated inside the "${selections.yearName}" track. Select any subject module to begin, or ask me broader computer science/mathematical foundation queries.`;
    }

    setMessages([
      {
        id: 'initial-welcome',
        role: 'assistant',
        content: welcomeText,
        timestamp: new Date()
      }
    ]);
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || loading) return;

    if (!textToSend) {
      setInputValue('');
    }

    const newUserMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newUserMessage]);
    setLoading(true);

    try {
      // Build the history representation to pass to the endpoint
      // Limit to last 8 messages for token budget
      const historyPayload = messages.slice(-8).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch('/api/chat-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          context: selections
        })
      });

      if (!res.ok) {
        throw new Error('Neural network downlink interrupted.');
      }

      const data = await res.json();
      
      const newBotMessage: Message = {
        id: Math.random().toString(36).substr(2, 9),
        role: 'assistant',
        content: data.text || 'Understood. Could you re-phrase the inquiry?',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, newBotMessage]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: 'error-' + Math.random().toString(36).substr(2, 9),
        role: 'assistant',
        content: err.message || 'System failed to fetch an evaluation, neural routing is congested.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    triggerWelcomeMessage();
  };

  const copyToClipboard = (text: string, blockId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(blockId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderContent = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      // Handle Code Block
      if (part.startsWith('```') && part.endsWith('```')) {
        const fullContent = part.slice(3, -3).trim();
        const firstNewLine = fullContent.indexOf('\n');
        let lang = 'code';
        let code = fullContent;
        if (firstNewLine !== -1 && firstNewLine < 15) {
          const possibleLang = fullContent.substring(0, firstNewLine).trim();
          if (possibleLang.match(/^[a-zA-Z0-9+#-_]+$/)) {
            lang = possibleLang;
            code = fullContent.substring(firstNewLine + 1).trim();
          }
        }

        const blockId = `code-block-${index}`;
        return (
          <div key={index} className="my-4 rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-5 font-mono text-xs overflow-x-auto text-cyan-300 relative group max-w-full">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/5">
              <span className="text-[9px] text-white/30 font-sans font-black uppercase tracking-widest">{lang}</span>
              <button 
                onClick={() => copyToClipboard(code, blockId)}
                className="opacity-40 group-hover:opacity-100 transition-opacity bg-white/5 hover:bg-white/10 p-1.5 rounded-lg text-white text-[10px] flex items-center gap-1 cursor-pointer absolute right-3 top-3 z-10"
              >
                {copiedId === blockId ? (
                  <>
                    <Check size={12} className="text-emerald-400" />
                    <span className="text-emerald-400 font-sans">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span className="font-sans">Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="whitespace-pre overflow-x-auto custom-scrollbar-horizontal pr-4 leading-relaxed">{code}</pre>
          </div>
        );
      }

      // Handle inline code splits
      const inlineParts = part.split(/(`[^`\n]+`)/g);
      return (
        <p key={index} className="leading-relaxed whitespace-pre-wrap">
          {inlineParts.map((subPart, subIdx) => {
            if (subPart.startsWith('`') && subPart.endsWith('`')) {
              return (
                <code key={subIdx} className="px-1.5 py-0.5 rounded bg-cyan-400/15 border border-cyan-400/25 text-cyan-300 font-mono text-[11px]">
                  {subPart.slice(1, -1)}
                </code>
              );
            }
            return <span key={subIdx}>{subPart}</span>;
          })}
        </p>
      );
    });
  };

  // Suggesion queries context mapped
  const getSuggestions = () => {
    if (selections.topicName) {
      return [
        { label: "Explain simply", query: `Can you explain ${selections.topicName} in very simple analogies?` },
        { label: "Give code example", query: `Can you show me a clean code implementation or practical scenario for "${selections.topicName}"?` },
        { label: "Test my concept", query: `Ask me a quick question about "${selections.topicName}" to test my understanding.` }
      ];
    } else if (selections.subjectName) {
      return [
        { label: "Subject core ideas", query: `What are the most challenging units inside "${selections.subjectName}"?` },
        { label: "OS scheduling info", query: "Briefly explain the role of Process Scheduling in an OS." }
      ];
    }
    return [
      { label: "Binary Trees vs Hash tables", query: "What are the core differences in memory and access speed between Binary Search Trees and Hash Tables?" },
      { label: "Database Normalization", query: "Can you explain B-Tree Indexing in databases simply?" }
    ];
  };

  return (
    <>
      {/* Floating Action Button with notification ring */}
      <motion.button
        id="ai-tutor-fab"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-8 right-8 z-50 w-16 h-16 rounded-full bg-cyan-400 hover:bg-cyan-300 text-slate-900 flex items-center justify-center shadow-[0_0_40px_rgba(34,211,238,0.4)] border-2 border-white/20 cursor-pointer group active:scale-95 transition-all text-left"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="absolute inset-0 rounded-full border border-cyan-400 animate-ping opacity-25" />
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              className="flex items-center justify-center"
            >
              <X size={28} />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              className="relative flex items-center justify-center p-0"
            >
              <Brain size={28} className="group-hover:scale-110 transition-transform duration-300" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-slate-900 animate-pulse" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Slide-out Cyberpunk Drawer Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="ai-tutor-drawer"
            initial={{ opacity: 0, x: 400 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 400 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed top-24 bottom-6 right-6 z-40 w-full max-w-[450px] bg-slate-900/98 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col accent-glow border-cyan-500/10"
          >
            {/* Header */}
            <div className="p-6 bg-white/5 border-b border-white/15 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-cyan-400/10 flex items-center justify-center text-cyan-400 shadow-md border border-cyan-400/20">
                  <Sparkles size={20} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="font-black text-white text-md uppercase tracking-wider leading-none">AI Scholar Tutor</h3>
                  <p className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    Cognitive Link Active
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={clearChat}
                  title="Clear conversation"
                  className="p-2.5 hover:bg-white/10 hover:text-white rounded-xl text-white/40 transition-all cursor-pointer border border-transparent hover:border-white/10"
                >
                  <RotateCcw size={16} />
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2.5 hover:bg-white/10 hover:text-white rounded-xl text-white/40 transition-all cursor-pointer border border-transparent hover:border-white/10"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Current Context Subheader */}
            <div className="px-6 py-3 bg-cyan-500/5 border-b border-white/5 flex items-center gap-2 text-[10px] text-white/40 font-black tracking-wider uppercase truncate">
              <CornerDownRight size={10} className="text-cyan-400 flex-shrink-0" />
              <span className="text-cyan-400">Context:</span>
              <span className="truncate text-white/60">
                {selections.topicName 
                  ? `${selections.subjectName} › ${selections.topicName}` 
                  : selections.subjectName 
                    ? `${selections.subjectName} (Module)` 
                    : 'Global Cybernetic Nexus'}
              </span>
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar bg-slate-950/20">
              {messages.map((msg, index) => {
                const isAI = msg.role === 'assistant';
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex flex-col ${isAI ? 'items-start' : 'items-end'}`}
                  >
                    <div 
                      className={`max-w-[85%] rounded-[1.5rem] p-4.5 text-[13px] shadow-lg ${
                        isAI 
                          ? 'bg-slate-900 border border-white/5 text-white/90 rounded-tl-sm' 
                          : 'bg-cyan-400 text-slate-950 font-semibold rounded-tr-sm shadow-cyan-400/10'
                      }`}
                    >
                      {isAI ? (
                        <div className="space-y-2">
                          {renderContent(msg.content)}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      )}
                    </div>
                    <span className="text-[8px] font-black uppercase text-white/20 tracking-widest mt-1.5 px-1.5 flex items-center gap-1">
                      <Clock size={8} />
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </motion.div>
                );
              })}

              {/* Typing loader */}
              {loading && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-start"
                >
                  <div className="max-w-[70%] rounded-[1.5rem] p-4 bg-slate-900/60 border border-cyan-400/10 rounded-tl-sm text-cyan-400">
                    <div className="flex items-center gap-1.5">
                      <RefreshCw size={14} className="animate-spin text-cyan-400" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Decrypting...</span>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick Context-aware Suggestion Chips */}
            <div className="p-4 bg-white/5 border-t border-white/5 space-y-2">
              <p className="text-[8px] font-black text-cyan-400/60 uppercase tracking-[0.25em] mb-2 px-1">Suggested Protocols</p>
              <div className="flex flex-wrap gap-2">
                {getSuggestions().map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSend(suggestion.query)}
                    disabled={loading}
                    className="text-[10px] font-black uppercase tracking-wider bg-white/5 hover:bg-cyan-400 hover:text-slate-950 text-white/70 hover:border-cyan-400 border border-white/10 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Form Footer */}
            <div className="p-6 bg-slate-900 border-t border-white/10">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-3 relative"
              >
                <input
                  type="text"
                  placeholder={selections.topicName ? `Ask about "${selections.topicName}"...` : "Input academic instruction..."}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={loading}
                  className="flex-1 bg-white/5 border border-white/15 focus:border-cyan-400/50 rounded-2xl px-5 py-4 text-xs text-white placeholder-white/35 outline-none transition-all pr-12 focus:bg-white/10 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || loading}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-cyan-400 disabled:text-slate-950 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send size={15} />
                </button>
              </form>
              <p className="text-[8px] text-center text-white/20 font-black uppercase tracking-widest mt-4">
                Powered by Gemini-3.5-Flash
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
