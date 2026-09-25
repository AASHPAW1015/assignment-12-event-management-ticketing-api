const express = require("express");
const verifyToken = require("../middleware/auth");
const { verifyAttendee } = require("../middleware/checkRole");
const { bookingLimiter } = require("../middleware/rateLimiter");
const {
  bookTicket,
  getMyTickets,
  cancelTicket,
} = require("../controllers/ticketController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tickets
 *   description: Atomic booking, my tickets and cancellation (attendee)
 */

/**
 * @swagger
 * /api/tickets/book:
 *   post:
 *     summary: Book tickets (attendee, max 10 requests / minute)
 *     description: |
 *       Runs inside a Firestore transaction: the event is read, the seat count
 *       checked and decremented, and the ticket written together, so tickets
 *       are never oversold. attendeeName / attendeeEmail default to the
 *       logged-in user.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventId, quantity]
 *             properties:
 *               eventId: { type: string }
 *               quantity: { type: integer, example: 2 }
 *               attendeeName: { type: string, example: Kunal Sharma }
 *               attendeeEmail: { type: string, example: kunal@gmail.com }
 *     responses:
 *       201:
 *         description: Tickets booked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 ticket: { $ref: '#/components/schemas/Ticket' }
 *       400:
 *         description: Invalid fields or event already happened
 *       403:
 *         description: Not an attendee
 *       404:
 *         description: Event not found
 *       409:
 *         description: Insufficient tickets available
 *       429:
 *         description: Too many booking attempts
 */
router.post("/book", bookingLimiter, verifyToken, verifyAttendee, bookTicket);

/**
 * @swagger
 * /api/tickets/my-tickets:
 *   get:
 *     summary: List my tickets, newest first (attendee)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My tickets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 tickets:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Ticket' }
 *       403:
 *         description: Not an attendee
 */
router.get("/my-tickets", verifyToken, verifyAttendee, getMyTickets);

/**
 * @swagger
 * /api/tickets/{id}/cancel:
 *   post:
 *     summary: Cancel my ticket and return the seats to the event (attendee)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Ticket cancelled
 *       400:
 *         description: Already cancelled or event already happened
 *       403:
 *         description: Not your ticket
 *       404:
 *         description: Ticket not found
 */
router.post("/:id/cancel", verifyToken, verifyAttendee, cancelTicket);

module.exports = router;
