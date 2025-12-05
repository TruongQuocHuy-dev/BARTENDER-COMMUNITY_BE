import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: '<your-bucket-name>.appspot.com'
});

const bucket = admin.storage().bucket();

export default bucket;
