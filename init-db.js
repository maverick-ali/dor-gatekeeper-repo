const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'prisma', 'dev.db');
const db = new Database(dbPath);

// Create all tables based on the schema
db.exec(`
CREATE TABLE IF NOT EXISTS "Settings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "mockMode" BOOLEAN NOT NULL DEFAULT 1,
  "jiraBaseUrl" TEXT NOT NULL DEFAULT '',
  "jiraEmail" TEXT NOT NULL DEFAULT '',
  "jiraApiToken" TEXT NOT NULL DEFAULT '',
  "jiraProjectKeys" TEXT NOT NULL DEFAULT '',
  "jiraJql" TEXT NOT NULL DEFAULT '',
  "slackBotToken" TEXT NOT NULL DEFAULT '',
  "slackSigningSecret" TEXT NOT NULL DEFAULT '',
  "slackAppToken" TEXT NOT NULL DEFAULT '',
  "slackDefaultChannel" TEXT NOT NULL DEFAULT '',
  "llmProvider" TEXT NOT NULL DEFAULT 'openai',
  "llmApiKey" TEXT NOT NULL DEFAULT '',
  "llmModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "UserMapping" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jiraEmail" TEXT NOT NULL UNIQUE,
  "slackUserId" TEXT NOT NULL,
  "slackDisplayName" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "DorRuleset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "DorRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "rulesetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT 1,
  "severity" TEXT NOT NULL DEFAULT 'warn',
  "weight" REAL NOT NULL DEFAULT 1.0,
  "detectionMethod" TEXT NOT NULL DEFAULT 'field_presence',
  "targetField" TEXT NOT NULL DEFAULT '',
  "expectedPattern" TEXT NOT NULL DEFAULT '',
  "minLength" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("rulesetId") REFERENCES "DorRuleset"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "ScannedIssue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jiraKey" TEXT NOT NULL UNIQUE,
  "summary" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "assignee" TEXT NOT NULL DEFAULT '',
  "readinessScore" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'NEEDS_INFO',
  "missingItems" TEXT NOT NULL DEFAULT '[]',
  "questionsGenerated" BOOLEAN NOT NULL DEFAULT 0,
  "slackMessageSent" BOOLEAN NOT NULL DEFAULT 0,
  "manualOverride" BOOLEAN NOT NULL DEFAULT 0,
  "overrideReason" TEXT NOT NULL DEFAULT '',
  "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "QaAnswer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "issueId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "answeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("issueId") REFERENCES "ScannedIssue"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL DEFAULT 'system',
  "changes" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

console.log('Database initialized successfully');
db.close();
