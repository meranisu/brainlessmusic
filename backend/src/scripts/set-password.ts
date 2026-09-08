import '../db/migrate.js';
import { hashPassword } from '../services/password.js';
import { findUserByUsername, setPasswordHash } from '../db/users.js';

const [username, newPassword] = process.argv.slice(2);

if (!username || !newPassword) {
  console.error('Usage: npm run set-password -- <username> <new-password>');
  process.exit(1);
}

if (!findUserByUsername(username)) {
  console.error(`No user found with username "${username}"`);
  process.exit(1);
}

const passwordHash = await hashPassword(newPassword);
const user = setPasswordHash(username, passwordHash);
console.log(`Password updated for ${user!.username}.`);
