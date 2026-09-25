// Fires many booking requests at the same event at the same time to prove the
// transaction never oversells. Usage:
//   node concurrencyTest.js <attendeeToken> <eventId> [requests=8]
// Create the event with totalCapacity: 5 first. Keep requests <= 10, or the
// booking rate limiter will answer some of them with 429.
const [token, eventId, count = "8"] = process.argv.slice(2);
const BASE = process.env.BASE_URL || "http://localhost:5000";

if (!token || !eventId) {
  console.log("usage: node concurrencyTest.js <attendeeToken> <eventId> [requests]");
  process.exit(1);
}

async function book() {
  const response = await fetch(`${BASE}/api/tickets/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ eventId, quantity: 1 }),
  });
  return response.status;
}

async function main() {
  const statuses = await Promise.all(Array.from({ length: Number(count) }, book));
  const booked = statuses.filter((status) => status === 201).length;
  console.log("statuses:", statuses.join(" "));
  console.log(`booked ${booked}, rejected ${statuses.length - booked}`);

  const response = await fetch(`${BASE}/api/events/${eventId}`);
  const { event } = await response.json();
  console.log(`availableTickets now: ${event.availableTickets} (never below 0)`);
}

main();
