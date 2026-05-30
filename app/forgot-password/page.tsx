import { Suspense } from "react";
import { AuthForm } from "../../components/auth-form";
import { AuthShell } from "../../components/auth-shell";

export default function ForgotPasswordPage() {
  return <AuthShell><Suspense><AuthForm mode="forgot" /></Suspense></AuthShell>;
}
