# Fly.io Deployment Guide

## Prerequisites

1. Install Fly.io CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Login to Fly.io:
   ```bash
   flyctl auth login
   ```

## Deployment Steps

### 1. Create a new app (if you don't have one)

```bash
flyctl apps create your-app-name
```

Replace `your-app-name` with your desired app name (must be unique).

### 2. Update fly.toml

Edit `fly.toml` and change the app name:
```toml
app = "your-actual-app-name"
```

### 3. Deploy

```bash
flyctl deploy
```

### 4. Set environment variables (if needed)

```bash
flyctl secrets set NODE_ENV=production
```

### 5. Check your app status

```bash
flyctl status
flyctl logs
```

### 6. Get your app URL

```bash
flyctl info
```

Your backend will be available at: `https://your-app-name.fly.dev`

## Update Frontend Configuration

After deployment, update your frontend to point to the Fly.io backend URL:

1. Update `vite.config.ts` proxy target, OR
2. Set `VITE_API_URL` environment variable in your frontend build

## Troubleshooting

- **App not found**: Make sure you created the app first with `flyctl apps create`
- **Build fails**: Check that all dependencies are in `package.json`
- **Port issues**: The server uses `PORT` env var (defaults to 8080 in fly.toml)
- **View logs**: `flyctl logs` to see what's happening

## Free Tier Limits

- 3 shared VMs
- 3GB persistent storage
- Always-on (no sleep)
- 160GB outbound data transfer/month
