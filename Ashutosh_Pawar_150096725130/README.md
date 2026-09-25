# Event Management & Ticketing API

Assignment 12 - Ashutosh Pawar (150096725130)

REST API for listing events and booking tickets, built on Firebase Firestore.
Users register as an **organizer** or an **attendee** and get a JWT that
carries their role. Organizers create, edit and cancel their own events and see
who is coming. Attendees browse upcoming events, book seats and cancel them.
Every booking runs inside a Firestore transaction (`runTransaction`): the seat
count is read, checked and decremented together with the ticket write, so a
rush of buyers can never push `availableTickets` below 0. The booking route is
rate limited to 10 requests per minute to slow down scalper bots, and the whole
API is documented with Swagger UI.

## Tech stack

- Node.js, Express 5
- Firebase Admin SDK (Firestore)
- jsonwebtoken + bcryptjs for auth
- express-rate-limit
- swagger-jsdoc + swagger-ui-express (OpenAPI 3.0)
- dotenv, cors

## Project structure

```text
Ashutosh_Pawar_150096725130/
├── config/
│   ├── firebaseConfig.js     # Firebase Admin init (key file or env var)
│   └── swagger.js            # OpenAPI definition + shared schemas
├── controllers/
│   ├── authController.js     # register, login, profile
│   ├── eventController.js    # event CRUD, upcoming/completed filter, attendee list
│   └── ticketController.js   # transactional booking, my tickets, cancel
├── middleware/
│   ├── auth.js               # verifyToken (Bearer JWT)
│   ├── checkRole.js          # verifyOrganizer / verifyAttendee
│   └── rateLimiter.js        # 100 / 15 min on /api, 10 / min on booking
├── routes/
│   ├── authRoutes.js         # each route carries its @swagger JSDoc block
│   ├── eventRoutes.js
│   └── ticketRoutes.js
├── concurrencyTest.js        # fires parallel bookings to prove no overselling
├── test.http
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## Setup

1. Firebase Console → Project Settings → Service Accounts → **Generate new
   private key**. Save it as `serviceAccountKey.json` in this folder (it is
   git-ignored). Make sure Firestore is enabled on the project.
2. Install and configure:

   ```bash
   npm install
   cp .env.example .env
   ```

3. Run it:

   ```bash
   npm run dev      # auto-restart on change
   # or
   npm start
   ```

- API root: `http://localhost:5000/`
- Swagger UI: `http://localhost:5000/api-docs`

## Environment variables

| Variable                   | Required | Notes                                                    |
| -------------------------- | :------: | -------------------------------------------------------- |
| `PORT`                     |    no    | defaults to 5000                                         |
| `JWT_SECRET`               |   yes    | signs the login tokens                                   |
| `FIREBASE_SERVICE_ACCOUNT` |    no    | whole service account JSON on one line, used instead of `serviceAccountKey.json` |

## Data models

### `users`

| Field     | Type   | Notes                        |
| --------- | ------ | ---------------------------- |
| name      | string |                              |
| email     | string | lowercased, unique           |
| password  | string | bcrypt hash, never returned  |
| role      | string | `attendee` or `organizer`    |
| createdAt | string | ISO date                     |

### `events`

| Field            | Type   | Notes                                           |
| ---------------- | ------ | ----------------------------------------------- |
| title            | string |                                                 |
| description      | string |                                                 |
| category         | string | e.g. `Technology`                               |
| eventDate        | string | stored as UTC ISO, must be in the future        |
| venue            | string |                                                 |
| city             | string | optional, `?city=` also matches inside `venue`  |
| organizerId      | string | user id of the creator                          |
| ticketPrice      | number | 0 or more                                       |
| totalCapacity    | number | whole number, at least 1                        |
| availableTickets | number | changed only inside transactions                |
| createdAt        | string | ISO date                                        |

`status` (`upcoming` / `completed`) is not stored; it is worked out from
`eventDate` on every read.

### `tickets`

| Field         | Type   | Notes                                   |
| ------------- | ------ | --------------------------------------- |
| eventId       | string |                                         |
| eventTitle    | string | copied at booking time                  |
| userId        | string | attendee who booked                     |
| attendeeName  | string | defaults to the logged-in user's name   |
| attendeeEmail | string | defaults to the logged-in user's email  |
| quantity      | number | 1 to 10 per booking                     |
| totalPaid     | number | `quantity x ticketPrice`                |
| bookingRef    | string | e.g. `TKT-2026-8K2QZA`                  |
| status        | string | `confirmed` or `cancelled`              |
| bookedAt      | string | ISO date                                |
| cancelledAt   | string | set when cancelled                      |

