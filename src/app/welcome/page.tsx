'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const LINE_BOT_ID = '@930ujtxd';
const WHATSAPP_URL = 'https://chat.whatsapp.com/FctyvBqBRlaJs4mPLPECZR';

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

        {/* WhatsApp Button */}
        <a href={WHATSAPP_URL} target="_blank" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#6b7280', fontWeight: 500, fontSize: '14px',
            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}>
            <svg style={{ width: '18px', height: '18px', marginRight: '6px', fill: '#25D366' }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
            </svg>
            <span style={{ borderBottom: '1px dashed #9ca3af', paddingBottom: '1px' }}>或使用 WhatsApp 聯繫 Kelly</span>
          </div>
        </a>
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
