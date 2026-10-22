// Creates an admin account from the terminal. There is no public sign-up.
//   pnpm --filter @workspace/scripts run create-admin            (owner)
//   pnpm --filter @workspace/scripts run create-admin -- --staff (staff)
// The password is typed at a hidden prompt, never passed as an argument.
import { stdin, stdout } from "node:process";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Export it in this terminal first.");
  process.exit(1);
}

const {
  db,
  pool,
  adminUsersTable,
  adminAuditLogTable,
  hashPassword,
  MIN_PASSWORD_LENGTH,
} = await import("@workspace/db");

const role = process.argv.includes("--staff") ? "staff" : "owner";

if (!stdin.isTTY) {
  console.error("Run this in an interactive terminal.");
  process.exit(1);
}

// Reads one line in raw mode. Hidden input (passwords) is never echoed.
function readLine(prompt: string, hidden = false): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    let value = "";
    const done = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          done();
          resolve(value);
          return;
        }
        if (ch === "\u0003" || ch === "\u0004") {
          done();
          reject(new Error("Cancelled"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0 && !hidden) stdout.write("\b \b");
          value = value.slice(0, -1);
        } else if (ch >= " ") {
          value += ch;
          if (!hidden) stdout.write(ch);
        }
      }
    };
    stdin.on("data", onData);
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const email = (await readLine("Email: ")).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail("That does not look like an email address.");
}
const displayName = (await readLine("Display name: ")).trim();
if (!displayName) fail("A display name is required.");
const password = await readLine(
  `Password (min ${MIN_PASSWORD_LENGTH} characters): `,
  true,
);
const confirm = await readLine("Repeat password: ", true);
if (password !== confirm) fail("Passwords do not match.");
if (password.length < MIN_PASSWORD_LENGTH) {
  fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
}

try {
  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(adminUsersTable)
    .values({ email, displayName, role, passwordHash })
    .onConflictDoNothing()
    .returning({ id: adminUsersTable.id });
  if (!created) {
    console.error(
      `An admin with email ${email} already exists. Nothing changed.`,
    );
    process.exitCode = 1;
  } else {
    await db.insert(adminAuditLogTable).values({
      adminUserId: created.id,
      action: "admin_user.create_cli",
      entityType: "admin_user",
      entityId: String(created.id),
      after: { email, displayName, role },
    });
    console.log(`Created ${role} ${email} (id ${created.id}).`);
  }
} finally {
  await pool.end();
}
