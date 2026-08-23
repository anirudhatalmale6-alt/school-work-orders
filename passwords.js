// Password rules, enforced on the server. Changing MIN_LENGTH here changes it
// everywhere, including the message shown to staff on the change-password screen.
const MIN_LENGTH = 10;

const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', '1234567890', '12345678',
  'qwertyuiop', 'letmein123', 'welcome123', 'school2026', 'school1234',
  'iloveyou1', 'adminadmin', 'changeme1', 'maintenance'
]);

function describeRules() {
  return `At least ${MIN_LENGTH} characters, including one letter and one number. It cannot be your email address or a commonly used password.`;
}

function validatePassword(password, email) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters long.`;
  }
  if (password.length > 200) {
    return 'Password is too long (200 characters maximum).';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  if (COMMON.has(password.toLowerCase())) {
    return 'That password is too common. Please choose something less guessable.';
  }
  if (email && password.toLowerCase() === String(email).toLowerCase()) {
    return 'Password cannot be the same as your email address.';
  }
  return null;
}

// Used when an admin adds a staff member or resets a password: readable enough to
// read out loud or type from a sticky note, random enough to not be guessable.
function generateTempPassword() {
  const words = ['maple', 'harbor', 'copper', 'lantern', 'meadow', 'cedar', 'ridge',
                 'compass', 'willow', 'anchor', 'quarry', 'beacon'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${pick()}-${pick()}-${digits}`;
}

module.exports = { validatePassword, describeRules, generateTempPassword, MIN_LENGTH };
