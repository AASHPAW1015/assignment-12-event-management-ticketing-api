const express = require("express");
const verifyToken = require("../middleware/auth");
const { verifyOrganizer } = require("../middleware/checkRole");
const {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getAttendees,
} = require("../controllers/eventController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Events
 *   description: Browse events (public) and manage them (organizer)
 */

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Browse events (upcoming by default)
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string, example: Technology }
 *       - in: query
 *         name: city
 *         schema: { type: string, example: Mumbai }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [upcoming, completed, all], default: upcoming }
 *     responses:
 *       200:
 *         description: List of events, soonest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 events:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Event' }
 */
router.get("/", getEvents);

/**
 * @swagger
 * /api/events/{id}:
 *   get:
 *     summary: Event details with live remaining ticket count
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The event
 *       404:
 *         description: Event not found
 */
router.get("/:id", getEventById);

/**
 * @swagger
 * /api/events:
 *   post:
 *     summary: Create an event listing (organizer)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, category, eventDate, venue, ticketPrice, totalCapacity]
 *             properties:
 *               title: { type: string, example: Global Cloud & AI Summit 2026 }
 *               description: { type: string, example: Annual flagship backend conference }
 *               category: { type: string, example: Technology }
 *               eventDate: { type: string, example: "2026-12-15T09:00:00Z" }
 *               venue: { type: string, example: "Bandra Kurla Complex, Mumbai" }
 *               city: { type: string, example: Mumbai }
 *               ticketPrice: { type: number, example: 1499 }
 *               totalCapacity: { type: integer, example: 500 }
 *     responses:
 *       201:
 *         description: Event created
 *       400:
 *         description: Missing or invalid fields
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not an organizer
 */
router.post("/", verifyToken, verifyOrganizer, createEvent);

/**
 * @swagger
 * /api/events/{id}:
 *   put:
 *     summary: Update an event (organizer, must own it)
 *     description: Changing totalCapacity keeps sold tickets and recalculates availableTickets inside a transaction.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               category: { type: string }
 *               eventDate: { type: string }
 *               venue: { type: string }
 *               city: { type: string }
 *               ticketPrice: { type: number }
 *               totalCapacity: { type: integer }
 *     responses:
 *       200:
 *         description: Event updated
 *       400:
 *         description: Invalid fields or capacity below tickets sold
 *       403:
 *         description: Not an organizer, or not the owner
 *       404:
 *         description: Event not found
 */
router.put("/:id", verifyToken, verifyOrganizer, updateEvent);

/**
 * @swagger
 * /api/events/{id}:
 *   delete:
 *     summary: Cancel and delete an event (organizer, must own it)
 *     description: Every confirmed ticket for the event is marked cancelled in the same batch.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Event cancelled and deleted
 *       403:
 *         description: Not an organizer, or not the owner
 *       404:
 *         description: Event not found
 */
router.delete("/:id", verifyToken, verifyOrganizer, deleteEvent);

/**
 * @swagger
 * /api/events/{id}/attendees:
 *   get:
 *     summary: List confirmed attendees of an event (organizer, must own it)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Attendee list with tickets sold and revenue
 *       403:
 *         description: Not an organizer, or not the owner
 *       404:
 *         description: Event not found
 */
router.get("/:id/attendees", verifyToken, verifyOrganizer, getAttendees);

module.exports = router;
