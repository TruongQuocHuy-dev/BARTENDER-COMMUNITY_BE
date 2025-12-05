import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

export default async function verifyGoogleToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No token provided" });

    const token = authHeader.split(" ")[1];
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_WEB_CLIENT_ID,
    });

    req.googleUser = ticket.getPayload(); // gắn user google vào request
    next();
  } catch (err) {
    console.error("verifyGoogleToken error:", err);
    res.status(401).json({ message: "Invalid Google token" });
  }
}
