import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, checkStoreAdmin } from "@/lib/firebase";

export function AdminLoginPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      const adminCheck = await checkStoreAdmin(credential.user);
      if (!adminCheck.authorized) {
        await signOut(auth);
        setError(
          adminCheck.reason === "missing_document"
            ? `No admin document found for this signed-in account. In Firestore, create admins/${credential.user.uid}.`
            : `The Firestore document admins/${credential.user.uid} must have a string field role set to "admin".`,
        );
        return;
      }
      navigate("/admin");
    } catch (error) {
      console.error("Admin sign-in failed", error);
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error("Failed to clear an unverified admin session", signOutError);
        }
      }
      setError("Sign-in failed. Check your credentials and Firebase setup.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <form
        onSubmit={login}
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-8"
      >
        <p className="text-sm uppercase tracking-[0.3em] text-blue-300">
          UNIQUE
        </p>
        <h1 className="text-3xl font-semibold">Admin Login</h1>
        <p className="text-sm text-slate-400">
          Sign in to manage your store.
        </p>

        <label className="block space-y-2">
          <span className="text-sm">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
          />
        </label>

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-700 p-3 font-semibold hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <Link href="/" className="block text-center text-sm text-slate-400 hover:text-white">
          Return to store
        </Link>
      </form>
    </main>
  );
}
