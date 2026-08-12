// Mirrors isFacultyEmail() in server/server.js: CUTM student addresses
// start with a roll number (digits), staff addresses start with a name
// (letters), both on the cutm.ac.in / cutmap.ac.in domains. This is a UX
// convenience only (hide a button that would just 403) — the server is
// still the actual authority and re-checks this on every write.
const FACULTY_EMAIL_DOMAINS = ['cutm.ac.in', 'cutmap.ac.in'];

export function isFacultyEmail(email) {
  if (!email) return false;
  const [local, domain] = String(email).toLowerCase().split('@');
  if (!local || !domain) return false;
  if (!FACULTY_EMAIL_DOMAINS.includes(domain)) return false;
  return /^[a-z]/.test(local);
}