## Authentication

Log in, then send the token on every protected route:

```
Authorization: Bearer <token>
```

A missing, fake or expired token gets `401`. A valid token with the wrong role
gets `403`. Tokens last 1 day.

| Action                           | Attendee | Organizer | Public |
| -------------------------------- | :------: | :-------: | :----: |
| Register / login                 |    ✅    |    ✅     |   ✅   |
| Browse events / event details    |    ✅    |    ✅     |   ✅   |
| Create / edit / delete events    |    ❌    |  ✅ (own) |   ❌   |
| See attendee list                |    ❌    |  ✅ (own) |   ❌   |
| Book / cancel tickets, my tickets|    ✅    |    ❌     |   ❌   |

## Endpoints

### Auth

| Method | Route                | Token | Description                         |
| ------ | -------------------- | :---: | ----------------------------------- |
| POST   | `/api/auth/register` |  no   | register, `role`: attendee/organizer |
| POST   | `/api/auth/login`    |  no   | returns JWT                         |
| GET    | `/api/auth/profile`  |  yes  | logged-in user and role             |

### Events

| Method | Route                        | Token     | Description                                              |
| ------ | ---------------------------- | --------- | -------------------------------------------------------- |
| GET    | `/api/events`                | no        | upcoming events, `?category=` `?city=` `?status=completed/all` |
| GET    | `/api/events/:id`            | no        | details + live `availableTickets` and `ticketsSold`      |
| POST   | `/api/events`                | organizer | create event                                             |
| PUT    | `/api/events/:id`            | organizer | update own event (capacity change keeps sold seats)      |
| DELETE | `/api/events/:id`            | organizer | cancel all its tickets and delete own event              |
| GET    | `/api/events/:id/attendees`  | organizer | confirmed attendees, tickets sold, revenue               |

### Tickets

| Method | Route                      | Token    | Description                                   |
| ------ | -------------------------- | -------- | --------------------------------------------- |
| POST   | `/api/tickets/book`        | attendee | atomic booking, **10 requests / minute**      |
| GET    | `/api/tickets/my-tickets`  | attendee | my tickets, newest first                      |
| POST   | `/api/tickets/:id/cancel`  | attendee | cancel own ticket, seats go back to the event |

### Docs

| Method | Route       | Description       |
| ------ | ----------- | ----------------- |
| GET    | `/api-docs` | Swagger UI        |

## How overselling is prevented

`POST /api/tickets/book` does all of this inside one `db.runTransaction`:

1. read the event
2. reject if it is missing, already over, or `availableTickets < quantity`
3. write `availableTickets - quantity`
4. write the ticket document

If two requests read the same count at the same time, Firestore detects the
conflict on commit and re-runs the losing one with the fresh value, so it
fails with `409` instead of overselling. Cancelling a ticket and changing an
event's capacity use transactions for the same reason.

## Rate limiting

| Scope                   | Limit                    |
| ----------------------- | ------------------------ |
| every `/api/*` route    | 100 requests / 15 min / IP |
| `POST /api/tickets/book`| 10 requests / 1 min / IP   |

Going over returns `429 Too Many Requests`. The booking limiter runs before the
token check, so bots without a valid token are throttled too. Swagger UI is
mounted before the limiter, so browsing the docs is never blocked.

## Status codes

| Code | When                                                       |
| ---- | ---------------------------------------------------------- |
| 200  | read / update / cancel OK                                  |
| 201  | user, event or booking created                             |
| 400  | missing or invalid fields, event already happened          |
| 401  | no token, bad token, wrong login                           |
| 403  | wrong role, or not the owner of the event / ticket         |
| 404  | event, ticket or route not found                           |
| 409  | email already registered, not enough tickets left          |
| 429  | rate limit hit                                             |
| 500  | unexpected server error                                    |

## Testing

- `test.http` has every request in order (VS Code REST Client). Paste the
  tokens and ids returned by earlier calls into the variables at the top.
- Overselling: create an event with `totalCapacity: 5`, then

  ```bash
  node concurrencyTest.js <attendeeToken> <eventId> 8
  ```

  It fires 8 bookings at once: 5 succeed, 3 get `409`, and
  `availableTickets` ends at 0.
- Rate limit: send `POST /api/tickets/book` 11 times within a minute; the 11th
  returns `429`.
