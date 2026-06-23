import React from 'react';
import { LogIn, GraduationCap } from 'lucide-react';
import { loginWithGoogle } from '../lib/firebase';
import { motion } from 'motion/react';

export function Login() {
  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      let errorMsg = 'Login failed. ';
      
      if (error instanceof Error) {
        if (error.message.includes('unauthorized-domain')) {
          errorMsg = '⚠️ OAuth not configured.\n\nQuick fix: Run in another terminal:\nnpm run emulator\n\nThen refresh this page.';
        } else if (error.message.includes('ERR_CONNECTION_REFUSED') || error.message.includes('9099') || error.message.includes('9110')) {
          errorMsg = '⚠️ Firebase Emulator not running or unreachable.\n\nStart it with:\nnpm run emulator';
        } else {
          errorMsg = `Login error: ${error.message}`;
        }
      }
      
      console.error(errorMsg);
      alert(errorMsg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white/5 backdrop-blur-2xl rounded-3xl p-12 border border-white/10 text-center relative z-10 accent-glow"
      >
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-cyan-400 text-slate-900 mb-10 shadow-2xl shadow-cyan-400/20">
          <GraduationCap size={48} />
        </div>
        <h1 className="text-4xl font-black text-white mb-4 tracking-tighter">AI Scholar</h1>
        <p className="text-white/60 mb-12 leading-relaxed font-medium">
          Embark on your academic journey with personalized AI-driven learning and evaluation.
        </p>

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-cyan-400 hover:bg-white text-slate-900 font-bold py-5 px-8 rounded-2xl transition-all duration-300 group shadow-lg shadow-cyan-400/10 active:scale-[0.98]"
        >
          <LogIn size={22} className="group-hover:rotate-12 transition-transform" />
          Continue with Google
        </button>
        
        <p className="mt-12 text-xs text-white/30 font-bold uppercase tracking-[0.3em]">
          Empowering Education through AI
        </p>
      </motion.div>
      
      {/* Decorative ornaments */}
      <div className="absolute top-1/4 -left-20 w-64 h-64 bg-cyan-500/20 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 -right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-[100px]" />
    </div>
  );
}
