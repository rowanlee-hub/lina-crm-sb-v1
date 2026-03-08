"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import liff from '@line/liff';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

function LiffSyncContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Step 1: Initializing secure connection...");
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState("");

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        const scriptUrl = process.env.NEXT_PUBLIC_SCRIPT_URL;
        const botBasicId = process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID;

        // DEBUG CHECK 1: Environment Variables
        if (!liffId) {
          throw new Error("Missing NEXT_PUBLIC_LIFF_ID in Vercel Environment Variables.");
        }
        if (!scriptUrl) {
          throw new Error("Missing NEXT_PUBLIC_SCRIPT_URL in Vercel Environment Variables.");
        }

        // DEBUG CHECK 2: URL Parameters
        const email = searchParams.get('email');
        if (!email) {
          throw new Error("No email found in the URL. Ensure GoHighLevel is passing ?email={{contact.email}}");
        }

        setStatus(`Step 2: Authenticating ${email} via LINE...`);
        
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        setStatus("Step 3: Syncing authorized profile to Google Sheets...");
        
        const profile = await liff.getProfile();
        const lineId = profile.userId;

        // Prepare the data
        const bodyParams = new URLSearchParams();
        bodyParams.append("action", "liff_sync");
        bodyParams.append("email", email);
        bodyParams.append("lineId", lineId);
        bodyParams.append("name", profile.displayName || "Unknown");

        // Send to Apps Script
        const response = await fetch(scriptUrl, {
           method: "POST",
           body: bodyParams
        });
        
        const data = await response.json().catch(() => null);
        
        // DEBUG CHECK 3: Google Apps Script Response
        if (!response.ok || !data) {
          throw new Error(`Google Apps Script Failed. HTTP Status: ${response.status}. Make sure you deployed a 'New Version'.`);
        }
        if (data.success === false) {
          throw new Error(`Google Script Error: ${data.error}`);
        }

        setStatus("Step 4: Success! Redirecting to chat...");
        setDebugInfo(`Successfully linked ${email} to LINE ID: ${lineId}`);
        
        // Wait 2 seconds so user can read success message, then redirect/close
        setTimeout(() => {
           if (botBasicId) {
              window.location.href = `https://line.me/R/ti/p/${botBasicId}`;
              
              // Fallback just in case window.location is blocked inside the LIFF browser
              setTimeout(() => {
                 liff.closeWindow();
              }, 2000);
           } else {
              liff.closeWindow();
           }
        }, 2000);

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
             <div className="text-left bg-red-50 p-4 rounded-xl border border-red-200">
                <div className="flex items-center text-red-700 font-bold mb-2">
                   <AlertTriangle className="w-5 h-5 mr-2" />
                   Connection Failed
                </div>
                <p className="text-sm text-red-600 break-words">{error}</p>
             </div>
          ) : (
             <div className="space-y-4">
                {status.includes("Success") ? (
                   <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto animate-in zoom-in duration-300" />
                ) : (
                   <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                )}
                <p className="text-sm font-medium text-slate-600 transition-all">{status}</p>
                {debugInfo && (
                  <p className="text-xs text-slate-400 mt-2 p-2 bg-slate-100 rounded-md border border-slate-200">
                    {debugInfo}
                  </p>
                )}
             </div>
          )}
       </div>
       <p className="mt-8 text-xs text-slate-400 font-medium">Secured by LINE Front-end Framework</p>
    </div>
  );
}

export default function LiffAppPage() {
   return (
      <Suspense fallback={
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
           <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
           <p className="text-sm text-slate-500 font-medium">Loading secure environment...</p>
        </div>
      }>
         <LiffSyncContent />
      </Suspense>
   );
}
