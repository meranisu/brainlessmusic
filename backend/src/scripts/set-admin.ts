import '../db/migrate.js';
import { findUserByUsername, setAdmin } from '../db/users.js';

const [username, flag] = process.argv.slice(2);
const isAdmin = flag !== 'false';

if (!username) {
  console.error('Usage: npm run set-admin -- <username> [false]');
  process.exit(1);
}

if (!findUserByUsername(username)) {
  console.error(`No user found with username "${username}"`);
  process.exit(1);
}

const user = setAdmin(username, isAdmin);
console.log(`${user!.username} is_admin=${user!.is_admin}`);
