#!/usr/bin/env node
// Operator CLI for granting/revoking staff roles (ARCHITECTURE_DECISIONS.md
// §4.1: "Until a second administrator exists, staff roles are granted/
// revoked through an audited operator CLI or migration."). Plain Node, no
// ts-node/tsx dependency -- run directly against a real database:
//
//   node scripts/grant-role.mjs --email=you@example.com --role=admin \
//     --actor=operator@example.com --reason="first admin bootstrap"
//
// This is also how the very first admin ever gets created (no chicken-
// and-egg: nothing in the UI can grant a role before one exists).

import { randomUUID } from "node:crypto";
import { Pool } from "pg";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { email, role, actor, reason } = args;
  if (!email || !role || !actor || !reason) {
    console.error(
      "usage: node scripts/grant-role.mjs --email=<email> --role=user|reviewer|admin --actor=<operator email> --reason=<reason>",
    );
    process.exitCode = 1;
    return;
  }
  if (!["user", "reviewer", "admin"].includes(role)) {
    console.error(`invalid role: ${role}`);
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not configured");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const existing = await pool.query(
      "SELECT id, role FROM users WHERE lower(email) = lower($1)",
      [email],
    );
    let userId;
    let beforeRole;
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
      beforeRole = existing.rows[0].role;
      await pool.query("UPDATE users SET role = $1 WHERE id = $2", [
        role,
        userId,
      ]);
    } else {
      const inserted = await pool.query(
        "INSERT INTO users (name, email, role) VALUES (NULL, $1, $2) RETURNING id",
        [email, role],
      );
      userId = inserted.rows[0].id;
      beforeRole = null;
    }

    await pool.query(
      `INSERT INTO audit_records (
         actor_type, actor_id, action, target_type, target_id,
         reason, before_state, after_state, metadata, request_id
       )
       VALUES ('user', $1, 'role_granted', 'user', $2, $3, $4, $5, '{}'::jsonb, $6)`,
      [
        actor,
        String(userId),
        reason,
        beforeRole ? JSON.stringify({ role: beforeRole }) : null,
        JSON.stringify({ role }),
        randomUUID(),
      ],
    );

    console.log(`granted role '${role}' to ${email} (user id ${userId})`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
