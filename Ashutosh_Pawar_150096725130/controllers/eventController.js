const { db } = require("../config/firebaseConfig");

const events = db.collection("events");
const tickets = db.collection("tickets");

const TEXT_FIELDS = ["title", "description", "category", "venue", "city"];

// eventDate is always stored as a full UTC ISO string, so plain string
// comparison orders dates correctly -- that is what makes the Firestore
// "eventDate > now" query below work without a Timestamp field.
function eventStatus(event) {
  return event.eventDate > new Date().toISOString() ? "upcoming" : "completed";
}

function withStatus(event) {
  return { ...event, status: eventStatus(event) };
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Loads an event and checks the caller organizes it. Throws coded errors that
// sendError() below turns into 404 / 403.
async function findOwnedEvent(id, userId) {
  const doc = await events.doc(id).get();
  if (!doc.exists) {
    throw new Error("NOT_FOUND");
  }
  const event = { id: doc.id, ...doc.data() };
  if (event.organizerId !== userId) {
    throw new Error("NOT_OWNER");
  }
  return event;
}

function sendError(response, error) {
  if (error.message === "NOT_FOUND") {
    return response.status(404).json({ message: "Event not found" });
  }
  if (error.message === "NOT_OWNER") {
    return response
      .status(403)
      .json({ message: "You can only manage events you organize" });
  }
  if (error.message === "BELOW_SOLD") {
    return response.status(400).json({
      message: "totalCapacity cannot be lower than the tickets already sold",
    });
  }
  return response.status(500).json({ message: error.message });
}

async function getEvents(request, response) {
  try {
    // ?status=upcoming (default) | completed | all
    const status = String(request.query.status ?? "upcoming").toLowerCase();
    const now = new Date().toISOString();

    // single-field range filter -> served by Firestore's automatic index
    let query = events;
    if (status === "upcoming") query = events.where("eventDate", ">", now);
    if (status === "completed") query = events.where("eventDate", "<=", now);

    const snapshot = await query.get();
    let list = snapshot.docs.map((doc) => withStatus({ id: doc.id, ...doc.data() }));

    // category / city filtering in memory, so no composite index is needed
    if (request.query.category) {
      const wanted = String(request.query.category).toLowerCase();
      list = list.filter((event) => String(event.category).toLowerCase() === wanted);
    }
    if (request.query.city) {
      const wanted = String(request.query.city).toLowerCase();
      list = list.filter((event) =>
        String(event.city || event.venue).toLowerCase().includes(wanted),
      );
    }

    // soonest first
    list.sort((a, b) => (a.eventDate > b.eventDate ? 1 : -1));
    return response.status(200).json({ count: list.length, events: list });
  } catch (error) {
    return response.status(500).json({ message: error.message });
  }
}

async function getEventById(request, response) {
  try {
    const doc = await events.doc(request.params.id).get();
    if (!doc.exists) {
      return response.status(404).json({ message: "Event not found" });
    }
    const event = withStatus({ id: doc.id, ...doc.data() });
    const ticketsSold = event.totalCapacity - event.availableTickets;
    return response.status(200).json({ event: { ...event, ticketsSold } });
  } catch (error) {
    return response.status(500).json({ message: error.message });
  }
}

async function createEvent(request, response) {
  try {
    const fields = {};
    for (const key of TEXT_FIELDS) {
      fields[key] = String(request.body[key] ?? "").trim();
    }

    const { title, description, category, venue } = fields;
    if (!title || !description || !category || !venue) {
      return response.status(400).json({
        message:
          "title, description, category, venue, eventDate, ticketPrice and totalCapacity are required",
      });
    }

    const eventDate = parseDate(request.body.eventDate);
    if (!eventDate || eventDate <= new Date().toISOString()) {
      return response
        .status(400)
        .json({ message: "eventDate must be a valid date in the future" });
    }

    const ticketPrice = Number(request.body.ticketPrice);
    if (!Number.isFinite(ticketPrice) || ticketPrice < 0) {
      return response
        .status(400)
        .json({ message: "ticketPrice must be a number of 0 or more" });
    }

    const totalCapacity = Number(request.body.totalCapacity);
    if (!Number.isInteger(totalCapacity) || totalCapacity < 1) {
      return response
        .status(400)
        .json({ message: "totalCapacity must be a whole number of at least 1" });
    }

    const data = {
      ...fields,
      eventDate,
      organizerId: request.user.id,
      ticketPrice,
      totalCapacity,
      availableTickets: totalCapacity, // every seat free on day one
      createdAt: new Date().toISOString(),
    };
    const ref = await events.add(data);

    return response
      .status(201)
      .json({ message: "Event created", event: withStatus({ id: ref.id, ...data }) });
  } catch (error) {
    return response.status(500).json({ message: error.message });
  }
}

async function updateEvent(request, response) {
  try {
    await findOwnedEvent(request.params.id, request.user.id);

    // Only these fields can be edited; anything else in the body is ignored.
    const fields = {};
    for (const key of TEXT_FIELDS) {
      if (request.body[key] !== undefined) {
        fields[key] = String(request.body[key]).trim();
      }
    }

    if (request.body.eventDate !== undefined) {
      const eventDate = parseDate(request.body.eventDate);
      if (!eventDate) {
        return response.status(400).json({ message: "eventDate is not a valid date" });
      }
      fields.eventDate = eventDate;
    }

    if (request.body.ticketPrice !== undefined) {
      const price = Number(request.body.ticketPrice);
      if (!Number.isFinite(price) || price < 0) {
        return response
          .status(400)
          .json({ message: "ticketPrice must be a number of 0 or more" });
      }
      fields.ticketPrice = price;
    }

    let newCapacity;
    if (request.body.totalCapacity !== undefined) {
      newCapacity = Number(request.body.totalCapacity);
      if (!Number.isInteger(newCapacity) || newCapacity < 1) {
        return response
          .status(400)
          .json({ message: "totalCapacity must be a whole number of at least 1" });
      }
    }

    if (Object.keys(fields).length === 0 && newCapacity === undefined) {
      return response.status(400).json({ message: "No valid fields to update" });
    }

    // Capacity change runs in a transaction: a booking landing at the same
    // moment can't slip between reading "sold" and writing availableTickets.
    const eventRef = events.doc(request.params.id);
    const event = await db.runTransaction(async (tx) => {
      const doc = await tx.get(eventRef);
      if (!doc.exists) {
        throw new Error("NOT_FOUND");
      }
      const current = doc.data();
      const update = { ...fields };

      if (newCapacity !== undefined) {
        const sold = current.totalCapacity - current.availableTickets;
        if (newCapacity < sold) {
          throw new Error("BELOW_SOLD");
        }
        update.totalCapacity = newCapacity;
        update.availableTickets = newCapacity - sold;
      }

      tx.update(eventRef, update);
      return { id: doc.id, ...current, ...update };
    });

    return response
      .status(200)
      .json({ message: "Event updated", event: withStatus(event) });
  } catch (error) {
    return sendError(response, error);
  }
}

async function deleteEvent(request, response) {
  try {
    const event = await findOwnedEvent(request.params.id, request.user.id);

    // Cancel every confirmed ticket and delete the event in one batch, so
    // attendees never hold a "confirmed" ticket for an event that is gone.
    const snapshot = await tickets.where("eventId", "==", event.id).get();
    const batch = db.batch();
    const cancelledAt = new Date().toISOString();
    let cancelledTickets = 0;

    snapshot.docs.forEach((doc) => {
      if (doc.data().status === "confirmed") {
        batch.update(doc.ref, { status: "cancelled", cancelledAt, cancelReason: "event cancelled" });
        cancelledTickets += 1;
      }
    });
    batch.delete(events.doc(event.id));
    await batch.commit();

    return response
      .status(200)
      .json({ message: "Event cancelled and deleted", cancelledTickets });
  } catch (error) {
    return sendError(response, error);
  }
}

async function getAttendees(request, response) {
  try {
    const event = await findOwnedEvent(request.params.id, request.user.id);

    const snapshot = await tickets.where("eventId", "==", event.id).get();
    const attendees = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((ticket) => ticket.status === "confirmed")
      .sort((a, b) => (a.bookedAt > b.bookedAt ? 1 : -1))
      .map((ticket) => ({
        ticketId: ticket.id,
        bookingRef: ticket.bookingRef,
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
        quantity: ticket.quantity,
        totalPaid: ticket.totalPaid,
        bookedAt: ticket.bookedAt,
      }));

    const ticketsSold = attendees.reduce((sum, a) => sum + a.quantity, 0);
    const revenue = attendees.reduce((sum, a) => sum + a.totalPaid, 0);

    return response.status(200).json({
      event: { id: event.id, title: event.title, eventDate: event.eventDate },
      count: attendees.length,
      ticketsSold,
      revenue,
      attendees,
    });
  } catch (error) {
    return sendError(response, error);
  }
}

module.exports = {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getAttendees,
};
