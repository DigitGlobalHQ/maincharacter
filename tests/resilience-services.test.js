/**
 * Resilience integration tests — verify that retry + circuit-breaker are
 * correctly applied to email/sms/whatsapp/razorpay/storage.
 *
 * All external SDK calls are mocked.  Backoff is effectively zero because
 * the services use withRetry opts that are overridden to tiny values in
 * these tests via the __setRetryOpts test-seams (or we rely on the service
 * already using tiny defaults when NODE_ENV=test).
 *
 * Key assertions:
 *   1. A transient 5xx / network error triggers a retry and the 2nd call succeeds.
 *   2. A 400 / 4xx (non-429) does NOT retry — exactly one attempt.
 *   3. Circuit breaker: after N consecutive notification failures the breaker opens
 *      and subsequent calls short-circuit (fn not called).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── shared test env ──────────────────────────────────────────────────────────

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  // Reset circuit-breaker state between every test
  const { _resetAll } = require('../lib/circuit-breaker');
  _resetAll();
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL — services/email.js
// ═══════════════════════════════════════════════════════════════════════════════

describe('email resilience', () => {
  const email = require('../services/email');

  function setupLive() {
    process.env.RESEND_API_KEY = 're_test';
    process.env.WHATSAPP_SEND_MODE = 'all';
  }

  it('retries a transient 503 then succeeds', async () => {
    setupLive();
    let calls = 0;
    email.__setTransport(async () => {
      calls++;
      if (calls === 1) {
        const err = Object.assign(new Error('Service Unavailable'), { status: 503 });
        throw err;
      }
      return { data: { id: 'email-ok' }, error: null };
    });

    const result = await email.sendEmail({ to: 'a@b.com', subject: 'test', html: '<p>hi</p>' });
    expect(result).toMatchObject({ id: 'email-ok' });
    expect(calls).toBe(2);

    email.__resetTransport();
  });

  it('does NOT retry a 400 validation error — exactly one attempt', async () => {
    setupLive();
    let calls = 0;
    email.__setTransport(async () => {
      calls++;
      const err = Object.assign(new Error('Bad Request'), { status: 400 });
      throw err;
    });

    await expect(
      email.sendEmail({ to: 'a@b.com', subject: 'test', html: '<p>hi</p>' })
    ).rejects.toThrow();
    expect(calls).toBe(1);

    email.__resetTransport();
  });

  it('still respects DRY-RUN when RESEND_API_KEY is not set', async () => {
    process.env.WHATSAPP_SEND_MODE = 'all';
    delete process.env.RESEND_API_KEY;
    const mockTransport = vi.fn();
    email.__setTransport(mockTransport);

    const result = await email.sendEmail({ to: 'a@b.com', subject: 'test', html: '<p>hi</p>' });
    expect(result.result).toBe('dry-run');
    expect(mockTransport).not.toHaveBeenCalled();

    email.__resetTransport();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SMS — services/sms.js
// ═══════════════════════════════════════════════════════════════════════════════

describe('sms resilience', () => {
  it('sendOtp: retries a 503 network error then succeeds', async () => {
    const axios = require('axios');
    process.env.MSG91_AUTH_KEY = 'authkey';
    process.env.MSG91_TEMPLATE_ID_OTP = 'tpl';
    process.env.WHATSAPP_SEND_MODE = 'all';

    let calls = 0;
    vi.spyOn(axios, 'post').mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        const err = Object.assign(new Error('Service Unavailable'), { status: 503 });
        throw err;
      }
      return { status: 200, data: { type: 'success' } };
    });

    const sms = require('../services/sms');
    const result = await sms.sendOtp('911234567890', '123456');
    expect(result).toMatchObject({ type: 'success' });
    expect(calls).toBe(2);
  });

  it('sendOtp: does NOT retry a 400 validation error', async () => {
    const axios = require('axios');
    process.env.MSG91_AUTH_KEY = 'authkey';
    process.env.MSG91_TEMPLATE_ID_OTP = 'tpl';
    process.env.WHATSAPP_SEND_MODE = 'all';

    let calls = 0;
    vi.spyOn(axios, 'post').mockImplementation(async () => {
      calls++;
      const err = Object.assign(new Error('Bad Request'), { status: 400 });
      throw err;
    });

    const sms = require('../services/sms');
    await expect(sms.sendOtp('911234567890', '123456')).rejects.toThrow('Bad Request');
    expect(calls).toBe(1);
  });

  it('sendSms: retries ECONNRESET then succeeds', async () => {
    const axios = require('axios');
    process.env.MSG91_AUTH_KEY = 'authkey';
    process.env.WHATSAPP_SEND_MODE = 'all';

    let calls = 0;
    vi.spyOn(axios, 'post').mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
      }
      return { status: 200, data: { type: 'success' } };
    });

    const sms = require('../services/sms');
    const result = await sms.sendSms('911234567890', 'Test message');
    expect(calls).toBe(2);
    expect(result).toMatchObject({ type: 'success' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// WHATSAPP — services/whatsapp.js sendMessageSafe
// ═══════════════════════════════════════════════════════════════════════════════

describe('whatsapp sendMessageSafe resilience', () => {
  function configureLive() {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '111';
    process.env.WHATSAPP_SEND_MODE = 'all';
  }

  it('retries via withRetry and returns success on 2nd attempt', async () => {
    const axios = require('axios');
    configureLive();

    let calls = 0;
    vi.spyOn(axios, 'post').mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error('Service Unavailable'), { status: 503 });
      }
      return { status: 200, data: { messages: [{ id: 'wamid.ok' }] } };
    });

    const whatsapp = require('../services/whatsapp');
    const result = await whatsapp.sendMessageSafe('919958533994', 'hello');
    expect(result).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('returns null after exhausting retries (does not throw)', async () => {
    const axios = require('axios');
    configureLive();

    vi.spyOn(axios, 'post').mockRejectedValue(
      Object.assign(new Error('Gateway Timeout'), { status: 504 })
    );

    const whatsapp = require('../services/whatsapp');
    const result = await whatsapp.sendMessageSafe('919958533994', 'hello');
    expect(result).toBeNull();
  });

  it('returns null (no throw) on 400 — preserving the safe no-throw contract', async () => {
    const axios = require('axios');
    configureLive();

    vi.spyOn(axios, 'post').mockRejectedValue(
      Object.assign(new Error('Bad Request'), { status: 400 })
    );

    const whatsapp = require('../services/whatsapp');
    const result = await whatsapp.sendMessageSafe('919958533994', 'hello');
    // sendMessageSafe never throws — returns null regardless of error type.
    // Note: sendMessageSafe uses isRetryable: () => true to preserve the
    // original contract (retry all errors once, return null on total failure).
    expect(result).toBeNull();
  }, 10000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// RAZORPAY — services/razorpay.js
// ═══════════════════════════════════════════════════════════════════════════════

describe('razorpay create calls — retry on transient, not on 4xx', () => {
  // We test the razorpay module's retry behaviour by mocking the SDK methods.
  // We do this via a mock razorpay instance injected via the __setRazorpayInstance seam.

  it('createOrder retries a 503 then succeeds', async () => {
    const rp = require('../services/razorpay');

    let calls = 0;
    const mockRazorpay = {
      orders: {
        create: vi.fn().mockImplementation(async () => {
          calls++;
          if (calls === 1) {
            throw Object.assign(new Error('Service Unavailable'), {
              statusCode: 503,
            });
          }
          return { id: 'order_ok', amount: 79900, currency: 'INR', receipt: 'r', notes: {} };
        }),
      },
    };

    rp.__setRazorpayInstance(mockRazorpay);

    const order = await rp.createOrder('seeker', '911234567890', 'Test User');
    expect(order.id).toBe('order_ok');
    expect(calls).toBe(2);

    rp.__setRazorpayInstance(null);
  });

  it('createOrder does NOT retry a 400', async () => {
    const rp = require('../services/razorpay');

    let calls = 0;
    const mockRazorpay = {
      orders: {
        create: vi.fn().mockImplementation(async () => {
          calls++;
          throw Object.assign(new Error('Bad Request'), { statusCode: 400 });
        }),
      },
    };

    rp.__setRazorpayInstance(mockRazorpay);

    await expect(rp.createOrder('seeker', '911234567890', 'Test')).rejects.toThrow('Bad Request');
    expect(calls).toBe(1);

    rp.__setRazorpayInstance(null);
  });

  it('createSubscription retries a 503 then succeeds', async () => {
    const rp = require('../services/razorpay');

    let planCalls = 0;
    let subCalls = 0;
    const mockRazorpay = {
      plans: {
        create: vi.fn().mockImplementation(async () => {
          planCalls++;
          return { id: 'plan_ok' };
        }),
      },
      subscriptions: {
        create: vi.fn().mockImplementation(async () => {
          subCalls++;
          if (subCalls === 1) {
            throw Object.assign(new Error('Service Unavailable'), { statusCode: 503 });
          }
          return { id: 'sub_ok', short_url: 'https://rzp.io/l/test' };
        }),
      },
    };

    rp.__setRazorpayInstance(mockRazorpay);
    // Clear plan cache so plans.create is called
    rp.__clearPlanCache();

    const sub = await rp.createSubscription('seeker', { phone: '911234567890' });
    expect(sub.id).toBe('sub_ok');
    expect(subCalls).toBe(2);

    rp.__setRazorpayInstance(null);
  });

  it('createSubscription does NOT retry a 422 validation error', async () => {
    const rp = require('../services/razorpay');

    let subCalls = 0;
    const mockRazorpay = {
      plans: {
        create: vi.fn().mockResolvedValue({ id: 'plan_ok2' }),
      },
      subscriptions: {
        create: vi.fn().mockImplementation(async () => {
          subCalls++;
          throw Object.assign(new Error('Unprocessable Entity'), { statusCode: 422 });
        }),
      },
    };

    rp.__setRazorpayInstance(mockRazorpay);
    rp.__clearPlanCache();

    await expect(rp.createSubscription('seeker', { phone: '911234567890' })).rejects.toThrow(
      'Unprocessable Entity'
    );
    expect(subCalls).toBe(1);

    rp.__setRazorpayInstance(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE — services/storage.js putPhoto
// ═══════════════════════════════════════════════════════════════════════════════

describe('storage putPhoto — retry on transient R2 error', () => {
  it('retries a 503 on the R2 PUT then succeeds', async () => {
    // Set up R2 env so getS3() returns a client
    process.env.R2_ACCOUNT_ID = 'acc';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'bucket';

    const storage = require('../services/storage');

    let putCalls = 0;
    // Mock the S3 send method via the __setS3Client seam
    const mockS3 = {
      send: vi.fn().mockImplementation(async () => {
        putCalls++;
        if (putCalls === 1) {
          throw Object.assign(new Error('Service Unavailable'), { $metadata: { httpStatusCode: 503 } });
        }
        return { ETag: '"etag123"' };
      }),
    };

    storage.__setS3Client(mockS3);

    const buf = Buffer.from('fake-image-data');
    const result = await storage.putPhoto('mirror/test/2026-01-01.jpg', buf);

    // Retry happened — S3 send was called twice
    expect(putCalls).toBe(2);
    expect(result.key).toBe('mirror/test/2026-01-01.jpg');

    storage.__setS3Client(null);

    // Clean up env
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
  });

  it('falls back to local storage after exhausting retries', async () => {
    process.env.R2_ACCOUNT_ID = 'acc';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'bucket';

    const storage = require('../services/storage');

    const mockS3 = {
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('Service Unavailable'), { $metadata: { httpStatusCode: 503 } })
      ),
    };

    storage.__setS3Client(mockS3);

    const buf = Buffer.from('fake-image-data');
    // putPhoto wraps put() which already falls back to { key: null, dryRun: true }
    // on failure — the retried put exhausts and put() returns dryRun
    const result = await storage.putPhoto('mirror/test/2026-01-02.jpg', buf);
    // After retries exhausted, falls back gracefully
    expect(result.dryRun).toBe(true);

    storage.__setS3Client(null);

    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER — notification channels open breaker and swallow errors
// ═══════════════════════════════════════════════════════════════════════════════

describe('circuit breaker — notification channels open and swallow', () => {
  it('email: after threshold failures the circuit opens and calls are swallowed (no throw)', async () => {
    const email = require('../services/email');
    process.env.RESEND_API_KEY = 're_test';
    process.env.WHATSAPP_SEND_MODE = 'all';

    let calls = 0;
    // Use 400 Bad Request (not retryable) so each failure is fast (no backoff).
    // Circuit breaker still counts consecutive failures and opens at threshold=5.
    email.__setTransport(async () => {
      calls++;
      throw Object.assign(new Error('Bad Request'), { status: 400 });
    });

    // Drive the circuit open (5 failures = default threshold)
    const payload = { to: 'a@b.com', subject: 's', html: '<p>h</p>' };
    for (let i = 0; i < 5; i++) {
      await expect(email.sendEmail(payload)).rejects.toThrow();
    }

    const callsBefore = calls;
    // Once open — sendEmail should return a "circuit-open" stub, not throw
    const result = await email.sendEmail(payload);
    // The circuit is open: function returns a stub result without throwing
    expect(result).toBeTruthy();
    expect(result.result).toBe('circuit-open');
    // fn was NOT called again
    expect(calls).toBe(callsBefore);

    email.__resetTransport();
  });

  it('sms: after threshold failures the circuit opens and calls are swallowed', async () => {
    const axios = require('axios');
    process.env.MSG91_AUTH_KEY = 'authkey';
    process.env.MSG91_TEMPLATE_ID_OTP = 'tpl';
    process.env.WHATSAPP_SEND_MODE = 'all';

    let calls = 0;
    // Use 400 Bad Request (not retryable) so each failure is fast (no backoff delay).
    vi.spyOn(axios, 'post').mockImplementation(async () => {
      calls++;
      throw Object.assign(new Error('Bad Request'), { status: 400 });
    });

    const sms = require('../services/sms');

    // Drive circuit open
    for (let i = 0; i < 5; i++) {
      await expect(sms.sendOtp('911234567890', '111111')).rejects.toThrow();
    }

    const callsBefore = calls;
    // Circuit open — swallowed
    const result = await sms.sendOtp('911234567890', '111111');
    expect(result.result).toBe('circuit-open');
    expect(calls).toBe(callsBefore);
  });

  it('whatsapp: circuit opens and sendMessageSafe still returns null (no throw)', async () => {
    const axios = require('axios');
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '111';
    process.env.WHATSAPP_SEND_MODE = 'all';

    // Use a 401 Unauthorized error — NOT retryable (4xx), so each call is fast
    // (one attempt, no 2s backoff delay).  Circuit breaker still counts them as
    // failures and opens after 5 consecutive ones.
    vi.spyOn(axios, 'post').mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { status: 401 })
    );

    const whatsapp = require('../services/whatsapp');

    // Drive the circuit open through sendMessageSafe (which never throws)
    for (let i = 0; i < 5; i++) {
      const r = await whatsapp.sendMessageSafe('919958533994', 'test');
      expect(r).toBeNull(); // failures return null
    }

    // Once circuit is open, sendMessageSafe still returns null gracefully
    const postSpy = vi.spyOn(axios, 'post');
    const result = await whatsapp.sendMessageSafe('919958533994', 'test');
    expect(result).toBeNull();
    // Circuit was open — axios.post was NOT called (short-circuited)
    expect(postSpy).not.toHaveBeenCalled();
  }, 15000);
});
