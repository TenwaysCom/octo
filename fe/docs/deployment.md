# FE Deployment

This deployment keeps the FE and Octo API on the same public origin. Nginx
serves the Vite build and proxies `/api` to the Node server.

## Test environment

Build the static files, then copy `fe/dist/` to the web root on the target
server. The test environment uses Nginx on port `18443` and the Octo server on
`127.0.0.1:3040`:

```bash
pnpm --dir server build
pnpm --dir fe build
rsync -a --delete fe/dist/ /srv/octo/fe/dist/
```

Configure the Nginx virtual host. Reuse the environment's existing TLS
certificate paths:

```nginx
server {
    listen 18443 ssl http2;
    server_name octotest.odoo.tenways.it;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    root /srv/octo/fe/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3040;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /health {
        proxy_pass http://127.0.0.1:3040;
        proxy_set_header Host $http_host;
    }

    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Set the Node server callback to the same public origin:

```ini
PORT=3040
LARK_OAUTH_CALLBACK_URL=https://octotest.odoo.tenways.it:18443/api/lark/auth/callback
```

Restart the Node server after deployment, then validate and reload Nginx:

```bash
nginx -t && systemctl reload nginx
```

## Extension package

Package the extension with the same FE origin so its content script can provide
the FE-only presence signal:

```bash
WXT_PUBLIC_OCTO_WEB_ORIGIN=https://octotest.odoo.tenways.it:18443 pnpm --dir extension build
```
