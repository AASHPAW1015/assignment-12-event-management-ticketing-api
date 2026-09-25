// Firebase Admin SDK initialization.
// Credentials are loaded from serviceAccountKey.json in this project root,
// OR from the FIREBASE_SERVICE_ACCOUNT env var (one-line JSON) as a fallback
// so the app can also run on hosts where committing the file is not an option.
const admin = require("firebase-admin");

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  try {
    return require("../serviceAccountKey.json");
  } catch (error) {
    throw new Error(
      "Firebase credentials missing. Add serviceAccountKey.json to the project " +
        "root or set FIREBASE_SERVICE_ACCOUNT in your .env file.",
    );
  }
}

admin.initializeApp({
  credential: admin.credential.cert(loadServiceAccount()),
});

const db = admin.firestore();

module.exports = { admin, db };
