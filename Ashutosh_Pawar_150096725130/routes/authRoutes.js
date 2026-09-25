const express = require("express");
const verifyToken = require("../middleware/auth");
const { register, login, getProfile } = require("../controllers/authController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Registration, login and profile
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register as an attendee or organizer
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, example: Kunal Sharma }
 *               email: { type: string, example: kunal@gmail.com }
 *               password: { type: string, example: secret123 }
 *               role: { type: string, enum: [attendee, organizer], default: attendee }
 *     responses:
 *       201:
 *         description: User registered
 *       400:
 *         description: Missing or invalid fields
 *       409:
 *         description: Email already registered
 */
router.post("/register", register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in and receive a JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: kunal@gmail.com }
 *               password: { type: string, example: secret123 }
 *     responses:
 *       200:
 *         description: Login successful, returns token and user
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", login);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get the logged-in user's profile and role
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Missing or invalid token
 */
router.get("/profile", verifyToken, getProfile);

module.exports = router;
