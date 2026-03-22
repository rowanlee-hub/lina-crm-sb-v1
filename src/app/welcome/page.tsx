'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const LINE_BOT_ID = '@930ujtxd';

function WelcomeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const name = searchParams.get('name') || '';

  // Build LINE pre-filled message URL
  const lineMessage = email
    ? `我的email是 ${email}`
    : '我想領取我的直播連結';
  const lineUrl = `https://line.me/R/oaMessage/${encodeURIComponent(LINE_BOT_ID)}/?${encodeURIComponent(lineMessage)}`;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      background: 'linear-gradient(135deg, #06C755 0%, #04a648 100%)',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '20px',
        padding: '40px 32px',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
        color: '#333',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Icon */}
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>

        {/* Title */}
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px', color: '#1a1a1a' }}>
          {name ? `恭喜 ${name}！` : '恭喜！'}註冊成功
        </h1>

        <p style={{
          fontSize: '15px',
          lineHeight: 1.7,
          color: '#666',
          marginBottom: '24px',
        }}>
          點擊下方按鈕加入我們的 LINE，
          <br />即可領取你的<strong>專屬直播連結</strong>和 <strong>Workbook</strong>！
        </p>

        {/* LINE Button */}
        <a
          href={lineUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            background: '#06C755',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            padding: '16px 32px',
            fontSize: '17px',
            fontWeight: 700,
            cursor: 'pointer',
            width: '100%',
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
          </svg>
          加入 LINE 領取連結
        </a>

        <p style={{
          fontSize: '13px',
          color: '#999',
          marginTop: '16px',
          lineHeight: 1.5,
        }}>
          點擊後會開啟 LINE，按「傳送」即可自動連結你的帳號
          <br />
          Click the button, then tap "Send" in LINE to link your account
        </p>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #06C755 0%, #04a648 100%)',
        color: '#fff',
        fontSize: '18px',
      }}>
        載入中...
      </div>
    }>
      <WelcomeContent />
    </Suspense>
  );
}
