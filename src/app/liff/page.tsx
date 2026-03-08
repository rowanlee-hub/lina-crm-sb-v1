"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import liff from '@line/liff';
import { Loader2, CheckCircle2 } from 'lucide-react';

function LiffSyncContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Initializing secure connection...");
  const [error, setError] = useState("");

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        const scriptUrl = process.env.NEXT_PUBLIC_SCRIPT_URL || "";
        const botBasicId = process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID || ""; // e.g., @123abcde

        if (!liffId) {
          throw new Error("LIFF ID is not configured.");
        }

        const email = searchParams.get('email');
        if (!email) {
          throw new Error("No secure token (email) found in URL.");
        }

        setStatus("Authenticating via LINE...");
        
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        setStatus("Syncing authorized profile...");
        
        const profile = await liff.getProfile();
        const lineId = profile.userId;

        // Post data to Apps Script using URLSearchParams for correct form-encoding
        if (scriptUrl) {
           const bodyParams = new URLSearchParams();
           bodyParams.append("action", "liff_sync");
           bodyParams.append("email", email);
           bodyParams.append("lineId", lineId);
           bodyParams.append("name", profile.displayName || "");

           await fetch(scriptUrl, {
              method: "POST",
              mode: "no-cors", // Apps Script doesn't handle CORS preflights well, no-cors is safer for one-way sync
              body: bodyParams
           }).catch(err => console.error("Sync fetch error:", err));
        }

        setStatus("Success! Opening chat...");
        
        // Wait 1 second to show success, then redirect to the Bot Chat
        setTimeout(() => {
           if (botBasicId) {
              // Try to open the profile page directly in LINE
              window.location.href = `https://line.me/R/ti/p/${botBasicId}`;
              
              // Fallback just in case window.location is blocked by some browsers inside LINE
              setTimeout(() => {
                 liff.closeWindow();
              }, 2000);
           } else {
              liff.closeWindow();
           }
        }, 1000);

      } catch (err: any) {
        console.error("LIFF App Error:", err);
        setError(err.message || "An unexpected error occurred.");
      }
    };

    initializeLiff();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
       <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto shadow-inner">
             <img src="https://upload.wikimedia.org/wikipedia/commons/4/41/LINE_logo.svg" alt="LINE" className="w-10 h-10" />
          </div>
          
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Accessing Reward</h1>
          
          {error ? (
             <div className="text-red-600 bg-red-50 p-4 rounded-xl text-sm font-semibold border border-red-100">
                {error}
             </div>
          ) : (
             <div className="space-y-4">
                {status.includes("Success") ? (
                   <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto animate-in zoom-in duration-300" />
                ) : (
                   <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                )}
                <p className="text-sm font-medium text-slate-500 animate-pulse">{status}</p>
             </div>
          )}
       </div>
       <p className="mt-8 text-xs text-slate-400 font-medium">Secured by LINE Front-end Framework</p>
    </div>
  );
}

export default function LiffAppPage() {
   return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>}>
         <LiffSyncContent />
      </Suspense>
   );
}
