# Windows Setup Guide

## Quick Start for Windows Users

This guide provides Windows-specific instructions for setting up the DoR Gatekeeper application.

---

## Prerequisites

- **Node.js 18+** (Download from https://nodejs.org/)
- **Git** (Download from https://git-scm.com/)

---

## Installation Steps

### 1. Clone the Repository

Open Command Prompt or PowerShell:

```bash
git clone https://github.com/maverick-ali/dor-gatekeeper-repo.git
cd dor-gatekeeper-repo
```

### 2. Install Dependencies

```bash
npm install
```

**Note**: The `better-sqlite3` package has been removed to avoid native compilation issues on Windows.

### 3. Create Environment File

**Using Command Prompt:**
```cmd
echo DATABASE_URL=file:./dev.db > .env
echo ENCRYPTION_KEY=dev-secret-key-32-chars-long!! >> .env
```

**Using PowerShell:**
```powershell
@"
DATABASE_URL=file:./dev.db
ENCRYPTION_KEY=dev-secret-key-32-chars-long!!
"@ | Out-File -FilePath .env -Encoding utf8
```

**Or manually create `.env` file** with:
```
DATABASE_URL=file:./dev.db
ENCRYPTION_KEY=dev-secret-key-32-chars-long!!
```

### 4. Initialize Database

Instead of using `init-db.js`, use Prisma's built-in tools:

```bash
npm run db:push
npm run db:generate
```

This creates all database tables from the Prisma schema.

### 5. Start Development Server

```bash
npm run dev
```

### 6. Open Application

Navigate to: **http://localhost:3000**

### 7. Load Demo Data

Click the **"Load Demo Data"** button on the dashboard to populate the database with sample data.

### 8. Test the Application

Click the **"Scan Issues"** button to see the readiness scoring in action.

---

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:push      # Push schema to database
npm run db:generate  # Generate Prisma client
```

---

## Troubleshooting

### Issue: Port 3000 Already in Use

**Solution 1**: Kill the process using port 3000
```bash
npx kill-port 3000
```

**Solution 2**: Use a different port
```bash
set PORT=3001
npm run dev
```

### Issue: Module Not Found

**Solution**: Reinstall dependencies and regenerate Prisma client
```bash
npm install
npm run db:generate
```

### Issue: Database File Locked

**Solution**: Close all applications that might be accessing the database
```bash
del prisma\dev.db
npm run db:push
```

Then reload demo data from the UI.

### Issue: Permission Errors During Install

**Solution**: Run terminal as Administrator
- Right-click Command Prompt or PowerShell
- Select "Run as Administrator"
- Navigate to project directory
- Run `npm install` again

### Issue: Cannot Create .env File

**Solution**: Manually create the file
1. Open Notepad
2. Type:
   ```
   DATABASE_URL=file:./dev.db
   ENCRYPTION_KEY=dev-secret-key-32-chars-long!!
   ```
3. Save as `.env` (make sure it's not `.env.txt`)
4. Place in project root directory

---

## Viewing the Database

To view and manage the database visually:

```bash
npx prisma studio
```

This opens a browser-based database viewer at http://localhost:5555

---

## Building for Production

### 1. Build the Application
```bash
npm run build
```

### 2. Start Production Server
```bash
npm run start
```

---

## Next Steps

Once the application is running:

1. **Configure Settings**: Visit `/settings` to configure Jira, Slack, and LLM integrations
2. **Customize Rules**: Visit `/rules` to enable/disable DoR criteria
3. **Test Scanning**: Use the mock mode to test without live integrations
4. **Add Real Data**: Configure actual Jira/Slack credentials when ready

---

## Common Windows-Specific Notes

### File Paths
- Use backslashes `\` or forward slashes `/` in Windows paths
- Example: `C:\Users\YourName\Projects\dor-gatekeeper-repo`

### Environment Variables
- Windows uses `set` instead of `export`:
  ```cmd
  set PORT=3001
  ```
- PowerShell uses different syntax:
  ```powershell
  $env:PORT=3001
  ```

### Line Endings
- Git may convert line endings (LF ↔ CRLF)
- This is normal and won't affect functionality

---

## Support

For issues specific to Windows:
- Check the main README.md for general troubleshooting
- GitHub Issues: https://github.com/maverick-ali/dor-gatekeeper-repo/issues

---

## Why No init-db.js?

The original `init-db.js` script used `better-sqlite3`, which requires:
- Visual Studio Build Tools
- Python
- Native C++ compilation

To avoid these Windows-specific compilation issues, we use Prisma's built-in database management instead:
- `npm run db:push` - Creates tables from schema
- `/api/seed` endpoint - Loads demo data via the UI

This approach works identically on Windows, Mac, and Linux without any build tools.
