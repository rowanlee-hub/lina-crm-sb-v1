'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const LINE_BOT_ID = '@439maycr';

function WelcomeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const name = searchParams.get('name') || '';

  const lineMessage = email
    ? `嗨您好，我想要領取禮物，我的email是${email}`
    : '嗨您好，我想要領取禮物';
  const lineUrl = `https://line.me/R/oaMessage/${encodeURIComponent(LINE_BOT_ID)}/?${encodeURIComponent(lineMessage)}`;

  return (
    <div style={{
      width: '100%',
      fontFamily: "'Noto Sans TC', 'Helvetica', 'Arial', sans-serif",
      textAlign: 'center',
      padding: '20px',
      minHeight: '100vh',
      boxSizing: 'border-box',
      backgroundColor: '#ffffff',
      color: '#111827',
    }}>
      <style>{`
        @keyframes ghl-bounce-btn {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes ghl-pulse-orange-strong {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.8); transform: scale(1); }
          50% { box-shadow: 0 0 0 15px rgba(245, 158, 11, 0); transform: scale(1.2); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); transform: scale(1); }
        }
        @keyframes ghl-progress-line {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        @keyframes ghl-fade-in-up {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Progress Timeline */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        margin: '0 auto 32px auto',
        maxWidth: '360px',
        position: 'relative',
        backgroundColor: '#fffbeb',
        border: '1px solid #fef3c7',
        borderRadius: '20px',
        padding: '24px 10px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
      }}>
        {/* Step 1: 報名成功 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2, width: '80px' }}>
          <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#15803d', letterSpacing: '1px' }}>步驟 1</div>
          <div style={{
            width: '40px', height: '40px', backgroundColor: '#22c55e', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          }}>
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 700, color: '#15803d' }}>報名成功</div>
        </div>

        {/* Connection Line */}
        <div style={{
          flexGrow: 1, height: '4px', backgroundColor: '#e5e7eb', marginTop: '42px',
          borderRadius: '4px', position: 'relative', overflow: 'hidden', marginLeft: '4px', marginRight: '4px',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%',
            backgroundColor: '#22c55e', animation: 'ghl-progress-line 1.5s ease-out forwards',
          }} />
        </div>

        {/* Step 2: 領取禮物 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2, width: '80px' }}>
          <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#b45309', letterSpacing: '1px' }}>步驟 2</div>
          <div style={{
            width: '40px', height: '40px', backgroundColor: '#f59e0b', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            animation: 'ghl-pulse-orange-strong 1.5s infinite', border: '2px solid white',
          }}>
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </div>
          <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 700, color: '#b45309' }}>領取禮物</div>
        </div>
      </div>

      {/* Main Title */}
      <h1 style={{
        fontSize: '40px', fontWeight: 800, color: '#111827',
        marginTop: 0, marginBottom: '16px', lineHeight: 1.3,
        letterSpacing: '-0.025em', animation: 'ghl-fade-in-up 0.8s ease-out forwards',
      }}>
        只差最後一步! <br />
        請趕快<span style={{
          color: '#d97706',
          background: 'linear-gradient(180deg, transparent 55%, #fde68a 55%)',
          padding: '0 4px',
        }}>聯繫 Kelly 領取你的免費禮物</span>
      </h1>

      {/* Subtitle */}
      <p style={{
        fontSize: '20px', color: '#4b5563', maxWidth: '640px',
        margin: '0 auto 32px auto', lineHeight: 1.6,
        animation: 'ghl-fade-in-up 0.8s ease-out 0.2s forwards', opacity: 0,
      }}>
        恭喜{name ? ` ${name} ` : ''}報名成功！請點擊下方按鈕，找 Kelly 領取你的免費禮物！
      </p>

      {/* Action Buttons */}
      <div style={{ animation: 'ghl-fade-in-up 0.8s ease-out 0.4s forwards', opacity: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* LINE Button */}
        <a href={lineUrl} target="_blank" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#06c755', color: 'white', fontWeight: 700, fontSize: '20px',
            padding: '16px 32px', borderRadius: '12px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            transition: 'all 0.2s ease', cursor: 'pointer',
            border: '2px solid #06c755', animation: 'ghl-bounce-btn 2s infinite',
          }}>
            <svg style={{ width: '28px', height: '28px', marginRight: '12px', fill: 'white' }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
            LINE 聯繫 Kelly 領取禮物
          </div>
        </a>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px', marginBottom: '16px' }}>
          *點擊按鈕將開啟 LINE 應用程式
        </p>

      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
        載入中...
      </div>
    }>
      <WelcomeContent />
    </Suspense>
  );
}
