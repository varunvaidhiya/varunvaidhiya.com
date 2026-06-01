
# Deployment Guide: Hosting on Vercel

Since you are using Astro, **Vercel** is the recommended hosting provider. It offers a free tier that is perfect for personal websites.

## Prerequisites
-   A GitHub account (which you have).
-   Your code pushed to GitHub (which we just did).

## Steps to Deploy

1.  **Sign Up / Login**: Go to [vercel.com](https://vercel.com) and sign up using your **GitHub** account.
2.  **Add New Project**:
    -   Click "Add New..." -> "Project".
    -   You should see your repository `varunvaidhiya.me` in the list.
    -   Click **Import** next to it.
3.  **Configure Project**:
    -   Vercel will automatically detect that you are using **Astro**.
    -   Framework Preset: `Astro` (should be auto-selected).
    -   Root Directory: `./` (leave default).
    -   Build Command: `astro build` (default).
    -   Output Directory: `dist` (default).
4.  **Deploy**:
    -   Click **Deploy**.
    -   Wait for the build to finish (usually 1-2 minutes).
5.  **Success!**
    -   Once deployed, Vercel will give you a domain (e.g., `varunvaidhiya.vercel.app`).
    -   You can add your custom domain (`varunvaidhiya.com`) in the Vercel project settings later if you own the domain.

## Updating the Site
Whenever you push new code or a new blog post to your GitHub repository, Vercel will **automatically** rebuild and redeploy your site.
