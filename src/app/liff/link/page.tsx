'use client';

import { useEffect, useState } from 'react';

type LinkStatus = 'loading' | 'linking' | 'success' | 'error' | 'no-email';

export default function LiffLinkPage() {
  const [status, setStatus] = useState<LinkStatus>('loading');
  const [message, setMessage] = useState('正在連接你的帳號...');
  const [userName, setUserName] = useState('');
  const [hasWebinarLink, setHasWebinarLink] = useState(false);

  useEffect(() => {
    initLiff();
  }, []);

  async function initLiff() {
    try {
      // Dynamic import LIFF SDK first — need it to extract liff.state
      const liff = (await import('@line/liff')).default;
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

      if (!liffId) {
        setStatus('error');
        setMessage('System configuration error (LIFF_ID missing)');
        return;
      }

      await liff.init({ liffId });

      // Extract email from multiple possible locations:
      // 1. Normal URL search params (direct open / LINE in-app browser)
      // 2. liff.state (external browser after OAuth redirect)
      // 3. Hash params (some LIFF versions)
      function extractEmail(): string | null {
        // Try normal URL params first
        const urlParams = new URLSearchParams(window.location.search);
        const fromUrl = urlParams.get('email');
        if (fromUrl) return fromUrl;

        // Try liff.state — LIFF puts original query params here after OAuth redirect
        const stateParam = urlParams.get('liff.state');
        if (stateParam) {
          // liff.state can be "?email=xxx" or "email=xxx" or "/path?email=xxx"
          const stateMatch = stateParam.match(/[?&]?email=([^&]+)/);
          if (stateMatch) return decodeURIComponent(stateMatch[1]);
        }

        // Try hash
        if (window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
          const fromHash = hashParams.get('email');
          if (fromHash) return fromHash;
        }

        return null;
      }

      const email = extractEmail();
      if (!email) {
        setStatus('no-email');
        setMessage('缺少電郵資訊，請從正確的連結進入。\nMissing email parameter.');
        return;
      }

      // Check if user is logged in to LINE
      if (!liff.isLoggedIn()) {
        // Redirect to LINE login — will come back here after login
        liff.login({ redirectUri: window.location.href });
        return;
      }

      // Check friendship status
      const friendship = await liff.getFriendship();
      if (!friendship.friendFlag) {
        // Not a friend yet — show add friend prompt
        setStatus('error');
        setMessage('請先加我們為好友，再重新點擊連結。\nPlease add us as a friend first, then click the link again.');
        // Open add friend page
        const botBasicId = process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID;
        if (botBasicId) {
          window.location.href = `https://line.me/R/ti/p/${botBasicId}`;
        }
        return;
      }

      // Get user profile
      const profile = await liff.getProfile();
      setUserName(profile.displayName);
      setStatus('linking');
      setMessage('正在連結你的帳號...');

      // Call our API to link email + LINE userId
      const response = await fetch('/api/line/link-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          line_id: profile.userId,
          display_name: profile.displayName,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setHasWebinarLink(result.has_webinar_link);
        setUserName(result.name || profile.displayName);

        if (result.action === 'already_linked') {
          setStatus('success');
          setMessage('你的帳號已經連結成功！\nYour account is already linked!');
        } else if (result.action === 'email_saved') {
          setStatus('success');
          setMessage('電郵已儲存！當你的直播連結準備好時，我們會自動發送給你。\nEmail saved! We\'ll send your webinar link automatically when ready.');
        } else {
          setStatus('success');
          setMessage('帳號連結成功！\nAccount linked successfully!');
        }
      } else {
        setStatus('error');
        setMessage(result.error || 'Something went wrong. Please try again.');
      }

    } catch (err: any) {
      console.error('[LIFF] Error:', err);
      setStatus('error');
      setMessage(`連結失敗，請重試。\nFailed to link: ${err.message || 'Unknown error'}`);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#fff',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '20px',
        padding: '40px 32px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
        color: '#333',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Icon */}
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
          {status === 'loading' || status === 'linking' ? '⏳' :
           status === 'success' ? '✅' :
           status === 'no-email' ? '❓' : '❌'}
        </div>

        {/* Title */}
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>
          {status === 'success' ? `歡迎, ${userName}!` :
           status === 'loading' ? '連接中...' :
           status === 'linking' ? '正在連結...' :
           '連結帳號'}
        </h1>

        {/* Message */}
        <p style={{
          fontSize: '15px',
          lineHeight: 1.6,
          color: '#666',
          whiteSpace: 'pre-line',
          marginBottom: '24px',
        }}>
          {message}
        </p>

        {/* Success: show webinar link info */}
        {status === 'success' && hasWebinarLink && (
          <p style={{
            fontSize: '14px',
            color: '#06C755',
            fontWeight: 600,
            marginBottom: '16px',
          }}>
            🎉 你的直播連結已發送到 LINE！
            <br />Your webinar link has been sent to LINE!
          </p>
        )}

        {/* Success: close button */}
        {status === 'success' && (
          <button
            onClick={() => {
              try {
                import('@line/liff').then(({ default: liff }) => {
                  if (liff.isInClient()) {
                    liff.closeWindow();
                  } else {
                    window.close();
                  }
                });
              } catch {
                window.close();
              }
            }}
            style={{
              background: '#06C755',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '14px 32px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            返回 LINE 對話 →
          </button>
        )}

        {/* Error: retry button */}
        {status === 'error' && (
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#667eea',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '14px 32px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            重試 Retry
          </button>
        )}
      </div>
    </div>
  );
}
