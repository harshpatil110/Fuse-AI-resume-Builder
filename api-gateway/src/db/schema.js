import { pgTable, serial, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  githubId: text('github_id').unique(),
  githubUsername: text('github_username'),
  accessToken: text('access_token'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const resumes = pgTable('resumes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  originalFilePath: text('original_file_path').notNull(),
  generatedJson: jsonb('generated_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const jobDescriptions = pgTable('job_descriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  jdText: text('jd_text').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const githubProfiles = pgTable('github_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),
  repoData: jsonb('repo_data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
