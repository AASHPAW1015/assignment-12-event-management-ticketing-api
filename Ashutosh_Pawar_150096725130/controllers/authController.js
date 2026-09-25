const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../config/firebaseConfig");

const users = db.collection("users");
const ROLES = ["attendee", "organizer"];

// Strip the password hash before a user object ever leaves the API.
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

async function findByEmail(email) {
  const snapshot = await users.where("email", "==", email).limit(1).get();
  if (snapshot.empty) {
    return null;
  }
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function register(request, response) {
  try {
    const name = String(request.body.name ?? "").trim();
    const { password } = request.body;
    // normalize so "A@x.com" and "a@x.com" are the same account
    const email = String(request.body.email ?? "").toLowerCase().trim();
    const role = String(request.body.role ?? "attendee").toLowerCase();

    if (!name || !email || !password) {
      return response
        .status(400)
        .json({ message: "name, email and password are required" });
    }

    if (String(password).length < 6) {
      return response
        .status(400)
        .json({ message: "password must be at least 6 characters" });
    }

    if (!ROLES.includes(role)) {
      return response
        .status(400)
        .json({ message: "role must be attendee or organizer" });
    }

    const existing = await findByEmail(email);
    if (existing) {
      return response.status(409).json({ message: "Email already registered" });
    }

    // 10 salt rounds. bcrypt stores the salt inside the hash, so no extra field.
    const hashed = await bcrypt.hash(String(password), 10);
    const data = {
      name,
      email,
      password: hashed,
      role,
      createdAt: new Date().toISOString(),
    };
    const ref = await users.add(data);

    return response
      .status(201)
      .json({ message: "User registered", user: publicUser({ id: ref.id, ...data }) });
  } catch (error) {
    return response.status(500).json({ message: error.message });
  }
}

async function login(request, response) {
  try {
    const { password } = request.body;
    const email = String(request.body.email ?? "").toLowerCase().trim();

    if (!email || !password) {
      return response
        .status(400)
        .json({ message: "email and password are required" });
    }

    const user = await findByEmail(email);
    if (!user) {
      return response.status(401).json({ message: "Invalid credentials" });
    }

    const matches = await bcrypt.compare(String(password), user.password);
    if (!matches) {
      return response.status(401).json({ message: "Invalid credentials" });
    }

    // role + name baked into the token: RBAC needs no DB read per request, and
    // booking can default the attendee name/email from it.
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    return response.status(200).json({
      message: "Login successful",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    return response.status(500).json({ message: error.message });
  }
}

async function getProfile(request, response) {
  try {
    const doc = await users.doc(request.user.id).get();
    if (!doc.exists) {
      return response.status(404).json({ message: "User not found" });
    }
    return response
      .status(200)
      .json({ user: publicUser({ id: doc.id, ...doc.data() }) });
  } catch (error) {
    return response.status(500).json({ message: error.message });
  }
}

module.exports = { register, login, getProfile };
