const { db } = require("../config/firebaseConfig");

const events = db.collection("events");
const tickets = db.collection("tickets");

// one booking can hold at most this many seats
const MAX_PER_BOOKING = 10;

async function bookTicket(request, response) {
  try {
    const eventId = String(request.body.eventId ?? "").trim();
    const quantity = Number(request.body.quantity ?? 1);
    // default to the logged-in user's details when the body leaves them out
    const attendeeName = String(request.body.attendeeName ?? request.user.name ?? "").trim();
    const attendeeEmail = String(request.body.attendeeEmail ?? request.user.email ?? "")
      .toLowerCase()
      .trim();

    if (!eventId) {
      return response.status(400).json({ message: "eventId is required" });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PER_BOOKING) {
      return response.status(400).json({
        message: `quantity must be a whole number from 1 to ${MAX_PER_BOOKING}`,
      });
    }
    if (!attendeeName || !attendeeEmail) {
      return response
        .status(400)
        .json({ message: "attendeeName and attendeeEmail are required" });
    }

    const eventRef = events.doc(eventId);
    const ticketRef = tickets.doc(); // pre-allocate the id

    // Read + check + decrement all happen inside one transaction. If two
    // buyers race for the last seats, Firestore retries the loser with the
    // fresh count, so availableTickets can never go below 0.
    const ticket = await db.runTransaction(async (tx) => {
      const eventDoc = await tx.get(eventRef);
      if (!eventDoc.exists) {
        throw new Error("NOT_FOUND");
      }

      const event = eventDoc.data();
      if (event.eventDate <= new Date().toISOString()) {
        throw new Error("EVENT_OVER");
      }
      if (event.availableTickets < quantity) {
        throw new Error("SOLD_OUT");
      }

      tx.update(eventRef, { availableTickets: event.availableTickets - quantity });

      const now = new Date();
      const data = {
        eventId,
        eventTitle: event.title,
        userId: request.user.id,
        attendeeName,
        attendeeEmail,
        quantity,
        totalPaid: quantity * event.ticketPrice,
        // doc ids are random, so the ref is unique without a counter
        bookingRef: `TKT-${now.getFullYear()}-${ticketRef.id.slice(0, 6).toUpperCase()}`,
        status: "confirmed",
        bookedAt: now.toISOString(),
      };
      tx.set(ticketRef, data);
      return { id: ticketRef.id, ...data, remainingTickets: event.availableTickets - quantity };
    });

    return response.status(201).json({ message: "Tickets booked successfully", ticket });
  } catch (error) {
    if (error.message === "NOT_FOUND") {
      return response.status(404).json({ message: "Event not found" });
    }
    if (error.message === "EVENT_OVER") {
      return response
        .status(400)
        .json({ message: "This event has already taken place" });
    }
    if (error.message === "SOLD_OUT") {
      return response
        .status(409)
        .json({ message: "Insufficient tickets available" });
    }
    return response.status(500).json({ message: error.message });
  }
}

async function getMyTickets(request, response) {
  try {
    // equality filter only -> no composite index; newest first sorted in JS
    const snapshot = await tickets.where("userId", "==", request.user.id).get();
    const list = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.bookedAt < b.bookedAt ? 1 : -1));

    return response.status(200).json({ count: list.length, tickets: list });
  } catch (error) {
    return response.status(500).json({ message: error.message });
  }
}

async function cancelTicket(request, response) {
  try {
    const ticketRef = tickets.doc(request.params.id);

    // Status flip and seat restore in one transaction, so a double-click
    // can't hand the same seats back to the pool twice.
    const ticket = await db.runTransaction(async (tx) => {
      // reads first, then writes -- Firestore requires this ordering
      const ticketDoc = await tx.get(ticketRef);
      if (!ticketDoc.exists) {
        throw new Error("NOT_FOUND");
      }
      const current = ticketDoc.data();
      if (current.userId !== request.user.id) {
        throw new Error("NOT_OWNER");
      }
      if (current.status !== "confirmed") {
        throw new Error("ALREADY_CANCELLED");
      }

      const eventRef = events.doc(current.eventId);
      const eventDoc = await tx.get(eventRef);
      if (eventDoc.exists) {
        const event = eventDoc.data();
        if (event.eventDate <= new Date().toISOString()) {
          throw new Error("EVENT_OVER");
        }
        const restored = Math.min(event.totalCapacity, event.availableTickets + current.quantity);
        tx.update(eventRef, { availableTickets: restored });
      }

      const cancelledAt = new Date().toISOString();
      tx.update(ticketRef, { status: "cancelled", cancelledAt });
      return { id: ticketDoc.id, ...current, status: "cancelled", cancelledAt };
    });

    return response.status(200).json({ message: "Ticket cancelled", ticket });
  } catch (error) {
    if (error.message === "NOT_FOUND") {
      return response.status(404).json({ message: "Ticket not found" });
    }
    if (error.message === "NOT_OWNER") {
      return response
        .status(403)
        .json({ message: "You can only cancel your own tickets" });
    }
    if (error.message === "ALREADY_CANCELLED") {
      return response.status(400).json({ message: "Ticket is already cancelled" });
    }
    if (error.message === "EVENT_OVER") {
      return response
        .status(400)
        .json({ message: "Cannot cancel a ticket for an event that already happened" });
    }
    return response.status(500).json({ message: error.message });
  }
}

module.exports = { bookTicket, getMyTickets, cancelTicket };
