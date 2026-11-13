"use client";

import { useState, type FormEvent } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

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

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("New password must be different.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }

    const user = auth.currentUser;
    if (!user?.email) {
      setError("No authenticated user found.");
      return;
    }

    try {
      setChanging(true);
      if (hasPasswordProvider) {
        const credential = EmailAuthProvider.credential(
          user.email,
          currentPassword
        );
        await reauthenticateWithCredential(user, credential);
      }
      await updatePassword(user, newPassword);
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
