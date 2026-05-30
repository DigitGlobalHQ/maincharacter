/**
 * Test helper — mint a signed-in Lookmaxing session (funnel-repair P1).
 * The guest flow was removed; tests now authenticate as a real user via a
 * Lookmaxing-scoped JWT. Import this AFTER setting USERS_FILE_PATH + JWT_SECRET
 * (it statically imports the User model, which resolves its store path at load).
 */
import authLib from '../../lib/lookmax-auth.js';
import User from '../../models/User.js';

const { signLookmaxToken } = authLib;

let n = 0;

/** Create a fresh signed-in user. Returns { user, token, bearer }. */
export async function makeSession() {
  n += 1;
  const email = `tester${n}_${process.pid}@example.test`;
  const user = await User.getOrCreateByEmail({ email, name: 'Tester' });
  const token = signLookmaxToken(user);
  return { user, token, bearer: `Bearer ${token}` };
}
