"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck, Wallet } from "lucide-react";
import { createWalletClient, custom } from "viem";

import type { WorkspaceSession } from "@/domain/workspace";
import { BrandMark } from "@/components/brand-mark";

type WalletSignInProps = {
  onAuthenticated(session: WorkspaceSession): void;
};

export function WalletSignIn({ onAuthenticated }: WalletSignInProps) {
  const [walletDetected, setWalletDetected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const detectionTimer = window.setTimeout(() => {
      setWalletDetected(Boolean(window.ethereum));
    }, 0);

    return () => window.clearTimeout(detectionTimer);
  }, []);

  async function signInWithWallet() {
    if (!window.ethereum) {
      setError("Open TendaPay in MiniPay or a browser with an EVM wallet.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const walletClient = createWalletClient({
        transport: custom(window.ethereum),
      });
      const [address] = await walletClient.requestAddresses();

      if (!address) {
        throw new Error("Connect a wallet account before continuing.");
      }

      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const challenge = await challengeResponse.json();

      if (!challengeResponse.ok) {
        throw new Error(challenge.error ?? "Unable to start wallet sign-in.");
      }

      const signature = await walletClient.signMessage({
        account: address,
        message: challenge.message,
      });
      const verificationResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: challenge.message, signature }),
      });
      const verification = await verificationResponse.json();

      if (!verificationResponse.ok) {
        throw new Error(
          verification.error ?? "The wallet signature could not be verified.",
        );
      }

      onAuthenticated(verification.session);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Wallet sign-in failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function openDemoWorkspace() {
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/demo", { method: "POST" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "The demo workspace is unavailable.");
      }

      onAuthenticated(result.session);
    } catch (demoError) {
      setError(
        demoError instanceof Error
          ? demoError.message
          : "The demo workspace is unavailable.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand">
          <BrandMark />
          <strong>TendaPay</strong>
        </div>
        <div>
          <span className="eyebrow">Freelancer access</span>
          <h1 id="auth-title">Open your payment workspace</h1>
          <p>Sign in with the wallet that manages your invoices.</p>
        </div>
        <button
          className="button primary full-width"
          disabled={submitting}
          onClick={signInWithWallet}
        >
          {submitting ? (
            <><LoaderCircle className="spin" size={17} /> Waiting for wallet</>
          ) : (
            <><Wallet size={17} /> Connect wallet</>
          )}
        </button>
        {process.env.NODE_ENV !== "production" ? (
          <button
            className="button secondary full-width"
            disabled={submitting}
            onClick={openDemoWorkspace}
          >
            Open demo workspace
          </button>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}
        <div className="auth-security">
          <ShieldCheck size={15} />
          <span>{walletDetected ? "Wallet detected" : "Read-only until signed in"}</span>
        </div>
      </section>
    </main>
  );
}
