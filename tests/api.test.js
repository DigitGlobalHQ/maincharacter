import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Point the User model at a throwaway store and force WhatsApp into dry-run
// BEFORE anything is required, so no real data or messages are touched.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-api-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.ADMIN_PHONE = '919958533994';

const request = require('supertest');
const express = require('express');
const apiRouter = require('../routes/api');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/enroll', () => {
  it('creates a user and returns a token', async () => {
    const res = await request(app)
      .post('/api/enroll')
      .send({ name: 'Aria', phone: '918000000001', preferredTime: '08:00' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.userId).toBeTruthy();
    expect(res.body.alreadyEnrolled).toBeUndefined();
  });

  it('is idempotent — a repeat enrol does not re-create or re-welcome (P1.6)', async () => {
    const first = await request(app)
      .post('/api/enroll')
      .send({ name: 'Bo', phone: '918000000002', preferredTime: '09:00' });
    const second = await request(app)
      .post('/api/enroll')
      .send({ name: 'Bo Again', phone: '918000000002', preferredTime: '09:00' });

    expect(second.status).toBe(200);
    expect(second.body.alreadyEnrolled).toBe(true);
    expect(second.body.userId).toBe(first.body.userId); // same account
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/enroll').send({ name: 'NoPhone' });
    expect(res.status).toBe(400);
  });
});

describe('webhook side-effect parity (P1.3)', () => {
  it('START NOW advances to Day 1 via the HTTP route', async () => {
    await request(app)
      .post('/api/enroll')
      .send({ name: 'Cy', phone: '918000000003', preferredTime: '08:00' });

    await request(app)
      .post('/api/webhook/whatsapp')
      .send({ waId: '918000000003', text: 'START NOW' });

    // handler runs async after the 'received' response; let it settle
    await new Promise((r) => setTimeout(r, 50));
    expect(User.getUserByPhone('918000000003').day).toBe(1);
  });

  it('parses the Meta Cloud API payload shape (entry → changes → messages)', async () => {
    await request(app)
      .post('/api/enroll')
      .send({ name: 'Fi', phone: '918000000006', preferredTime: '08:00' });

    await apiRouter.processWhatsAppWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: 'Fi' } }],
                messages: [{ from: '918000000006', type: 'text', text: { body: 'START NOW' } }],
              },
            },
          ],
        },
      ],
    });
    expect(User.getUserByPhone('918000000006').day).toBe(1);
  });

  it('ignores a Meta status-update payload (statuses, no messages)', async () => {
    await request(app)
      .post('/api/enroll')
      .send({ name: 'Gus', phone: '918000000007', preferredTime: '08:00' });

    await apiRouter.processWhatsAppWebhook({
      entry: [{ changes: [{ value: { statuses: [{ status: 'delivered', recipient_id: '918000000007' }] } }] }],
    });
    expect(User.getUserByPhone('918000000007').day).toBe(0); // unchanged
  });

  it('legacy /api/webhook/wati 308-redirects to /api/webhook/whatsapp', async () => {
    const res = await request(app).post('/api/webhook/wati').send({});
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/api/webhook/whatsapp');
  });

  it('GET /api/webhook/whatsapp echoes the hub.challenge when the verify token matches', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'tok-verify';
    const res = await request(app)
      .get('/api/webhook/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok-verify', 'hub.challenge': 'echo-42' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('echo-42');
    delete process.env.WHATSAPP_VERIFY_TOKEN;
  });

  it('direct processWhatsAppWebhook call produces the identical side effect', async () => {
    await request(app)
      .post('/api/enroll')
      .send({ name: 'Di', phone: '918000000004', preferredTime: '08:00' });

    await apiRouter.processWhatsAppWebhook({ waId: '918000000004', text: 'START NOW' });
    expect(User.getUserByPhone('918000000004').day).toBe(1);
  });

  it('ignores owner=true (bot echo) — no state change', async () => {
    await request(app)
      .post('/api/enroll')
      .send({ name: 'Ed', phone: '918000000005', preferredTime: '08:00' });

    await apiRouter.processWhatsAppWebhook({ waId: '918000000005', text: 'START NOW', owner: true });
    expect(User.getUserByPhone('918000000005').day).toBe(0); // unchanged
  });
});
