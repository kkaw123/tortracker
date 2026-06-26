# TorTracker Setup Guide

## Step 1: Create Supabase Project (Free)

1. Go to **https://supabase.com** → Sign up (free)
2. Click "New Project"
3. Name: `tortracker` · Region: Southeast Asia (Singapore) · Generate a password
4. Wait ~2 minutes for the project to set up

## Step 2: Run the Database Schema

1. In Supabase dashboard → click **SQL Editor** (left sidebar)
2. Click **New query**
3. Open the file `supabase/schema.sql` from this project
4. Copy ALL the contents and paste into the SQL Editor
5. Click **Run** (green button)
6. You should see "Success. No rows returned."

## Step 3: Set Up Storage Buckets

1. In Supabase → **Storage** (left sidebar)
2. Create bucket: `complaint-photos` → set to **Public**
3. Create bucket: `do-documents` → set to **Public**

## Step 4: Get Your API Keys

1. In Supabase → **Project Settings** → **API**
2. Copy:
   - **Project URL** (looks like: https://abcdefgh.supabase.co)
   - **anon/public key** (long string starting with eyJ...)

## Step 5: Create Your .env File

1. In the `tortracker` folder, copy `.env.example` to `.env`
2. Fill in your keys:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 6: Run Locally

```bash
cd C:\tortracker
npm run dev
```

Open http://localhost:5173 in your browser.

## Step 7: Login with Default Accounts

| Username   | Default Password | Role         | Outlet      |
|------------|-----------------|--------------|-------------|
| boss       | boss1234        | Boss         | All Outlets |
| joey       | joey1234        | Head Supply  | PLT HQ      |
| plt1       | plt11234        | Admin        | PLT HQ      |
| plt2       | plt21234        | Admin        | PLT HQ      |
| kk         | kk001234        | PIC          | SS2         |
| ss2admin   | ss2a1234        | Admin        | SS2         |
| raymond    | ray01234        | PIC          | Cheras      |
| chradmin   | chra1234        | Admin        | Cheras      |
| kc         | kc001234        | PIC          | KD          |
| kdadmin    | kdad1234        | Admin        | KD          |

⚠️ **IMPORTANT: Change all passwords immediately after first login!**
(Update the password_hash in Supabase: Table Editor → users → edit → set new base64 password)

To generate a base64 password: open browser console and type: `btoa("yournewpassword")`

## Step 8: Deploy to Vercel (Free, Online Access)

1. Install Git if not already: https://git-scm.com
2. Create a GitHub account at https://github.com
3. Create a new repository called `tortracker`
4. In `C:\tortracker` folder, open terminal and run:
   ```bash
   git init
   git add .
   git commit -m "Initial TorTracker build"
   git remote add origin https://github.com/YOURUSERNAME/tortracker.git
   git push -u origin main
   ```
5. Go to **https://vercel.com** → Sign up with GitHub
6. Click "Add New Project" → Import your `tortracker` repo
7. In **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
8. Click **Deploy**
9. Vercel gives you a URL like: `https://tortracker-xxx.vercel.app`
   - Share this URL with your outlet staff!

## Important Notes

- **Supabase free tier** pauses after 1 week of inactivity — just visit your Supabase dashboard to unpause
- For production use (no pausing), upgrade to Supabase Pro (~$25/month)
- The system syncs in real-time — all users see the same data instantly
- Always adjust stock before closing for the day via "Daily Adjustment"

## Adding Your Stock Data

### Option A: Import via Excel
1. Log in as any outlet user
2. Go to Stock Inventory → Import button
3. Use this column format in Excel:
   - Brand, Model Code, Color, Size, Type, Category, Quantity, Low Stock Threshold, Cost Price, Selling Price, Supplier

### Option B: Manual Entry
1. Go to Stock Inventory → Add Stock
2. Fill in each frame's details one by one

## User Access Summary

| Role      | Can See                    | Can Edit               |
|-----------|---------------------------|------------------------|
| boss      | All 4 outlets, all data   | View only              |
| joey      | All 4 outlets + complaints| Review complaints      |
| pic       | Own outlet + cost price   | Full outlet management |
| admin     | Own outlet (no cost price)| Stock adjustments only |
