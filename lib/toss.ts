/**
 * Toss Payments 유틸리티
 *
 * React Native에서 TossPayments는 WebView를 통해 동작합니다.
 * - buildPaymentHTML(): WebView에 주입할 HTML을 생성합니다.
 * - confirmPayment(): 서버사이드(Edge Function) 에서 호출해야 합니다.
 *   클라이언트에서 직접 호출하면 Secret Key가 노출됩니다.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaymentHTMLParams {
  clientKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerName: string;
  /** WebView에서 intercept할 URL. onShouldStartLoadWithRequest로 처리 */
  successUrl: string;
  failUrl: string;
}

export interface TossPaymentResult {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface TossPaymentError {
  code: string;
  message: string;
}

// ─── WebView HTML Builder ─────────────────────────────────────────────────────

/**
 * TossPayments JS SDK를 WebView에서 실행하는 HTML을 반환합니다.
 *
 * WebView 설정:
 *   javaScriptEnabled={true}
 *   domStorageEnabled={true}
 *   onShouldStartLoadWithRequest={interceptor}
 *   onMessage={messageHandler}
 *
 * 성공: successUrl?paymentKey=xxx&orderId=xxx&amount=xxx 로 이동 (intercept)
 * 실패: failUrl?code=xxx&message=xxx 로 이동 (intercept)
 * SDK 오류: ReactNativeWebView.postMessage({ type: 'FAIL', code, message })
 */
export function buildPaymentHTML(params: PaymentHTMLParams): string {
  const { clientKey, amount, orderId, orderName, customerName, successUrl, failUrl } = params;

  // JSON.stringify로 XSS-safe하게 주입
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>토닥토닥 결제</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Noto Sans KR', sans-serif;
      background-color: #faf8f5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 24px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      padding: 32px 24px;
      width: 100%;
      max-width: 380px;
      box-shadow: 0 4px 24px rgba(61, 44, 30, 0.10);
      text-align: center;
    }
    .logo { font-size: 22px; font-weight: 900; letter-spacing: 3px; color: #3d2c1e; }
    .tagline { font-size: 12px; color: #8c7b6b; margin-top: 4px; margin-bottom: 32px; }
    .spinner-wrap { display: flex; justify-content: center; margin-bottom: 28px; }
    .spinner {
      width: 44px; height: 44px;
      border: 3.5px solid #f5ddb5;
      border-top-color: #3d2c1e;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .order-name { font-size: 14px; color: #8c7b6b; margin-bottom: 8px; }
    .amount { font-size: 28px; font-weight: 900; color: #3d2c1e; }
    .amount-unit { font-size: 16px; font-weight: 600; }
    .notice { margin-top: 24px; font-size: 12px; color: #8c7b6b; line-height: 1.6; }
    .error-box {
      display: none;
      background: #fff3f3;
      border: 1px solid #ffcdd2;
      border-radius: 12px;
      padding: 16px;
      color: #c62828;
      font-size: 13px;
      margin-top: 20px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">토닥토닥</div>
    <div class="tagline">귀 기울여 드려요</div>

    <div class="spinner-wrap">
      <div class="spinner" id="spinner"></div>
    </div>

    <div class="order-name">${orderName.replace(/</g, '&lt;')}</div>
    <div class="amount">
      <span id="amountDisplay">${amount.toLocaleString()}</span>
      <span class="amount-unit">원</span>
    </div>

    <p class="notice">
      토스페이먼츠 결제창이 열립니다.<br />
      잠시만 기다려주세요…
    </p>

    <div class="error-box" id="errorBox"></div>
  </div>

  <script src="https://js.tosspayments.com/v1/payment"></script>
  <script>
    (function () {
      'use strict';

      var CLIENT_KEY  = ${JSON.stringify(clientKey)};
      var AMOUNT      = ${JSON.stringify(amount)};
      var ORDER_ID    = ${JSON.stringify(orderId)};
      var ORDER_NAME  = ${JSON.stringify(orderName)};
      var CUSTOMER    = ${JSON.stringify(customerName)};
      var SUCCESS_URL = ${JSON.stringify(successUrl)};
      var FAIL_URL    = ${JSON.stringify(failUrl)};

      function postFail(code, message) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'FAIL', code: code, message: message })
          );
        } else {
          // Fallback: navigate to fail URL (WebView will intercept)
          window.location.href = FAIL_URL + '?code=' + encodeURIComponent(code) + '&message=' + encodeURIComponent(message);
        }
      }

      function showError(msg) {
        var el = document.getElementById('errorBox');
        if (el) { el.style.display = 'block'; el.textContent = msg; }
        var sp = document.getElementById('spinner');
        if (sp) { sp.style.display = 'none'; }
      }

      window.addEventListener('load', function () {
        if (typeof TossPayments === 'undefined') {
          showError('결제 모듈을 불러오지 못했어요. 네트워크 연결을 확인해주세요.');
          postFail('LOAD_ERROR', 'TossPayments SDK 로드 실패');
          return;
        }

        try {
          var tossPayments = TossPayments(CLIENT_KEY);
          tossPayments.requestPayment('카드', {
            amount: AMOUNT,
            orderId: ORDER_ID,
            orderName: ORDER_NAME,
            customerName: CUSTOMER,
            successUrl: SUCCESS_URL,
            failUrl: FAIL_URL,
          }).catch(function (err) {
            var code = (err && err.code) ? err.code : 'PAYMENT_ERROR';
            var msg  = (err && err.message) ? err.message : '결제 처리 중 오류가 발생했어요.';
            if (code === 'USER_CANCEL') {
              postFail('USER_CANCEL', '결제를 취소했어요.');
            } else {
              showError(msg);
              postFail(code, msg);
            }
          });
        } catch (e) {
          var msg = (e && e.message) ? e.message : '결제 초기화에 실패했어요.';
          showError(msg);
          postFail('INIT_ERROR', msg);
        }
      });
    })();
  </script>
</body>
</html>`;
}

// ─── Server-side helpers (Edge Function 전용) ─────────────────────────────────
// 아래 함수들은 Secret Key를 사용하므로 반드시 서버(Edge Function)에서만 호출하세요.

export interface ServerConfirmParams {
  paymentKey: string;
  orderId: string;
  amount: number;
  secretKey: string;
}

export interface TossConfirmResponse {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED';
  totalAmount: number;
  method: string;
  approvedAt: string;
}

/** Edge Function에서만 사용 — Secret Key로 결제 승인 */
export async function serverConfirmPayment(
  params: ServerConfirmParams
): Promise<TossConfirmResponse> {
  const { paymentKey, orderId, amount, secretKey } = params;
  const credentials = btoa(`${secretKey}:`);

  const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? `결제 승인 실패: ${res.status}`);
  }

  return res.json();
}

/** Edge Function에서만 사용 — 결제 취소 */
export async function serverCancelPayment(
  paymentKey: string,
  cancelReason: string,
  secretKey: string
): Promise<void> {
  const res = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${secretKey}:`)}`,
    },
    body: JSON.stringify({ cancelReason }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? `결제 취소 실패: ${res.status}`);
  }
}
