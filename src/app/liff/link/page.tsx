'use client';

import { useEffect, useState, useRef } from 'react';

type LinkStatus = 'loading' | 'linking' | 'success' | 'error' | 'ask-email';

export default function LiffLinkPage() {
  const [status, setStatus] = useState<LinkStatus>('loading');
  const [message, setMessage] = useState('正在連接你的帳號...');
  const [userName, setUserName] = useState('');
  const [hasWebinarLink, setHasWebinarLink] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const liffRef = useRef<any>(null);
  const profileRef = useRef<any>(null);

  useEffect(() => {
    initLiff();
  }, []);

  async function initLiff() {
    try {
      const liff = (await import('@line/liff')).default;
      liffRef.current = liff;
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

      if (!liffId) {
        setStatus('error');
        setMessage('System configuration error (LIFF_ID missing)');
        return;
      }

      await liff.init({ liffId });

      // Check if user is logged in to LINE
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }

      // Check friendship status
      const friendship = await liff.getFriendship();
      if (!friendship.friendFlag) {
        setStatus('error');
        setMessage('請先加我們為好友，再重新點擊連結。\nPlease add us as a friend first, then click the link again.');
        const botBasicId = process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID;
        if (botBasicId) {
          window.location.href = `https://line.me/R/ti/p/${botBasicId}`;
        }
        return;
      }

      // Get user profile
      const profile = await liff.getProfile();
      profileRef.current = profile;
      setUserName(profile.displayName);

      // Try to extract email from URL
      const email = extractEmail();
      if (email) {
        await linkAccount(email, profile);
      } else {
        // No email in URL — ask user to enter it
        setStatus('ask-email');
        setMessage('請輸入你註冊時使用的電郵地址\nPlease enter the email you used to sign up');
      }

    } catch (err: any) {
      console.error('[LIFF] Error:', err);
      setStatus('error');
      setMessage(`連結失敗，請重試。\nFailed to link: ${err.message || 'Unknown error'}`);
    }
  }

  function extractEmail(): string | null {
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get('email');
    if (fromUrl && !fromUrl.includes('{{')) return fromUrl;

    const stateParam = urlParams.get('liff.state');
    if (stateParam) {
      const stateMatch = stateParam.match(/[?&]?email=([^&]+)/);
      if (stateMatch) {
        const decoded = decodeURIComponent(stateMatch[1]);
        if (!decoded.includes('{{')) return decoded;
      }
    }

    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
      const fromHash = hashParams.get('email');
      if (fromHash && !fromHash.includes('{{')) return fromHash;
    }

    return null;
  }

  async function linkAccount(email: string, profile: any) {
    setStatus('linking');
    setMessage('正在連結你的帳號...');

    const response = await fetch('/api/line/link-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        line_id: profile.userId,
        display_name: profile.displayName,
      }),
    });

    const result = await response.json();

    if (result.success) {
      setHasWebinarLink(result.has_webinar_link && result.action !== 'email_saved');
      setUserName(result.name || profile.displayName);

      if (result.action === 'already_linked') {
        setStatus('success');
        setMessage(result.has_webinar_link
          ? '你的帳號已經連結成功！直播連結已發送到 LINE。\nYour account is already linked! Webinar link sent to LINE.'
          : '你的帳號已經連結成功！\nYour account is already linked!');
      } else if (result.action === 'email_saved') {
        setStatus('success');
        setMessage('電郵已儲存！當你的直播連結準備好時，我們會自動發送給你。\nEmail saved! We\'ll send your webinar link automatically when ready.');
      } else {
        setStatus('success');
        setMessage(result.has_webinar_link
          ? '帳號連結成功！直播連結已發送到 LINE。\nAccount linked! Webinar link sent to LINE.'
          : '帳號連結成功！\nAccount linked successfully!');
      }
    } else {
      setStatus('error');
      setMessage(result.error || 'Something went wrong. Please try again.');
    }
  }

  async function handleEmailSubmit() {
    if (!emailInput.trim() || !profileRef.current) return;
    try {
      await linkAccount(emailInput, profileRef.current);
    } catch (err: any) {
      setStatus('error');
      setMessage(`連結失敗，請重試。\nFailed: ${err.message}`);
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
           status === 'ask-email' ? '📧' : '❌'}
        </div>

        {/* Title */}
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>
          {status === 'success' ? `歡迎, ${userName}!` :
           status === 'loading' ? '連接中...' :
           status === 'linking' ? '正在連結...' :
           status === 'ask-email' ? `Hi ${userName}!` :
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

        {/* Ask email: input form */}
        {status === 'ask-email' && (
          <div style={{ marginBottom: '16px' }}>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="your@email.com"
              onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
              style={{
                width: '100%',
                padding: '14px 16px',
                fontSize: '16px',
                border: '2px solid #e0e0e0',
                borderRadius: '12px',
                marginBottom: '12px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <button
              onClick={handleEmailSubmit}
              disabled={!emailInput.trim()}
              style={{
                background: emailInput.trim() ? '#06C755' : '#ccc',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '14px 32px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: emailInput.trim() ? 'pointer' : 'default',
                width: '100%',
              }}
            >
              連結帳號 Link Account
            </button>
          </div>
        )}

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
