"use client";

import { useState, type FormEvent } from "react";

import { customerApi } from "@/lib/customerApiClient";
import { validatePassword } from "@/lib/passwordPolicy";

export function usePasswordSettings(hasPasswordProvider: boolean) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function resetFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (hasPasswordProvider && !currentPassword) {
      setError("Enter your current password.");
      return;
    }
    // Local check for instant feedback; POST /api/user/password enforces the
    // same policy server-side, so this is not the boundary.
    const policy = validatePassword(newPassword);

    if (!policy.valid) {
      setError(policy.errors[0]);
      return;
    }
    if (hasPasswordProvider && currentPassword === newPassword) {
      setError("New password must be different.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }

    try {
      setChanging(true);
      await customerApi<{ success: boolean }>("/api/user/password", {
        method: "POST",
        body: {
          currentPassword: hasPasswordProvider ? currentPassword : undefined,
          newPassword,
        },
      });
      setMessage("Password updated.");
      resetFields();
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to update password."
      );
    } finally {
      setChanging(false);
    }
  }

  return {
    currentPassword,
    newPassword,
    confirmPassword,
    changing,
    message,
    error,
    setCurrentPassword,
    setNewPassword,
    setConfirmPassword,
    submit,
  };
}
