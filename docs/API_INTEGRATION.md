# API Integration

Backend base URL: set `window.BD_API_BASE` before loading the app, e.g.

```js
window.BD_API_BASE = 'http://localhost:3000';
```

Endpoints:

- POST /api/auth/register { email, password }
- POST /api/auth/login { email, password }
- GET /api/auth/me (Bearer token)
- POST /api/auth/change-password { currentPassword, newPassword }
- GET /api/state (Bearer token)
- PUT /api/state { state } (Bearer token)

The frontend can store the returned token and send it as `Authorization: Bearer <token>`.
The backend stores one JSON state blob per authenticated account, preserving the existing app state shape.
