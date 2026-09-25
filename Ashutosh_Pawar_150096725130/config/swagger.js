// Swagger / OpenAPI 3.0 config. swagger-jsdoc reads the @swagger JSDoc blocks
// written above each route in ./routes/*.js and builds the spec from them.
// The shared schemas below are referenced from those blocks with $ref.
const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Event Management & Ticketing API",
      version: "1.0.0",
      description:
        "Event listing and live ticket booking: Firebase Firestore store, " +
        "JWT + bcrypt role-based auth (organizer vs attendee), transactional " +
        "booking so tickets are never oversold, and rate limiting against " +
        "scalper bots.",
    },
    // relative, so "Try it out" hits whichever host serves the docs
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string", example: "kJ2h9sLpQ..." },
            name: { type: "string", example: "Kunal Sharma" },
            email: { type: "string", example: "kunal@gmail.com" },
            role: { type: "string", enum: ["attendee", "organizer"] },
            createdAt: { type: "string", example: "2026-03-01T12:00:00.000Z" },
          },
        },
        Event: {
          type: "object",
          properties: {
            id: { type: "string", example: "event_doc_id_101" },
            title: { type: "string", example: "Global Cloud & AI Summit 2026" },
            description: { type: "string", example: "Annual flagship backend conference" },
            category: { type: "string", example: "Technology" },
            eventDate: { type: "string", example: "2026-12-15T09:00:00.000Z" },
            venue: { type: "string", example: "Bandra Kurla Complex, Mumbai" },
            city: { type: "string", example: "Mumbai" },
            organizerId: { type: "string" },
            ticketPrice: { type: "number", example: 1499 },
            totalCapacity: { type: "integer", example: 500 },
            availableTickets: { type: "integer", example: 482 },
            status: { type: "string", enum: ["upcoming", "completed"] },
            createdAt: { type: "string", example: "2026-03-01T12:00:00.000Z" },
          },
        },
        Ticket: {
          type: "object",
          properties: {
            id: { type: "string", example: "ticket_doc_id_88219" },
            eventId: { type: "string" },
            eventTitle: { type: "string", example: "Global Cloud & AI Summit 2026" },
            userId: { type: "string" },
            attendeeName: { type: "string", example: "Kunal Sharma" },
            attendeeEmail: { type: "string", example: "kunal@gmail.com" },
            quantity: { type: "integer", example: 2 },
            totalPaid: { type: "number", example: 2998 },
            bookingRef: { type: "string", example: "TKT-2026-8K2QZA" },
            status: { type: "string", enum: ["confirmed", "cancelled"] },
            bookedAt: { type: "string", example: "2026-03-02T16:20:00.000Z" },
          },
        },
        Message: {
          type: "object",
          properties: { message: { type: "string" } },
        },
      },
    },
  },
  apis: [path.join(__dirname, "../routes/*.js")],
};

module.exports = swaggerJsdoc(options);
