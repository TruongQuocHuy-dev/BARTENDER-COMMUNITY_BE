import admin from '../utils/firebaseAdmin.js'

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('🔐 Incoming Authorization Header:', authHeader); // 👈 Thêm dòng này

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ No token provided');
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('✅ Firebase token verified:', decodedToken); // 👈 Thêm dòng này

    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error);
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};


export default verifyFirebaseToken
