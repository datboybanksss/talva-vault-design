/**
 * TEMPORARY — TESTING ONLY. REMOVE BEFORE LAUNCH.
 *
 * While the sending domain is unverified, sign-in codes cannot actually reach
 * an inbox, which makes QA impossible. With this flag on, the code-entry
 * screens show a clearly marked "Skip verification (testing only)" control
 * that marks the session verified without checking a code.
 *
 * It does NOT alter code generation, hashing, expiry, attempt counting or
 * rate limiting — all of that real logic is untouched.
 *
 * !!! SET THIS TO false (or delete this file and its three usages) BEFORE LAUNCH !!!
 */
export const MFA_CODE_BYPASS_FOR_TESTING = true;
