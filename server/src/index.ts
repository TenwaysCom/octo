import 'reflect-metadata';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'it-pm-assistant-server'
  });
});

// TODO: Import and register controllers
// import { IdentityController } from './modules/identity/identity.controller.js';
// import { MeegleAuthController } from './modules/meegle-auth/meegle-auth.controller.js';
// import { A1Controller } from './modules/a1/a1.controller.js';

// Initialize controllers
// const identityController = new IdentityController();
// const meegleAuthController = new MeegleAuthController();
// const a1Controller = new A1Controller();

// Identity routes
// app.post('/api/identity/resolve', (req, res) => identityController.resolveIdentity(req, res));

// Meegle auth routes
// app.post('/api/meegle/auth/exchange', (req, res) => meegleAuthController.exchangeAuthCode(req, res));
// app.post('/api/meegle/auth/status', (req, res) => meegleAuthController.getTokenStatus(req, res));

// A1 routes
// app.post('/api/a1/analyze', (req, res) => a1Controller.analyze(req, res));
// app.post('/api/a1/create-b2-draft', (req, res) => a1Controller.createB2Draft(req, res));
// app.post('/api/a1/apply-b2', (req, res) => a1Controller.applyB2(req, res));

// TODO: Add A2 routes
// TODO: Add PM analysis routes

app.listen(PORT, () => {
  console.log(`IT PM Assistant Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;
