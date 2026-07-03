# Deploy vinline to Railway

This guide walks you through deploying vinline to Railway, where it runs as a Node server and serves the app to others.

## Prerequisites

- A GitHub account with the vinline repo pushed (https://github.com/vargonia/vinline)
- A Railway account (railway.com; sign up is free)
- An Anthropic API key (console.anthropic.com) if you want to set one server-side

## Step 1: Push to GitHub

If not already done:

```bash
git push origin main
```

The repo https://github.com/vargonia/vinline is where Railway will pull from.

## Step 2: Create a Railway Project

1. Go to **railway.com** and log in
2. Click **New Project**
3. Select **Deploy from GitHub repo**
4. Connect your GitHub account (if needed) and select **vargonia/vinline**
5. Railway auto-detects Node via `package.json` and runs `npm start` (which runs `server.js`)
6. Wait for the deployment to complete (2–3 minutes)

## Step 3: Set Environment Variables (Optional)

By default, Railway does **not** set `ANTHROPIC_API_KEY`, which means every visitor must bring their own key (BYOK model). This is recommended for a shared/public instance.

**To set a server-side key for a personal instance:**

1. In Railway, go to your project → **Variables**
2. Add a new variable:
   - Key: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-...` (your real Anthropic key)

**⚠️ WARNING:** If you set a server-side key on a shared URL, anyone with the link can parse invoices on your dime and burn your credits. Only set `ANTHROPIC_API_KEY` if the Railway URL will remain private (e.g., shared only with trusted team members).

For a public or shared instance, leave `ANTHROPIC_API_KEY` unset. Visitors will add their own key in the app's Settings panel.

## Step 4: Generate a Domain

1. In Railway, go to **Networking** → **Domains**
2. Click **Generate Domain** next to your project
3. Copy the https URL (e.g., `https://vinline-prod-12345.up.railway.app`)
4. Note this URL — you'll need it for Google setup and to share with friends

## Step 5: Configure Google Features (Optional)

If you want visitors to use Gmail scanning or Google Drive sync, add the Railway domain to your Google OAuth client:

1. Go to **console.cloud.google.com** → project **vinline-499619**
2. Navigate to **APIs & Services** → **OAuth consent screen** → **Test users**
3. For each friend who needs Gmail/Drive access, click **+ Add user** and paste their email address (up to 100 test users)
4. Go to **APIs & Services** → **Credentials** → OAuth 2.0 Client ID (web)
5. Under **Authorized JavaScript origins**, add the Railway domain (e.g., `https://vinline-prod-12345.up.railway.app`)
6. Find your **Google Picker API key** (under **API keys**) → click to edit
7. Under **Application restrictions**, select **HTTP referrers**
8. Add the Railway domain with a wildcard (e.g., `https://vinline-prod-12345.up.railway.app/*`)
9. Save

Once a friend's email is added as a test user, they can sign in via Google OAuth when they visit the Railway URL.

## Step 6: Verify Deployment

1. Open the Railway domain in your browser (e.g., `https://vinline-prod-12345.up.railway.app`)
2. The browser should redirect to `/app/` and show the vinline interface
3. Click **Settings** (top right)
4. Paste an Anthropic API key into the **Claude API key** field
5. Click **Save**
6. Upload an invoice photo and click **Parse**
7. If parsing succeeds, the deployment is working

## Step 7: Keep it Updated

Every time you push to `main` on GitHub, Railway automatically redeploys. No manual steps needed.

```bash
# Make a change locally
git commit -am "Fix bug X"
git push origin main

# Railway detects the push and redeploys within 1–2 minutes
```

---

## Troubleshooting

### Build fails
Check the Railway **Deployments** log for errors. Common causes:
- **package.json engines mismatch:** Railway runs Node 18+ by default. If `package.json` specifies an older version, update it.
- **Missing dependencies:** Confirm `npm install` works locally and all required packages are in `package.json`.

### Parse returns "API key error" or "Please add your key in Settings"
- **No server-side key set, and user forgot to add their key:** Ask the user to open Settings and paste an Anthropic key.
- **Server-side key is invalid:** Regenerate the key at console.anthropic.com and update the Railway `ANTHROPIC_API_KEY` variable.

### Google OAuth popup blocked or "origin not allowed" error
- **Domain not added to OAuth client:** Confirm the Railway domain is in console.cloud.google.com → OAuth consent screen → **Authorized JavaScript origins**.
- **User not a test user:** If the OAuth client is in **Testing mode**, only emails added as test users can sign in. Add the user's email in **OAuth consent screen** → **Test users**.
- **Picker API key missing referrer:** Confirm the Picker API key includes the Railway domain with `/*` suffix in its referrer restrictions.

### Google Picker shows "Developer key invalid"
- **Picker API not enabled:** Go to console.cloud.google.com → **APIs & Services** → **Enabled APIs & Services**, search for "Picker", and enable it.
- **API key restrictred to wrong referrers:** Edit the Picker API key, confirm the referrer includes `https://vinline-prod-12345.up.railway.app/*`.
- **Key restriction type wrong:** Confirm it's set to "HTTP referrers", not "IP addresses" or "Android/iOS apps".

---

## What next?

Once deployed, you can:
- **Share the URL** with friends and family
- **Monitor usage** in Railway → **Deployments** → **Logs**
- **Update the app** by pushing to main
- **Add a custom domain** in Railway → **Networking** → **Domains** (paid feature)
- **Scale resources** in Railway → **Settings** → **Plan** (default is free tier, sufficient for personal use)
