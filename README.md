# DoR Gatekeeper - Jira Quality Gate

A Next.js application that enforces Definition of Ready (DoR) standards for Jira backlogs with automated scoring, LLM-powered clarifying questions, and async Slack Q&A loops.

## Features

- **Automated Readiness Scoring**: 9 customizable DoR rules with weighted scoring (0-5 scale)
- **LLM-Powered Questions**: AI generates targeted clarifying questions for incomplete issues
- **Slack Integration**: Async DM/channel messaging with interactive Block Kit UI
- **Mock Mode**: Full demo capability without live integrations
- **Multi-Project Support**: Separate rulesets per Jira project
- **Manual Overrides**: Product owners can override readiness scores
- **Audit Logging**: Complete history of all actions and changes

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Database**: SQLite with Prisma 7 ORM
- **Encryption**: AES-256 (crypto-js) for secrets
- **Integrations**: Jira REST API, Slack API, OpenAI/Anthropic LLMs

## Database Schema

- **Settings**: System configuration (singleton)
- **UserMapping**: Jira email ↔ Slack user mappings
- **DorRuleset**: Version-controlled rule collections
- **DorRule**: Individual readiness criteria
- **ScannedIssue**: Issue scan results with scores
- **QaAnswer**: Collected Q&A responses
- **AuditLog**: Full action history

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd dor-gatekeeper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=file:./dev.db
   ENCRYPTION_KEY=your-32-character-secret-key-here
   ```

4. **Initialize the database**
   ```bash
   #node init-db.js
   
   #npx prisma generate

   # 1. Generate Prisma Client (creates TypeScript types)
   npm run db:generate
   
   # 2. Push your schema to the database (creates tables)
   npm run db:push
   ```

5. **Run the development server**
   ```bash
   npm run dev

   # run the ngrok service (to communicate with slack <-> DoR app)
   ngrok http 3000
   ```

6. **Open the application**
   Navigate to [http://localhost:3000](http://localhost:3000)

7. **Load demo data**
   Click the "Load Demo Data" button on the dashboard to populate the database with sample settings, rules, and user mappings.

8. **Scan issues**
   Click the "Scan Issues" button to scan the mock Jira issues and see readiness scores.

## API Endpoints

### Settings
- `GET /api/settings` - Get current settings
- `PUT /api/settings` - Update settings

### User Mappings
- `GET /api/user-mappings` - List all mappings
- `POST /api/user-mappings` - Create new mapping
- `DELETE /api/user-mappings?id={id}` - Delete mapping

### Rules
- `GET /api/rules?projectKey={key}` - Get active ruleset
- `PUT /api/rules` - Update a rule

### Issues
- `GET /api/issues?status={status}&assignee={email}` - List scanned issues
- `GET /api/issues/{id}` - Get single issue

### Scanning
- `POST /api/scan` - Scan Jira issues and calculate scores

### Questions
- `POST /api/questions/generate` - Generate clarifying questions for an issue
- `GET /api/questions/answer?issueId={id}` - Get answers for an issue
- `POST /api/questions/answer` - Submit answer to a question

### Slack
- `POST /api/slack/send` - Send Slack messages with questions
- `POST /api/slack/interact` - Handle Slack interactive components

### Overrides
- `POST /api/issues/override` - Manually override issue readiness status

### Export
- `GET /api/export?format={json|csv}` - Export scan results

### Seed
- `POST /api/seed` - Load demo data (for testing)

## Configuration

### Mock Mode vs Production Mode

**Mock Mode** (default for demo):
- Uses hard-coded sample Jira issues
- Doesn't make external API calls
- Perfect for testing and demos

**Production Mode**:
- Connects to real Jira instance
- Sends actual Slack messages
- Calls LLM APIs for question generation

To switch modes, update the `mockMode` setting in the Settings page.

### Jira Setup

1. Generate a Jira API token from your Atlassian account settings
2. Configure the following in Settings:
   - **Base URL**: Your Atlassian instance URL (e.g., `https://yourcompany.atlassian.net`)
   - **Email**: Your Jira account email
   - **API Token**: The generated API token
   - **Project Keys**: Comma-separated list of project keys to scan (e.g., `DEMO,PROD`)
   - **JQL Query**: Custom JQL to filter issues (e.g., `type = Story AND status = "To Do"`)

### Slack Setup

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable Bot Token Scopes: `chat:write`, `users:read`, `users:read.email`
3. Install app to workspace and get Bot Token
4. Configure in Settings:
   - **Bot Token**: `xoxb-...`
   - **Signing Secret**: From app's Basic Information page
   - **App Token** (optional): For Socket Mode (`xapp-...`)
   - **Default Channel**: Fallback channel for notifications

### LLM Setup

Configure your preferred LLM provider in Settings:
- **Provider**: OpenAI, Anthropic, or Google
- **API Key**: Your API key
- **Model**: Model name (e.g., `gpt-4o-mini`, `claude-3-haiku-20240307`)

## Development

### Build for Production

```bash
npm run build
npm run start
```

### Linting

```bash
npm run lint
```

### Database Management

Generate Prisma client after schema changes:
```bash
npx prisma generate
```

Reset database (warning: deletes all data):
```bash
rm prisma/dev.db
node init-db.js
npx prisma generate
```

## Customizing DoR Rules

Navigate to the Rules page to:
- Enable/disable individual rules
- View rule weights and severity levels
- See detection methods and target fields

Rules are weighted (0-1) and contribute to the final score (0-5 scale).

## Project Structure

```
dor-gatekeeper/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── dev.db                 # SQLite database
├── src/
│   ├── app/
│   │   ├── api/               # API routes
│   │   │   ├── seed/          # Demo data loading
│   │   │   ├── settings/      # Settings CRUD
│   │   │   ├── user-mappings/ # User mappings
│   │   │   ├── rules/         # DoR rules
│   │   │   ├── scan/          # Issue scanning
│   │   │   ├── issues/        # Issue management
│   │   │   ├── questions/     # Q&A generation
│   │   │   ├── slack/         # Slack integration
│   │   │   └── export/        # Data export
│   │   ├── settings/          # Settings page
│   │   ├── rules/             # Rules editor page
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Dashboard
│   │   └── globals.css        # Global styles
│   └── lib/
│       ├── db.ts              # Prisma client
│       ├── crypto.ts          # Encryption utilities
│       └── rules-engine.ts    # Scoring logic
├── init-db.js                 # Database initialization
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

## Troubleshooting

### Database Errors

If you encounter database errors:
```bash
# Recreate database
rm prisma/dev.db
node init-db.js
npx prisma generate
npm run dev
```

### Missing Dependencies

```bash
npm install --legacy-peer-deps
```

### Port Already in Use

Change the default port:
```bash
PORT=3001 npm run dev
```

## Security Notes

- All API tokens and secrets are encrypted in the database using AES-256
- Never commit `.env` files or real credentials to version control
- Use environment variables for production secrets
- Rotate API tokens regularly
- Review audit logs for suspicious activity

## License

[Your License Here]

## Support

For issues and questions, please open a GitHub issue or contact the development team.
