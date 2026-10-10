import '../db/migrate.js';
import { hashPassword } from '../services/password.js';
import { findUserByUsername, insertUser, setAdmin, setPasswordHash } from '../db/users.js';

/** Fixed accounts for this server. Re-runnable: an existing user gets its password and admin flag reset. */
const SEED_USERS = [
  { username: 'unskill', password: '6969', isAdmin: true },
  { username: 'meran', password: '6969', isAdmin: true },
];

for (const { username, password, isAdmin } of SEED_USERS) {
  const passwordHash = await hashPassword(password);
  const existing = findUserByUsername(username);

  if (existing) {
    setPasswordHash(username, passwordHash);
    setAdmin(username, isAdmin);
    console.log(`Updated ${username} (admin=${isAdmin}).`);
  } else {
    const user = insertUser(username, passwordHash);
    setAdmin(user.username, isAdmin);
    console.log(`Created ${username} (admin=${isAdmin}).`);
  }
}
