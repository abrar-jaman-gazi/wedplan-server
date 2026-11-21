# WedPlan — Backend API

WedPlan is a wedding planning platform that supports customer and vendor workflows, service listings, bookings, administrator operations, authentication, image uploads, and vendor subscription payments.

This repository contains the **backend API** built with Express, TypeScript, MongoDB, Better Auth, and Stripe.

## Deployment

- **Backend API:** https://wedplan-server-q9x4.onrender.com
- **Health endpoint:** https://wedplan-server-q9x4.onrender.com/api/health
- **Frontend repository:** https://github.com/abrar-jaman-gazi/wedplan-client

## Technology Stack

- Node.js
- TypeScript
- Express 5
- MongoDB 7
- Better Auth with MongoDB adapter
- Stripe for vendor subscription checkout and webhook processing
- Multer for image upload handling
- JOSE
- CORS

## Main Responsibilities

- Authentication and session handling through Better Auth
- Customer and vendor role-based API access
- Public wedding service discovery
- Vendor service management
- Customer booking creation and booking management
- Vendor booking management
- Admin user, service, statistics, and transaction endpoints
- Image upload handling
- Vendor subscription checkout through Stripe
- Stripe webhook processing and transaction persistence
- Database index initialization during server startup

## Project Structure

```text
wedplan-server/
├── src/
│   ├── config/
│   │   ├── auth.ts
│   │   ├── database.ts
│   │   ├── env.ts
│   │   └── stripe.ts
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── types/
│   ├── utils/
│   ├── app.ts
│   └── server.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Requirements

- Node.js (use a current LTS release)
- npm
- MongoDB database
- Google OAuth credentials if Google sign-in is enabled
- Stripe account and API credentials if subscription payments are enabled
- ImgBB API key if the configured image-upload integration requires it

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/abrar-jaman-gazi/wedplan-server.git
cd wedplan-server
npm install
```

## Environment Variables

Create a `.env` file in the project root. Add values from your own development services; do not copy secrets into source control.

```env
PORT=5001
NODE_ENV=development
CLIENT_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:5001
BETTER_AUTH_SECRET=replace_with_a_random_secret_at_least_32_characters
MONGODB_URI=your_mongodb_connection_string
MONGODB_DATABASE=wedplan
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_signing_secret
IMGBB_API_KEY=your_imgbb_api_key
```

Notes:

- `BETTER_AUTH_SECRET` must contain at least 32 characters.
- `CLIENT_URL` must match the frontend origin allowed to call the API.
- `BETTER_AUTH_URL` must be the public base URL of this backend in production.
- Configure the Google OAuth authorized redirect URI to match the Better Auth Google callback URL for the deployed backend. Confirm the exact callback URL in the current Better Auth configuration before changing Google Cloud settings.
- Configure the Stripe webhook destination to point to `https://YOUR_BACKEND_DOMAIN/api/stripe/webhook` and subscribe to the Stripe events handled by the webhook controller.
- Never commit `.env`, production credentials, API keys, database connection strings, or webhook signing secrets.

## Run Locally

Start the development server with file watching:

```bash
npm run dev
```

The default local port is `5001` unless `PORT` is set to another valid port.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run the TypeScript server in watch mode |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Start the compiled server |
| `npm test` | Placeholder script; automated tests are not configured in this package yet |

Build and run the production output:

```bash
npm run build
npm start
```

## API Routes

All application API routes are mounted under `/api`, except the root welcome endpoint.

| Method | Endpoint | Purpose / Access |
|---|---|---|
| `GET` | `/` | API welcome response |
| `GET` | `/api/health` | Health check and MongoDB ping |
| `ALL` | `/api/auth/*` | Better Auth endpoints, including email/password and configured social authentication |
| `GET` | `/api/services` | Public service listing |
| `GET` | `/api/services/:id` | Public service details |
| `POST` | `/api/services` | Create a vendor service (vendor) |
| `GET` | `/api/services/mine` | Get current vendor's services (vendor) |
| `PATCH` | `/api/services/:id` | Update a vendor service (vendor) |
| `DELETE` | `/api/services/:id` | Delete a vendor service (vendor) |
| `POST` | `/api/bookings` | Create a booking (customer) |
| `GET` | `/api/bookings/mine` | Get current customer's bookings (customer) |
| `PATCH` | `/api/bookings/:id/cancel` | Cancel a booking (customer) |
| `GET` | `/api/bookings/vendor` | Get vendor bookings (vendor) |
| `PATCH` | `/api/bookings/:id/status` | Update booking status (vendor) |
| `POST` | `/api/uploads/image` | Upload an image (authenticated customer/vendor) |
| `GET` | `/api/stripe/subscription` | Get vendor subscription (vendor) |
| `GET` | `/api/stripe/transactions` | Get vendor transactions (vendor) |
| `POST` | `/api/stripe/checkout` | Create Stripe Checkout session (vendor) |
| `POST` | `/api/stripe/webhook` | Receive Stripe webhook events |
| `GET` | `/api/admin/stats` | Admin dashboard statistics (admin) |
| `GET` | `/api/admin/users` | Admin user listing (admin) |
| `GET` | `/api/admin/services` | Admin service management (admin) |
| `GET` | `/api/admin/transactions` | Admin transaction listing (admin) |

Additional admin service routes include service detail, approval, rejection, status update, and deletion operations under `/api/admin/services`.

Protected routes require authentication and the appropriate role. See the route and middleware files for the complete access rules and request/response details.

## Stripe Subscription Flow

1. An authenticated vendor requests a checkout session through `/api/stripe/checkout`.
2. The backend creates a Stripe Checkout session using the configured Stripe secret key.
3. Stripe sends event notifications to `/api/stripe/webhook`.
4. The webhook handler verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET` before processing events.
5. Subscription and transaction information is persisted in MongoDB.
6. Authorized admin users can retrieve transaction records through `/api/admin/transactions`.

The application stores and displays only safe, masked card metadata where available (such as brand, last four digits, and expiry month/year). It must not store full card numbers or CVC values.

## Database

The backend connects to MongoDB using `MONGODB_URI` and the database name configured by `MONGODB_DATABASE` (defaults to `wedplan`). Database indexes for bookings, transactions, and processed Stripe events are initialized during startup.

## Deployment

The backend is deployed as a Node.js service on Render.

1. Connect the backend GitHub repository to Render.
2. Set the build command to `npm install && npm run build`.
3. Set the start command to `npm start`.
4. Add all required environment variables in the Render service settings.
5. Set `CLIENT_URL` to the production frontend origin and `BETTER_AUTH_URL` to the public backend URL.
6. Configure Google OAuth redirect settings and the Stripe webhook destination for the deployed backend.
7. Check `/api/health` and review deployment logs after deployment.

## Security Notes

- Keep `.env` out of Git. Use `.env.example` with placeholders if you want to document configuration.
- Never publish `BETTER_AUTH_SECRET`, `MONGODB_URI`, `GOOGLE_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `IMGBB_API_KEY`.
- Verify Stripe webhook signatures before processing events.
- Keep admin and role-protected routes behind authentication and authorization middleware.
- Do not expose full payment-card numbers or CVC values.

## Related Repository

- **Frontend:** https://github.com/abrar-jaman-gazi/wedplan-client
